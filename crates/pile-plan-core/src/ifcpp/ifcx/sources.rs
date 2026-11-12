use super::*;
use crate::import::{advice_capacity_keys, AdviceCapacityKey};

#[derive(Default, Deserialize, Serialize)]
pub(super) struct Provenance {
    #[serde(default)]
    documents: BTreeMap<String, SourceDocument>,
    #[serde(default)]
    advice: Vec<AdviceOrigin>,
    #[serde(default)]
    ownership: BTreeMap<String, BTreeSet<AdviceCapacityKey>>,
    #[serde(default)]
    logs: Vec<LogOrigin>,
    #[serde(default)]
    empty_advice: BTreeMap<String, (String, Option<String>)>,
}

#[derive(Deserialize, Serialize)]
struct LogOrigin {
    signature: Uuid,
    path: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct SourceDocument {
    name: String,
    value: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    embedded: Option<Value>,
}

#[derive(Deserialize, Serialize)]
struct AdviceOrigin {
    key: AdviceCapacityKey,
    path: String,
    name: String,
    default_source: Option<String>,
    sources: Option<Vec<String>>,
}

impl Provenance {
    pub(super) fn remap_cpts(&mut self, mapping: &HashMap<u32, u32>) {
        for row in &mut self.advice {
            if let Some(id) = mapping.get(&row.key.0) {
                row.key.0 = *id;
            }
        }
        for keys in self.ownership.values_mut() {
            *keys = std::mem::take(keys)
                .into_iter()
                .filter_map(|mut key| {
                    key.0 = *mapping.get(&key.0)?;
                    Some(key)
                })
                .collect();
        }
        self.ownership.retain(|_, keys| !keys.is_empty());
    }
}

fn pairs(value: &Value) -> Value {
    let fields: BTreeMap<_, _> = value.as_object().into_iter().flatten().collect();
    Value::Array(
        fields
            .into_iter()
            .map(|(key, value)| json!({"key":key,"value":value}))
            .collect(),
    )
}

fn map(value: &Value) -> Result<Value> {
    let mut entries = BTreeMap::new();
    for pair in items(value) {
        insert_unique(
            &mut entries,
            pair["key"].as_str().unwrap(),
            pair["value"].clone(),
        )?;
    }
    Ok(json!(entries))
}

fn kind(format: &Value) -> &'static str {
    match format.as_str() {
        Some("csv") => "csv",
        Some("xlsx") => "spreadsheet",
        _ => "unknown",
    }
}

fn new_document(file_name: &str, kind: &str) -> SourceDocument {
    SourceDocument {
        name: file_name.into(),
        value: json!({"fileName":file_name, "kind":kind, "worksheets":[]}),
        embedded: None,
    }
}

/// A replacement keeps its advice ID. Occurrences distinguish the original files
/// when one advice import owns multiple documents.
fn log_keys<'a>(logs: impl Iterator<Item = (&'a str, &'a str, &'a str)>) -> Vec<String> {
    let mut occurrences = BTreeMap::<_, Vec<&str>>::new();
    logs.map(|(role, advice, file)| {
        let files = occurrences.entry((role, advice)).or_default();
        let index = files
            .iter()
            .position(|value| *value == file)
            .unwrap_or_else(|| {
                files.push(file);
                files.len() - 1
            });
        format!("log:{role}:{advice}:{index}")
    })
    .collect()
}

fn log_signature(entry: &crate::ProjectImportLogEntry) -> Result<Uuid> {
    let canonical = sort_json(serde_json::to_value(entry)?);
    Ok(Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        canonical.to_string().as_bytes(),
    ))
}

fn advice_owners(
    ownership: &BTreeMap<String, BTreeSet<AdviceCapacityKey>>,
) -> BTreeMap<AdviceCapacityKey, Vec<&str>> {
    let mut owners = BTreeMap::<_, Vec<_>>::new();
    for (path, keys) in ownership {
        for key in keys {
            owners.entry(*key).or_default().push(path.as_str());
        }
    }
    owners
}

fn row_key(value: &Value, millimetres: i64) -> Result<AdviceCapacityKey> {
    Ok((
        number(&value["cpt_id"])?,
        number(&value["pile_size_mm"])?,
        millimetres,
        serde_json::from_value(value["direction"].clone())?,
        value.get("pile_count").map(number).transpose()?,
    ))
}

