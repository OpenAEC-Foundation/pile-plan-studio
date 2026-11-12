mod decimal;
mod graph;
mod plans;
mod sources;

use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use uuid::Uuid;

use self::graph::*;
use super::{IfcppError, CURRENT_SCHEMA_VERSION};
use crate::{PilePlanProject, ProjectTipLevelKeys};

type Result<T> = std::result::Result<T, IfcppError>;

fn invalid(message: impl std::fmt::Display) -> IfcppError {
    IfcppError::Json(<serde_json::Error as serde::de::Error>::custom(message))
}

/// Persisted codec data travels through the application as an opaque JSON string.
/// Its exact keys and original paths are separate from the editable engineering data.
#[derive(Default, Deserialize, Serialize)]
pub(crate) struct State {
    pub root: Uuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    timestamp: Option<String>,
    #[serde(default)]
    paths: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keys: Option<ProjectTipLevelKeys>,
    #[serde(default)]
    sources: sources::Provenance,
}

impl State {
    pub(crate) fn new_project() -> Self {
        Self {
            root: Uuid::new_v4(),
            timestamp: Some(serialization_timestamp()),
            ..Self::default()
        }
    }

    pub fn for_project(project: &PilePlanProject) -> Result<Self> {
        if let Some(state) = &project.ifcx_state {
            return Ok(serde_json::from_str(state)?);
        }
        let value = sort_json(serde_json::to_value(project)?);
        Ok(Self {
            root: Uuid::new_v5(
                &Uuid::NAMESPACE_URL,
                format!("urn:example:ifcpp:1.0.0:{}", value).as_bytes(),
            ),
            timestamp: (project.metadata.created_at.is_none()
                && project.metadata.modified_at.is_none())
            .then(serialization_timestamp),
            ..Self::default()
        })
    }

    fn path(&self, key: &str) -> String {
        self.paths
            .get(key)
            .cloned()
            .unwrap_or_else(|| Uuid::new_v5(&self.root, key.as_bytes()).to_string())
    }

    fn remember(&mut self, key: String, node: &Node) {
        self.paths.insert(key, node.path.clone());
    }
}

