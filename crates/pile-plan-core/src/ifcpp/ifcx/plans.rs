use super::*;
use crate::PilePlanTipLevelKeys;

pub(super) fn write(
    state: &State,
    user: &Value,
    keys: &ProjectTipLevelKeys,
    points: &BTreeMap<u32, String>,
    foundation: &mut Node,
    nodes: &mut Vec<Node>,
) -> Result<String> {
    let mut active = None;
    for (index, plan) in items(&user["pile_plans"]).iter().enumerate() {
        let id = plan["id"]
            .as_str()
            .ok_or_else(|| invalid("missing pile plan id"))?;
        let name = plan["name"]
            .as_str()
            .ok_or_else(|| invalid("missing pile plan name"))?;
        let mut node = Node::new(state.path(&format!("plan:{id}")), name);
        if user["active_pile_plan_id"] == id {
            active = Some(node.path.clone());
        }
        node.set(PLAN, json!({"variantId":id}));
        let (locks, legacy_locks) =
            split_references(items(&plan["locked_load_point_ids"]), points)?;
        node.set_opps(
            "planSettings",
            compact([
                ("order", json!(index)),
                ("activePileSizes", plan["active_pile_sizes"].clone()),
                (
                    "activeTipLevels",
                    json!(keys.pile_plans[index]
                        .active
                        .iter()
                        .copied()
                        .map(decimal::write)
                        .collect::<Vec<_>>()),
                ),
                ("lockedLoadPoints", json!(locks)),
                (
                    "legacyLockedLoadPointNumbers",
                    if legacy_locks.is_empty() {
                        Value::Null
                    } else {
                        json!(legacy_locks)
                    },
                ),
            ]),
        );

        let marks = ordered(&plan["revit_marks_by_load_point"])?;
        let mut assigned = BTreeSet::new();
        let mut unassigned = Vec::new();
        let mut legacy = Vec::new();
        for (point, choice) in ordered(&plan["selected_piles"])? {
            let mut config = choice["pile"].clone();
            if let Some(config) = config.as_object_mut() {
                if let Some(level) = config.remove("pile_tip_level_m_key") {
                    config.insert("pile_tip_level_mm".into(), level);
                }
            }
            let config = write_shape(config)?;
            let external = write_shape(choice["external_references"].clone())?;
            match (points.get(&point), config.is_null()) {
                (Some(path), false) => {
                    let mut pile =
                        Node::new(state.path(&pile_key(id, point)), &format!("Paal L{point}"));
                    pile.set(CLASS, class("IfcPile"));
                    pile.set(
                        PILE,
                        compact([
                            ("loadPoint", json!(path)),
                            ("pileSize", config["pileSize"].clone()),
                            ("tipLevel", config["tipLevel"].clone()),
                            (
                                "pileNumber",
                                marks.get(&point).copied().cloned().unwrap_or_default(),
                            ),
                        ]),
                    );
                    pile.set(EXTERNAL, external);
                    node.add_child(&format!("Paal_L{point}"), &pile);
                    nodes.push(pile);
                    assigned.insert(point);
                }
                (Some(path), true) => {
                    unassigned.push(json!({"loadPoint":path,"externalReferences":external}))
                }
                (None, _) => legacy.push(compact([
                    ("loadPointNumber", json!(point)),
                    ("configuration", config),
                    ("externalReferences", external),
                ])),
            }
        }
        let legacy_marks: Vec<_> = marks
            .into_iter()
            .filter(|(point, _)| !assigned.contains(point))
            .map(|(point, mark)| {
                let mut entry = location(point, points);
                entry["pileNumber"] = mark.clone();
                entry
            })
            .collect();
        let unresolved: Vec<_> = ordered(&plan["optimization_unassigned"])?
            .into_iter()
            .map(|(point, reason)| {
                let mut entry = location(point, points);
                entry["reason"] = reason.clone();
                entry
            })
            .collect();
        let caps = items(&plan["pile_cap_proposals"])
            .iter()
            .map(|cap| {
                let (members, legacy) = split_references(items(&cap["load_point_ids"]), points)?;
                Ok(compact([
                    ("loadPoints", json!(members)),
                    (
                        "legacyLoadPointNumbers",
                        if legacy.is_empty() {
                            Value::Null
                        } else {
                            json!(legacy)
                        },
                    ),
                    ("pileCount", cap["pile_count"].clone()),
                    ("quarterTurns", cap["quarter_turns"].clone()),
                    ("configuration", write_shape(cap["configuration"].clone())?),
                ]))
            })
            .collect::<Result<Vec<_>>>()?;
        for (field, entries) in [
            ("unassignedChoices", unassigned),
            ("legacyAssignments", legacy),
            ("legacyPileNumbers", legacy_marks),
            ("optimizationUnassigned", unresolved),
            ("pileCapProposals", caps),
        ] {
            if !entries.is_empty() {
                node.set_opps(field, json!(entries));
            }
        }
        node.set_opps("optimizerResult", write_shape(plan["ilp_result"].clone())?);
        foundation.add_child(name, &node);
        nodes.push(node);
    }
    active.ok_or_else(|| invalid("no active pile plan"))
}