pub(super) fn write(
    state: &State,
    value: &Value,
    keys: &ProjectTipLevelKeys,
    cpts: &BTreeMap<u32, String>,
    foundation: &mut Node,
    nodes: &mut Vec<Node>,
) -> Result<()> {
    let mut documents = state.sources.documents.clone();
    let managed: BTreeSet<_> = state
        .paths
        .iter()
        .filter(|(key, _)| key.starts_with("log:") || key.starts_with("driving:"))
        .map(|(_, path)| path.as_str())
        .chain(state.sources.logs.iter().map(|log| log.path.as_str()))
        .collect();
    let mut used = BTreeSet::new();
    let logs = items(&value["import_log"]);
    let log_keys = log_keys(logs.iter().map(|log| {
        (
            log["source_role"].as_str().unwrap_or_default(),
            log["profile_details"]["advice_id"]
                .as_str()
                .unwrap_or_default(),
            log["source_file"].as_str().unwrap_or_default(),
        )
    }));
    let mut ownership = BTreeMap::<String, BTreeSet<_>>::new();
    let mut log_items = Vec::new();
    let mut log_origins = BTreeMap::<_, std::collections::VecDeque<_>>::new();
    for origin in &state.sources.logs {
        log_origins
            .entry(origin.signature)
            .or_default()
            .push_back(&origin.path);
    }
    for (log, key) in logs.iter().zip(log_keys) {
        let entry: crate::ProjectImportLogEntry = serde_json::from_value(log.clone())?;
        let signature = log_signature(&entry)?;
        let path = log_origins
            .get_mut(&signature)
            .and_then(|paths| paths.pop_front())
            .cloned()
            .unwrap_or_else(|| state.path(&key));
        used.insert(path.clone());
        let file = log["source_file"].as_str().unwrap();
        let format = kind(&log["source_format"]);
        let document = documents
            .entry(path.clone())
            .or_insert_with(|| new_document(file, format));
        if document.value["fileName"] != file {
            *document = new_document(file, format);
        }
        if format != "unknown" {
            document.value["kind"] = json!(format);
        }
        let worksheets = document.value["worksheets"].as_array_mut().unwrap();
        for sheet in [
            entry.sheet_name.as_ref(),
            entry.profile_details.get("coordinate_sheet"),
            entry.profile_details.get("reaction_sheet"),
        ]
        .into_iter()
        .flatten()
        {
            if !worksheets.iter().any(|value| value == sheet) {
                worksheets.push(json!(sheet));
            }
        }
        if let Some(revision) = entry.profile_details.get("source_revision") {
            document.value["revision"] = json!(revision);
        }
        if let Some(row_keys) = advice_capacity_keys(&entry).filter(|keys| !keys.is_empty()) {
            ownership.entry(path.clone()).or_default().extend(row_keys);
        }
        let mut entry = log.clone();
        let fields = entry.as_object_mut().unwrap();
        fields.remove("source_file");
        fields.insert("mapped_columns".into(), pairs(&log["mapped_columns"]));
        fields.insert("profile_details".into(), pairs(&log["profile_details"]));
        let mut entry = write_shape(entry)?;
        entry["source"] = json!(path);
        log_items.push(entry);
    }
    foundation.set_opps("importLog", json!(log_items));

    if let Some(driving) = value["inputs"].get("pile_driving") {
        let mut wire = write_shape(driving.clone())?;
        for file in wire["files"].as_array_mut().unwrap() {
            let id = file["id"].as_str().unwrap();
            let path = state.path(&format!("driving:{id}"));
            used.insert(path.clone());
            let file_name = file["fileName"].as_str().unwrap();
            let format = kind(&file["format"]);
            let document = documents
                .entry(path.clone())
                .or_insert_with(|| new_document(file_name, format));
            if document.value["fileName"] != file_name {
                *document = new_document(file_name, format);
            }
            document.value["kind"] = json!(format);
            let fields = file.as_object_mut().unwrap();
            fields.remove("fileName");
            fields.remove("format");
            document.embedded =
                Some(json!({"encoding":"base64","data":fields.remove("dataBase64").unwrap()}));
            fields.insert("source".into(), json!(path));
        }
        foundation.set_opps("pileDriving", wire);
    }

    let owners = advice_owners(&ownership);
    let previous_owners = advice_owners(&state.sources.ownership);
    let mut stored_rows = BTreeMap::<_, std::collections::VecDeque<_>>::new();
    for row in &state.sources.advice {
        if owners.get(&row.key) == previous_owners.get(&row.key) {
            stored_rows.entry(row.key).or_default().push_back(row);
        }
    }
    let mut advice: BTreeMap<_, _> = state
        .sources
        .empty_advice
        .iter()
        .map(|(path, (name, source))| (path.clone(), (name.clone(), source.clone(), Vec::new())))
        .collect();
    for (index, (value, mm)) in items(&value["inputs"]["bearing_capacities"])
        .iter()
        .zip(&keys.bearing_capacities)
        .enumerate()
    {
        let key = row_key(value, *mm)?;
        let origin = stored_rows.get_mut(&key).and_then(|rows| rows.pop_front());
        let (path, name, default_source, sources) = if let Some(origin) = origin {
            (
                origin.path.clone(),
                origin.name.clone(),
                origin.default_source.clone(),
                origin.sources.clone(),
            )
        } else {
            let row_owners = owners.get(&key).map_or(&[][..], Vec::as_slice);
            let default_source = row_owners.first().map(|path| (*path).to_owned());
            let path = state.path(&format!(
                "advice:{}",
                default_source.as_deref().unwrap_or_default()
            ));
            let sources = (row_owners.len() > 1)
                .then(|| row_owners.iter().map(|path| (*path).to_owned()).collect());
            (path, "Funderingsadvies".into(), default_source, sources)
        };
        let (cpt, legacy_cpt) = cpts
            .get(&key.0)
            .map_or((Value::Null, json!(key.0)), |path| {
                (json!(path), Value::Null)
            });
        let missing = value["missing"] == true;
        used.extend(default_source.iter().cloned());
        used.extend(sources.iter().flatten().cloned());
        let row = compact([
            ("order", json!(index)),
            ("cpt", cpt),
            ("legacyCptNumber", legacy_cpt),
            ("pileSize", json!(key.1)),
            ("tipLevel", decimal::write(*mm)),
            ("direction", value["direction"].clone()),
            ("pileCount", value["pile_count"].clone()),
            (
                "availability",
                json!(if missing { "missing" } else { "available" }),
            ),
            (
                "resistance",
                if missing {
                    Value::Null
                } else {
                    value["frd_kn"].clone()
                },
            ),
            ("sources", sources.map_or(Value::Null, |paths| json!(paths))),
        ]);
        advice
            .entry(path)
            .or_insert_with(|| (name, default_source, Vec::new()))
            .2
            .push(row);
    }

    for (path, (name, source, entries)) in advice {
        used.extend(source.iter().cloned());
        let mut node = Node::new(path, &name);
        node.set(
            ADVICE,
            compact([
                ("source", source.map_or(Value::Null, |path| json!(path))),
                ("entries", json!(entries)),
            ]),
        );
        foundation.add_child(&name, &node);
        nodes.push(node);
    }
    for (path, document) in documents {
        if managed.contains(path.as_str()) && !used.contains(&path) {
            continue;
        }
        let mut node = Node::new(path, &document.name);
        node.set(SOURCE, document.value);
        if let Some(embedded) = document.embedded {
            node.set(EMBEDDED, embedded);
        }
        foundation.add_child(&document.name, &node);
        nodes.push(node);
    }
    Ok(())
}