fn serialization_timestamp() -> String {
    use time::{format_description::well_known::Rfc3339, OffsetDateTime};
    let seconds = web_time::SystemTime::now()
        .duration_since(web_time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    OffsetDateTime::from_unix_timestamp(seconds as i64)
        .expect("system clock is within the supported calendar range")
        .format(&Rfc3339)
        .expect("UTC timestamp is valid RFC 3339")
}

pub(crate) fn preserved_tip_keys(project: &PilePlanProject) -> Option<ProjectTipLevelKeys> {
    let state: State = serde_json::from_str(project.ifcx_state.as_deref()?).ok()?;
    state.keys
}

pub(crate) fn remap_input_identity(
    current: &PilePlanProject,
    refreshed: &mut PilePlanProject,
    point_mapping: &HashMap<u32, u32>,
    cpt_mapping: &HashMap<u32, u32>,
) -> Result<()> {
    let mut state = State::for_project(current)?;
    let previous = std::mem::take(&mut state.paths);
    let path = |key: &str| {
        previous
            .get(key)
            .cloned()
            .unwrap_or_else(|| Uuid::new_v5(&state.root, key.as_bytes()).to_string())
    };
    state.paths = previous
        .iter()
        .filter(|(key, _)| {
            !["load-point:", "cpt:", "pile:"]
                .iter()
                .any(|prefix| key.starts_with(prefix))
        })
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    let reverse_points: HashMap<_, _> = point_mapping
        .iter()
        .map(|(old, new)| (*new, *old))
        .collect();
    let reverse_cpts: HashMap<_, _> = cpt_mapping.iter().map(|(old, new)| (*new, *old)).collect();
    let refreshed_path = |key: &str, previous_key: Option<String>| {
        previous_key.map_or_else(
            || {
                Uuid::new_v5(
                    &state.root,
                    format!("refresh:{key}:{}", path(key)).as_bytes(),
                )
                .to_string()
            },
            |old| path(&old),
        )
    };
    for point in &refreshed.inputs.load_points {
        let key = format!("load-point:{}", point.id);
        let old = reverse_points
            .get(&point.id)
            .map(|id| format!("load-point:{id}"));
        state.paths.insert(key.clone(), refreshed_path(&key, old));
    }
    for cpt in &refreshed.inputs.cpts {
        let key = format!("cpt:{}", cpt.id);
        let old = reverse_cpts.get(&cpt.id).map(|id| format!("cpt:{id}"));
        state.paths.insert(key.clone(), refreshed_path(&key, old));
    }
    for plan in &refreshed.user_state.pile_plans {
        for (point, choice) in &plan.selected_piles {
            if choice.pile.is_some() && reverse_points.contains_key(point) {
                let key = plans::pile_key(&plan.id, *point);
                let old = plans::pile_key(&plan.id, reverse_points[point]);
                state.paths.insert(key, path(&old));
            }
        }
    }
    state.sources.remap_cpts(cpt_mapping);
    refreshed.ifcx_state = Some(serde_json::to_string(&state)?);
    Ok(())
}

pub(crate) fn projected_key(value: f64, index: usize, preserved: &[i64]) -> Option<i64> {
    let matches = |key: i64| decimal::metres(key).to_bits() == value.to_bits();
    if let Some(key) = preserved.get(index).copied().filter(|key| matches(*key)) {
        return Some(key);
    }
    let mut candidates = preserved.iter().copied().filter(|key| matches(*key));
    let key = candidates.next()?;
    candidates.all(|candidate| candidate == key).then_some(key)
}

fn sort_json(value: Value) -> Value {
    match value {
        Value::Object(fields) => {
            let fields: BTreeMap<_, _> = fields
                .into_iter()
                .map(|(key, value)| (key, sort_json(value)))
                .collect();
            Value::Object(fields.into_iter().collect())
        }
        Value::Array(items) => Value::Array(items.into_iter().map(sort_json).collect()),
        value => value,
    }
}

fn write_shape(value: Value) -> Result<Value> {
    map_shape(value, true)
}

fn read_shape(value: &Value) -> Result<Value> {
    map_shape(value.clone(), false)
}

// The two wire shapes use the same nested fields with the explicit exceptions below.
// Only known profile payloads use this conversion. Free-form import maps have their
// own representation and are kept out of this mapping.
fn map_shape(value: Value, writing: bool) -> Result<Value> {
    match value {
        Value::Array(items) => Ok(Value::Array(
            items
                .into_iter()
                .map(|item| map_shape(item, writing))
                .collect::<Result<_>>()?,
        )),
        Value::Object(fields) => {
            let mut object = Map::new();
            for (key, value) in fields {
                if value.is_null() {
                    continue;
                }
                let exceptions = [
                    ("pile_size_mm", "pileSize"),
                    ("fixed_pile_size_mm", "fixedPileSize"),
                    ("pile_tip_level_mm", "tipLevel"),
                    ("load_point_ids", "loadPointNumbers"),
                    ("load_point_id", "loadPointNumber"),
                ];
                let name = if writing {
                    exceptions
                        .iter()
                        .find(|(rust, _)| *rust == key)
                        .map(|(_, wire)| wire.to_string())
                        .unwrap_or_else(|| camel(&key))
                } else {
                    exceptions
                        .iter()
                        .find(|(_, wire)| *wire == key)
                        .map(|(rust, _)| rust.to_string())
                        .unwrap_or_else(|| snake(&key))
                };
                let rust_key = if writing { key.as_str() } else { name.as_str() };
                let value = match (rust_key, writing) {
                    ("pile_tip_level_mm", true) => decimal::write(
                        value
                            .as_i64()
                            .ok_or_else(|| invalid("invalid millimetre key"))?,
                    ),
                    ("pile_tip_level_mm", false) => json!(decimal::read(&value)?),
                    (
                        "cost" | "budget" | "score_milli" | "header_row" | "first_data_row"
                        | "column",
                        true,
                    ) => {
                        let number = value
                            .as_u64()
                            .or_else(|| value.as_str()?.parse::<u64>().ok())
                            .ok_or_else(|| invalid(format!("invalid {rust_key}")))?;
                        json!(number.to_string())
                    }
                    (
                        "cost" | "budget" | "score_milli" | "header_row" | "first_data_row"
                        | "column",
                        false,
                    ) => {
                        json!(value
                            .as_str()
                            .and_then(|text| text.parse::<u64>().ok())
                            .ok_or_else(|| invalid(format!("invalid {rust_key}")))?)
                    }
                    _ => map_shape(value, writing)?,
                };
                object.insert(name, value);
            }
            Ok(Value::Object(object))
        }
        scalar => Ok(scalar),
    }
}

fn camel(key: &str) -> String {
    let mut parts = key.split('_');
    let mut name = parts.next().unwrap_or_default().to_owned();
    for part in parts {
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            name.extend(first.to_uppercase());
            name.push_str(chars.as_str());
        }
    }
    name
}