pub(super) fn pile_key(plan: &str, point: u32) -> String {
    format!("pile:{plan}:{point}")
}

fn choice(config: &Value, external: &Value) -> Result<Value> {
    let pile = if config.is_null() {
        Value::Null
    } else {
        json!({"pile_size_mm":config["pileSize"],"pile_tip_level_m_key":decimal::read(&config["tipLevel"])?})
    };
    let external = if external.is_null() {
        json!([])
    } else {
        read_shape(external)?
    };
    Ok(json!({"pile":pile, "external_references":external}))
}

pub(super) fn read(
    graph: &Graph,
    state: &mut State,
    point_ids: &BTreeSet<u32>,
) -> Result<(Vec<Value>, Vec<PilePlanTipLevelKeys>)> {
    let mut plans = BTreeMap::new();
    let mut plan_ids = BTreeSet::new();
    for node in graph.children(graph.foundation, PLAN) {
        let id = node.get(PLAN)["variantId"].as_str().unwrap();
        if !plan_ids.insert(id) {
            return Err(IfcppError::DuplicatePilePlanId(id.into()));
        }
        state.remember(format!("plan:{id}"), node);
        let settings = node.opps("planSettings");
        let mut selected = BTreeMap::new();
        let mut marks = BTreeMap::new();
        let mut assigned = BTreeSet::new();
        for pile in graph.children(node, PILE) {
            let value = pile.get(PILE);
            if pile.get(CLASS)["code"] != "IfcPile" {
                return Err(invalid("assigned pile must have class IfcPile"));
            }
            let point = reference_number(graph, &value["loadPoint"], LOAD_POINT)?;
            state.remember(pile_key(id, point), pile);
            assigned.insert(point);
            insert_unique(&mut selected, point, choice(value, pile.get(EXTERNAL))?)?;
            if let Some(number) = value.get("pileNumber") {
                marks.insert(point, number.clone());
            }
        }
        for entry in items(node.opps("unassignedChoices")) {
            let point = reference_number(graph, &entry["loadPoint"], LOAD_POINT)?;
            insert_unique(
                &mut selected,
                point,
                choice(&Value::Null, &entry["externalReferences"])?,
            )?;
        }
        for entry in items(node.opps("legacyAssignments")) {
            let point = number(&entry["loadPointNumber"])?;
            if point_ids.contains(&point) {
                return Err(invalid("legacy assignment refers to a current location"));
            }
            insert_unique(
                &mut selected,
                point,
                choice(&entry["configuration"], &entry["externalReferences"])?,
            )?;
        }
        for entry in items(node.opps("legacyPileNumbers")) {
            let point = local_number(
                graph,
                entry,
                "loadPoint",
                "legacyLoadPointNumber",
                LOAD_POINT,
            )?;
            if assigned.contains(&point) {
                return Err(invalid("pile number must be on the assigned pile"));
            }
            insert_unique(&mut marks, point, entry["pileNumber"].clone())?;
        }
        let mut unresolved = BTreeMap::new();
        for entry in items(node.opps("optimizationUnassigned")) {
            let point = local_number(
                graph,
                entry,
                "loadPoint",
                "legacyLoadPointNumber",
                LOAD_POINT,
            )?;
            insert_unique(&mut unresolved, point, entry["reason"].clone())?;
        }
        let caps = items(node.opps("pileCapProposals")).iter().map(|cap| {
            Ok(json!({
                "load_point_ids":read_references(graph, &cap["loadPoints"], &cap["legacyLoadPointNumbers"], LOAD_POINT)?,
                "pile_count":cap["pileCount"],"quarter_turns":cap["quarterTurns"],
                "configuration":read_shape(&cap["configuration"])?,
            }))
        }).collect::<Result<Vec<_>>>()?;
        let active = items(&settings["activeTipLevels"])
            .iter()
            .map(decimal::read)
            .collect::<Result<Vec<_>>>()?;
        let plan = json!({
            "id":id,"name":name(node)?,"active_pile_sizes":settings["activePileSizes"],
            "active_pile_tip_levels":active.iter().copied().map(decimal::metres).collect::<Vec<_>>(),
            "locked_load_point_ids":read_references(graph, &settings["lockedLoadPoints"], &settings["legacyLockedLoadPointNumbers"], LOAD_POINT)?,
            "revit_marks_by_load_point":marks,"selected_piles":selected,"optimization_unassigned":unresolved,"pile_cap_proposals":caps,
            "ilp_result":read_shape(node.opps("optimizerResult"))?,
        });
        insert_unique(
            &mut plans,
            order(&settings["order"])?,
            (
                plan,
                PilePlanTipLevelKeys {
                    id: id.into(),
                    active,
                },
            ),
        )?;
    }
    Ok(plans.into_values().unzip())
}