pub(super) fn read(
    graph: &Graph,
    state: &mut State,
    inputs: &mut Value,
) -> Result<(Vec<Value>, Vec<i64>)> {
    let foundation = graph.foundation;
    for node in graph.children(foundation, SOURCE) {
        state.sources.documents.insert(
            node.path.clone(),
            SourceDocument {
                name: node
                    .get(NAME)
                    .as_str()
                    .unwrap_or_else(|| node.get(SOURCE)["fileName"].as_str().unwrap())
                    .into(),
                value: node.get(SOURCE).clone(),
                embedded: node.attributes.get(EMBEDDED).cloned(),
            },
        );
    }
    let mut import_log = Vec::new();
    let mut log_sources = Vec::new();
    for entry in items(foundation.opps("importLog")) {
        let source = graph.target(&entry["source"], SOURCE)?;
        let mut log = read_shape(entry)?;
        log.as_object_mut().unwrap().remove("source");
        log["source_file"] = source.get(SOURCE)["fileName"].clone();
        log["mapped_columns"] = map(&entry["mappedColumns"])?;
        log["profile_details"] = map(&entry["profileDetails"])?;
        let entry: crate::ProjectImportLogEntry = serde_json::from_value(log.clone())?;
        state.sources.logs.push(LogOrigin {
            signature: log_signature(&entry)?,
            path: source.path.clone(),
        });
        if let Some(keys) = advice_capacity_keys(&entry).filter(|keys| !keys.is_empty()) {
            state
                .sources
                .ownership
                .entry(source.path.clone())
                .or_default()
                .extend(keys);
        }
        import_log.push(log);
        log_sources.push(source);
    }
    let keys = log_keys(import_log.iter().map(|log| {
        (
            log["source_role"].as_str().unwrap_or_default(),
            log["profile_details"]["advice_id"]
                .as_str()
                .unwrap_or_default(),
            log["source_file"].as_str().unwrap(),
        )
    }));
    for (key, source) in keys.into_iter().zip(log_sources) {
        state.remember(key, source);
    }

    if !foundation.opps("pileDriving").is_null() {
        let mut driving = read_shape(foundation.opps("pileDriving"))?;
        for file in driving["files"].as_array_mut().unwrap() {
            let source = graph.target(&file["source"], SOURCE)?;
            let data = source
                .get(EMBEDDED)
                .get("data")
                .ok_or_else(|| invalid("heistaat source has no embedded file"))?;
            let id = file["id"].as_str().unwrap();
            state.remember(format!("driving:{id}"), source);
            if let Some(document) = state.sources.documents.get_mut(&source.path) {
                document.embedded = None;
            }
            let format = match source.get(SOURCE)["kind"].as_str() {
                Some("spreadsheet") => "xlsx",
                Some("csv") => "csv",
                _ => return Err(invalid("unsupported heistaat source format")),
            };
            file.as_object_mut().unwrap().remove("source");
            file["file_name"] = source.get(SOURCE)["fileName"].clone();
            file["format"] = json!(format);
            file["data_base64"] = data.clone();
        }
        inputs["pile_driving"] = driving;
    }

    let source_path =
        |value: &Value| -> Result<String> { Ok(graph.target(value, SOURCE)?.path.clone()) };
    let mut capacities = BTreeMap::new();
    for node in graph.children(foundation, ADVICE) {
        let advice = node.get(ADVICE);
        let default_source = advice.get("source").map(source_path).transpose()?;
        let advice_name = node.get(NAME).as_str().unwrap_or("Funderingsadvies");
        state.remember(
            format!("advice:{}", default_source.as_deref().unwrap_or_default()),
            node,
        );
        if items(&advice["entries"]).is_empty() {
            state.sources.empty_advice.insert(
                node.path.clone(),
                (advice_name.into(), default_source.clone()),
            );
        }
        for row in items(&advice["entries"]) {
            let missing = row["availability"] == "missing";
            if row.get("resistance").is_some() == missing {
                return Err(invalid("advice availability conflicts with resistance"));
            }
            let mm = decimal::read(&row["tipLevel"])?;
            let capacity = compact([
                (
                    "cpt_id",
                    json!(local_number(graph, row, "cpt", "legacyCptNumber", CPT)?),
                ),
                ("pile_size_mm", row["pileSize"].clone()),
                ("pile_tip_level_m", json!(decimal::metres(mm))),
                ("direction", row["direction"].clone()),
                ("pile_count", row["pileCount"].clone()),
                (
                    "frd_kn",
                    if missing {
                        json!(0)
                    } else {
                        row["resistance"].clone()
                    },
                ),
                ("missing", json!(missing)),
            ]);
            let sources = row
                .get("sources")
                .map(|value| {
                    items(value)
                        .iter()
                        .map(source_path)
                        .collect::<Result<Vec<_>>>()
                })
                .transpose()?;
            let origin = AdviceOrigin {
                key: row_key(&capacity, mm)?,
                path: node.path.clone(),
                name: advice_name.into(),
                default_source: default_source.clone(),
                sources,
            };
            insert_unique(
                &mut capacities,
                order(&row["order"])?,
                (capacity, mm, origin),
            )?;
        }
    }
    let mut bearing = Vec::new();
    let mut keys = Vec::new();
    for (capacity, mm, origin) in capacities.into_values() {
        bearing.push(capacity);
        keys.push(mm);
        state.sources.advice.push(origin);
    }
    inputs["bearing_capacities"] = json!(bearing);
    Ok((import_log, keys))
}