fn snake(key: &str) -> String {
    let mut name = String::new();
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            name.push('_');
        }
        name.push(c.to_ascii_lowercase());
    }
    name
}

fn compact<const N: usize>(fields: [(&str, Value); N]) -> Value {
    Value::Object(
        fields
            .into_iter()
            .filter(|(_, value)| !value.is_null())
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}

fn items(value: &Value) -> &[Value] {
    value.as_array().map_or(&[], Vec::as_slice)
}

fn ordered(value: &Value) -> Result<BTreeMap<u32, &Value>> {
    value
        .as_object()
        .into_iter()
        .flatten()
        .map(|(key, value)| {
            Ok((
                key.parse()
                    .map_err(|_| invalid("invalid location number"))?,
                value,
            ))
        })
        .collect()
}

fn number(value: &Value) -> Result<u32> {
    value
        .as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(|| invalid("expected a u32 identifier"))
}

fn order(value: &Value) -> Result<usize> {
    value
        .as_u64()
        .and_then(|n| usize::try_from(n).ok())
        .ok_or_else(|| invalid("expected an order index"))
}

fn insert_unique<K: Ord + std::fmt::Display, V>(
    map: &mut BTreeMap<K, V>,
    key: K,
    value: V,
) -> Result<()> {
    use std::collections::btree_map::Entry;
    match map.entry(key) {
        Entry::Vacant(slot) => {
            slot.insert(value);
            Ok(())
        }
        Entry::Occupied(slot) => Err(invalid(format!("duplicate identity {}", slot.key()))),
    }
}

fn name(node: &Node) -> Result<&str> {
    node.get(NAME)
        .as_str()
        .ok_or_else(|| invalid(format!("missing name for {}", node.path)))
}

fn reference_number(graph: &Graph, reference: &Value, role: &str) -> Result<u32> {
    number(&graph.target(reference, role)?.get(role)["number"])
}

fn local_number(
    graph: &Graph,
    value: &Value,
    reference: &str,
    legacy: &str,
    role: &str,
) -> Result<u32> {
    match (value.get(reference), value.get(legacy)) {
        (Some(reference), None) => reference_number(graph, reference, role),
        (None, Some(number_value)) => number(number_value),
        _ => Err(invalid(format!("expected one of {reference} and {legacy}"))),
    }
}

fn location(id: u32, paths: &BTreeMap<u32, String>) -> Value {
    paths.get(&id).map_or_else(
        || json!({"legacyLoadPointNumber": id}),
        |path| json!({"loadPoint": path}),
    )
}

fn split_references(
    ids: &[Value],
    paths: &BTreeMap<u32, String>,
) -> Result<(Vec<Value>, Vec<Value>)> {
    let mut references = Vec::new();
    let mut legacy = Vec::new();
    for id in ids {
        if let Some(path) = paths.get(&number(id)?) {
            references.push(json!(path));
        } else {
            legacy.push(id.clone());
        }
    }
    Ok((references, legacy))
}

fn read_references(graph: &Graph, refs: &Value, legacy: &Value, role: &str) -> Result<Vec<u32>> {
    items(refs)
        .iter()
        .map(|value| reference_number(graph, value, role))
        .chain(items(legacy).iter().map(number))
        .collect()
}

pub(super) fn write(project: &PilePlanProject, keys: &ProjectTipLevelKeys) -> Result<String> {
    let state = State::for_project(project)?;
    let value = serde_json::to_value(project)?;
    let metadata = &value["metadata"];
    let units = &value["units"];
    let settings = &value["settings"];
    let user = &value["user_state"];

    let mut root = Node::new(state.root.to_string(), &project.metadata.name);
    root.set(CLASS, class("IfcProject"));
    let mut legacy_units = Map::new();
    for (rust, wire, default) in [
        ("coordinates", "coordinates", "mm"),
        ("design_loads", "designLoads", "kN"),
        ("bearing_capacities", "bearingCapacities", "kN"),
        ("pile_tip_levels", "pileTipLevels", "m"),
    ] {
        if units[rust] != default {
            legacy_units.insert(wire.into(), units[rust].clone());
        }
    }
    root.set(
        DOCUMENT,
        compact([
            ("format", json!("IFCPP")),
            ("application", value["application"].clone()),
            (
                "legacyUnitLabels",
                if legacy_units.is_empty() {
                    Value::Null
                } else {
                    Value::Object(legacy_units)
                },
            ),
        ]),
    );
    root.set(UNITS, json!({"coordinates":"mm","force":"kN","pileSize":"mm","levels":"m","costs":units["costs"]}));
    let mut metadata = write_shape(metadata.clone())?;
    root.set(
        EXTERNAL,
        metadata
            .as_object_mut()
            .unwrap()
            .remove("externalReferences")
            .unwrap_or_default(),
    );
    metadata.as_object_mut().unwrap().remove("name");
    root.set(METADATA, metadata);

    let mut foundation = Node::new(state.path("foundation"), "Fundering");
    root.add_child("Fundering", &foundation);
    foundation.set(
        DESIGN,
        compact([("pileHeadLevel", settings["pile_head_level_m"].clone())]),
    );
    foundation.set_opps(
        "cptRules",
        write_shape(settings["global_cpt_selection"].clone())?,
    );
    foundation.set_opps("pileCosts", write_shape(settings["pile_costs"].clone())?);
    foundation.set_opps(
        "optimizerSettings",
        write_shape(settings["ilp_optimization"].clone())?,
    );
    foundation.set_opps("viewerUtilization", settings["viewer_utilization"].clone());
    let mut legend = write_shape(settings["pile_legend"].clone())?;
    if let Some(levels) = legend
        .get_mut("pileTipLevels")
        .and_then(Value::as_array_mut)
    {
        for (entry, key) in levels.iter_mut().zip(&keys.legend) {
            entry["value"] = decimal::write(*key);
        }
    }
    foundation.set_opps("legend", legend);

    let mut nodes = Vec::new();
    let mut cpts = BTreeMap::new();
    for (index, cpt) in project.inputs.cpts.iter().enumerate() {
        let mut node = Node::new(state.path(&format!("cpt:{}", cpt.id)), &cpt.name);
        insert_unique(&mut cpts, cpt.id, node.path.clone())?;
        node.set(CPT, json!({"number": cpt.id, "x": cpt.x_mm, "y": cpt.y_mm}));
        node.set(ORDER, json!(index));
        foundation.add_child(&cpt.name, &node);
        nodes.push(node);
    }

    let rules = ordered(&settings["cpt_selection_by_load_point"])?;
    let manual = ordered(&user["manual_cpt_selections"])?;
    let mut points = BTreeMap::new();
    for (index, point) in project.inputs.load_points.iter().enumerate() {
        let mut node = Node::new(state.path(&format!("load-point:{}", point.id)), &point.name);
        insert_unique(&mut points, point.id, node.path.clone())?;
        let mut tension = serde_json::to_value(&point.tension)?;
        if let Some(value) = tension.as_object_mut().unwrap().remove("value_kn") {
            tension["value"] = value;
        }
        node.set(LOAD_POINT, json!({"number":point.id,"x":point.x_mm,"y":point.y_mm,"fed":point.design_load_kn,"tension":tension}));
        node.set(ORDER, json!(index));
        if let Some(value) = rules.get(&point.id) {
            node.set_opps("cptRules", write_shape((*value).clone())?);
        }
        if let Some(value) = manual.get(&point.id) {
            let (refs, legacy) = split_references(items(value), &cpts)?;
            node.set(
                SELECTION,
                compact([
                    ("method", json!("manual")),
                    ("cpts", json!(refs)),
                    (
                        "legacyCptNumbers",
                        if legacy.is_empty() {
                            Value::Null
                        } else {
                            json!(legacy)
                        },
                    ),
                ]),
            );
        }
        foundation.add_child(&point.name, &node);
        nodes.push(node);
    }
    let legacy_locations: Vec<_> = rules
        .keys()
        .chain(manual.keys())
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .filter(|id| !points.contains_key(id))
        .map(|id| {
            Ok(compact([
                ("loadPointNumber", json!(id)),
                (
                    "rules",
                    write_shape(rules.get(&id).copied().cloned().unwrap_or_default())?,
                ),
                (
                    "manualCptNumbers",
                    manual.get(&id).copied().cloned().unwrap_or_default(),
                ),
            ]))
        })
        .collect::<Result<_>>()?;
    if !legacy_locations.is_empty() {
        foundation.set_opps("legacyLocationSettings", json!(legacy_locations));
    }

    let grouping = &settings["load_point_grouping"];
    let groups = |field| -> Result<Vec<Value>> {
        items(&grouping[field])
            .iter()
            .map(|entry| {
                let (members, legacy) = split_references(items(&entry["load_point_ids"]), &points)?;
                if !legacy.is_empty() {
                    return Err(invalid("group contains an unknown load point"));
                }
                Ok(json!(members))
            })
            .collect()
    };
    foundation.set_opps(
        "grouping",
        json!({
            "automatic":grouping["automatic"], "maxEdgeDistanceMm":grouping["max_edge_distance_mm"],
            "manualGroups":groups("manual_groups")?, "ungroupedGroups":groups("ungrouped_groups")?,
        }),
    );

    sources::write(&state, &value, keys, &cpts, &mut foundation, &mut nodes)?;
    let active = plans::write(&state, user, keys, &points, &mut foundation, &mut nodes)?;
    let mut view = write_shape(settings["viewer"].clone())?;
    view["plan"] = json!(active);
    foundation.set_opps("planView", view);

    let mut data = vec![root, foundation];
    data.extend(nodes);
    let envelope = Envelope::new(
        state.root.to_string(),
        project
            .metadata
            .author
            .clone()
            .or(state.author)
            .unwrap_or_else(|| project.application.name.clone()),
        project
            .metadata
            .modified_at
            .clone()
            .or_else(|| project.metadata.created_at.clone())
            .or(state.timestamp)
            .unwrap_or_else(serialization_timestamp),
        data,
    );
    Graph::new(&envelope)?;
    Ok(serde_json::to_string_pretty(&envelope)?)
}

fn class(code: &str) -> Value {
    json!({"code":code,"uri":format!("https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/{code}")})
}

pub(super) fn read(input: &str) -> Result<PilePlanProject> {
    let envelope: Envelope = serde_json::from_str(input)?;
    let graph = Graph::new(&envelope)?;
    let root = graph.root;
    let foundation = graph.foundation;
    let mut state = State {
        root: Uuid::parse_str(&root.path).unwrap(),
        ..State::default()
    };
    state.remember("foundation".into(), foundation);

    let mut metadata = read_shape(root.get(METADATA))?;
    if metadata.is_null() {
        metadata = json!({});
    }
    if metadata.get("author").is_none() {
        state.author = Some(envelope.header.author.clone());
    }
    if metadata.get("created_at").is_none() && metadata.get("modified_at").is_none() {
        state.timestamp = Some(envelope.header.timestamp.clone());
    }
    metadata["name"] = json!(name(root)?);
    metadata["external_references"] = read_shape(root.get(EXTERNAL))?
        .as_array()
        .cloned()
        .map(Value::Array)
        .unwrap_or_else(|| json!([]));
    let document = root.get(DOCUMENT);
    let application = document.get("application").cloned().unwrap_or_else(|| {
        json!({
            "name":crate::APPLICATION_NAME, "version":env!("CARGO_PKG_VERSION")
        })
    });
    let labels = &document["legacyUnitLabels"];
    let unit =
        |key: &str, default: &str| labels.get(key).cloned().unwrap_or_else(|| json!(default));
    let units = json!({
        "coordinates":unit("coordinates", "mm"), "design_loads":unit("designLoads","kN"),
        "bearing_capacities":unit("bearingCapacities","kN"), "pile_tip_levels":unit("pileTipLevels","m"),
        "costs":root.get(UNITS)["costs"],
    });

    let mut load_points = BTreeMap::new();
    let mut cpts = BTreeMap::new();
    let mut point_ids = BTreeSet::new();
    let mut cpt_ids = BTreeSet::new();
    let mut rules = BTreeMap::new();
    let mut manual = BTreeMap::new();
    for node in graph.children(foundation, LOAD_POINT) {
        let point = node.get(LOAD_POINT);
        let id = number(&point["number"])?;
        if !point_ids.insert(id) {
            return Err(invalid(format!("duplicate load point number {id}")));
        }
        state.remember(format!("load-point:{id}"), node);
        let mut tension = point
            .get("tension")
            .cloned()
            .unwrap_or_else(|| json!({"state":"not_imported"}));
        let known = tension["state"] == "known";
        let demand = tension.as_object_mut().unwrap().remove("value");
        if demand.is_some() != known {
            return Err(invalid("inconsistent tension state and value"));
        }
        if let Some(value) = demand {
            tension["value_kn"] = value;
        }
        insert_unique(
            &mut load_points,
            order(node.get(ORDER))?,
            json!({
                "id":id,"name":name(node)?,"x_mm":point["x"],"y_mm":point["y"],"design_load_kn":point["fed"],"tension":tension,
            }),
        )?;
        if !node.opps("cptRules").is_null() {
            rules.insert(id, read_shape(node.opps("cptRules"))?);
        }
        let selection = node.get(SELECTION);
        if !selection.is_null() {
            manual.insert(
                id,
                read_references(
                    &graph,
                    &selection["cpts"],
                    &selection["legacyCptNumbers"],
                    CPT,
                )?,
            );
        }
    }
    for node in graph.children(foundation, CPT) {
        let cpt = node.get(CPT);
        let id = number(&cpt["number"])?;
        if !cpt_ids.insert(id) {
            return Err(invalid(format!("duplicate CPT number {id}")));
        }
        state.remember(format!("cpt:{id}"), node);
        insert_unique(
            &mut cpts,
            order(node.get(ORDER))?,
            json!({"id":id,"name":name(node)?,"x_mm":cpt["x"],"y_mm":cpt["y"]}),
        )?;
    }
    for entry in items(foundation.opps("legacyLocationSettings")) {
        let id = number(&entry["loadPointNumber"])?;
        if point_ids.contains(&id) {
            return Err(invalid("legacy settings refer to a current load point"));
        }
        if let Some(value) = entry.get("rules") {
            insert_unique(&mut rules, id, read_shape(value)?)?;
        }
        if let Some(value) = entry.get("manualCptNumbers") {
            insert_unique(&mut manual, id, serde_json::from_value(value.clone())?)?;
        }
    }

    let grouping = foundation.opps("grouping");
    let groups =
        |field| -> Result<Vec<Value>> {
            items(&grouping[field]).iter().map(|members| Ok(json!({
            "load_point_ids":read_references(&graph, members, &Value::Null, LOAD_POINT)?,
        }))).collect()
        };
    let grouping = if grouping.is_null() {
        serde_json::to_value(crate::LoadPointGroupingSettings::default())?
    } else {
        json!({"automatic":grouping["automatic"],"max_edge_distance_mm":grouping["maxEdgeDistanceMm"],
            "manual_groups":groups("manualGroups")?, "ungrouped_groups":groups("ungroupedGroups")?})
    };
    let legend = foundation.opps("legend");
    let mut legacy_legend = read_shape(legend)?;
    let legend_keys = items(&legend["pileTipLevels"])
        .iter()
        .map(|entry| decimal::read(&entry["value"]))
        .collect::<Result<Vec<_>>>()?;
    if let Some(levels) = legacy_legend
        .get_mut("pile_tip_levels")
        .and_then(Value::as_array_mut)
    {
        for (entry, key) in levels.iter_mut().zip(&legend_keys) {
            entry["value"] = json!(decimal::metres(*key));
        }
    }

    let mut inputs = json!({"load_points":load_points.into_values().collect::<Vec<_>>(),"cpts":cpts.into_values().collect::<Vec<_>>()});
    let (import_log, bearing_keys) = sources::read(&graph, &mut state, &mut inputs)?;
    let (plans, plan_keys) = plans::read(&graph, &mut state, &point_ids)?;
    let view = foundation.opps("planView");
    let active = graph.target(&view["plan"], PLAN)?.get(PLAN)["variantId"].clone();
    let mut viewer = read_shape(view)?;
    viewer.as_object_mut().unwrap().remove("plan");
    state.keys = Some(ProjectTipLevelKeys {
        bearing_capacities: bearing_keys,
        pile_plans: plan_keys,
        legend: legend_keys,
    });

    let project = json!({
        "schema":"IFCPP","schema_version":CURRENT_SCHEMA_VERSION,"application":application,"metadata":metadata,"units":units,
        "inputs":inputs,"settings":{
            "global_cpt_selection":if foundation.opps("cptRules").is_null() {
                json!({"algorithm":"quadrants","max_distance_m":25,"monopoly_distance_m":1,"max_angle_degrees":120})
            } else { read_shape(foundation.opps("cptRules"))? },
            "cpt_selection_by_load_point":rules,"load_point_grouping":grouping,
            "pile_head_level_m":foundation.get(DESIGN)["pileHeadLevel"], "pile_costs":if foundation.opps("pileCosts").is_null() { json!({"schema_version":2,"items":[]}) }
                else { read_shape(foundation.opps("pileCosts"))? },
            "viewer_utilization":foundation.attributes.get("openaec::opps::viewerUtilization").cloned()
                .unwrap_or_else(|| json!({"minimum":0,"maximum":1})),"pile_legend":legacy_legend,
            "ilp_optimization":read_shape(foundation.opps("optimizerSettings"))?,"viewer":viewer,
        },
        "user_state":{"pile_plans":plans,"active_pile_plan_id":active,"manual_cpt_selections":manual},
        "import_log":import_log,"ifcx_state":serde_json::to_string(&state)?,
    });
    Ok(serde_json::from_value(project)?)
}
