use super::advice::AdviceAnalysis;
use super::advice_merge::{merge_advice_values, SourcedCapacity};
use super::*;
use crate::{
    try_pile_tip_level_mm, PilePlanProject, ProjectBearingCapacity, ProjectImportLogEntry,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

type CapacityKey = (u32, u32, i64);
pub(super) fn capacity_key(value: &ProjectBearingCapacity) -> CapacityKey {
    (
        value.cpt_id,
        value.pile_size_mm,
        try_pile_tip_level_mm(value.pile_tip_level_m).expect("validated capacity tip"),
    )
}
struct StoredGroup {
    id: String,
    keys: BTreeSet<CapacityKey>,
    logs: Vec<ProjectImportLogEntry>,
    legacy: bool,
}
fn read_keys(log: &ProjectImportLogEntry) -> Option<Vec<CapacityKey>> {
    serde_json::from_str(log.profile_details.get("capacity_keys")?).ok()
}
fn groups(project: &PilePlanProject) -> Vec<StoredGroup> {
    let logs: Vec<_> = project
        .import_log
        .iter()
        .filter(|l| {
            l.source_role == Some(ImportRole::BearingCapacities)
                || (l.source_role.is_none() && l.mapped_columns.values().any(|v| v == "frd_kn"))
        })
        .cloned()
        .collect();
    if logs.is_empty() && project.inputs.bearing_capacities.is_empty() {
        return vec![];
    }
    let mut grouped: BTreeMap<String, StoredGroup> = BTreeMap::new();
    let mut complete = !logs.is_empty();
    for log in &logs {
        if let (Some(id), Some(keys)) = (log.profile_details.get("advice_id"), read_keys(log)) {
            let group = grouped.entry(id.clone()).or_insert_with(|| StoredGroup {
                id: id.clone(),
                keys: Default::default(),
                logs: vec![],
                legacy: false,
            });
            group.keys.extend(keys);
            group.logs.push(log.clone());
        } else {
            complete = false;
        }
    }
    let owned: BTreeSet<_> = grouped
        .values()
        .flat_map(|g| g.keys.iter().copied())
        .collect();
    complete &= project
        .inputs
        .bearing_capacities
        .iter()
        .all(|c| owned.contains(&capacity_key(c)));
    if complete {
        return grouped.into_values().collect();
    }
    let mut logs = logs;
    if logs.is_empty() {
        logs.push(ProjectImportLogEntry {
            source_file: String::new(),
            imported_at: None,
            sheet_name: None,
            mapped_columns: Default::default(),
            warnings: vec![],
            source_role: Some(ImportRole::BearingCapacities),
            source_format: None,
            schema_version: None,
            source_profile: None,
            profile_details: Default::default(),
        });
    }
    vec![StoredGroup {
        id: "legacy-advice".into(),
        keys: project
            .inputs
            .bearing_capacities
            .iter()
            .map(capacity_key)
            .collect(),
        logs,
        legacy: true,
    }]
}
pub(super) fn remap_advice_ownership(
    logs: &mut [ProjectImportLogEntry],
    mapping: &HashMap<u32, u32>,
) {
    for log in logs {
        if let Some(keys) = read_keys(log) {
            let keys: Vec<_> = keys
                .into_iter()
                .filter_map(|(c, s, t)| mapping.get(&c).map(|id| (*id, s, t)))
                .collect();
            log.profile_details.insert(
                "capacity_keys".into(),
                serde_json::to_string(&keys).unwrap(),
            );
        }
    }
}
pub fn stored_advice_sources(project: &PilePlanProject) -> Vec<StoredAdviceSource> {
    let current: HashSet<_> = project
        .inputs
        .bearing_capacities
        .iter()
        .map(capacity_key)
        .collect();
    groups(project)
        .into_iter()
        .map(|g| StoredAdviceSource {
            id: g.id,
            file_names: g
                .logs
                .iter()
                .map(|l| l.source_file.clone())
                .filter(|s| !s.is_empty())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
            sheet_names: g
                .logs
                .iter()
                .filter_map(|l| l.sheet_name.clone())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
            item_count: g.keys.iter().filter(|k| current.contains(k)).count(),
            combined_legacy: g.legacy,
        })
        .collect()
}
pub(super) fn combine_advice_refresh(
    current: &PilePlanProject,
    sources: &[ImportSource],
    mut new: AdviceAnalysis,
    mapping: &HashMap<u32, u32>,
) -> Result<AdviceAnalysis, ImportError> {
    let supplied: Vec<_> = sources
        .iter()
        .filter(|s| {
            s.role == ImportRole::BearingCapacities
                && !(s.format == SourceFormat::Xlsx
                    && s.profile_options
                        .advice_sheets
                        .as_ref()
                        .is_some_and(Vec::is_empty))
        })
        .collect();
    let legacy = supplied
        .iter()
        .filter(|s| s.advice_operation.is_none())
        .count();
    if legacy == supplied.len() {
        return Ok(new);
    }
    if legacy > 0 {
        return Err(ImportError::Validation(
            "Do not combine legacy advice replacement with explicit advice operations".into(),
        ));
    }
    let stored = groups(current);
    let ids: HashSet<_> = stored.iter().map(|g| g.id.clone()).collect();
    let mut replaced = HashSet::new();
    for source in supplied {
        if let Some(AdviceImportOperation::Replace { advice_id }) = &source.advice_operation {
            if !ids.contains(advice_id) || !replaced.insert(advice_id.clone()) {
                return Err(ImportError::Validation(
                    "Unknown or duplicate advice replacement target".into(),
                ));
            }
        }
    }
    // These are durable project provenance IDs, independent of transient request IDs.
    let mut used = ids;
    let mut replacements = HashMap::new();
    let mut counter = 0;
    for log in &mut new.logs {
        let provisional = log.profile_details.get("advice_id").unwrap().clone();
        let id = replacements
            .entry(provisional)
            .or_insert_with(|| loop {
                let id = format!("advice-source-{counter}");
                counter += 1;
                if used.insert(id.clone()) {
                    break id;
                }
            })
            .clone();
        log.profile_details.insert("advice_id".into(), id);
    }
    let mut values = new.sourced_values.clone();
    let mut retained_logs = Vec::new();
    for group in stored.into_iter().filter(|g| !replaced.contains(&g.id)) {
        for value in current
            .inputs
            .bearing_capacities
            .iter()
            .filter(|c| group.keys.contains(&capacity_key(c)))
        {
            if let Some(id) = mapping.get(&value.cpt_id) {
                let mut value = value.clone();
                value.cpt_id = *id;
                values.push(SourcedCapacity {
                    capacity: value,
                    location: AdviceValueLocation {
                        source_id: format!("stored:{}", group.id),
                        file_name: group.logs[0].source_file.clone(),
                        sheet_name: None,
                        row: None,
                        column: None,
                    },
                });
            }
        }
        for (index, mut log) in group.logs.into_iter().enumerate() {
            let old_keys = if group.legacy {
                if index == 0 {
                    group.keys.iter().copied().collect()
                } else {
                    vec![]
                }
            } else {
                read_keys(&log).unwrap()
            };
            let keys: Vec<_> = old_keys
                .into_iter()
                .filter_map(|(c, s, t)| mapping.get(&c).map(|id| (*id, s, t)))
                .collect();
            log.profile_details
                .insert("advice_id".into(), group.id.clone());
            log.profile_details.insert(
                "capacity_keys".into(),
                serde_json::to_string(&keys).unwrap(),
            );
            retained_logs.push(log);
        }
    }
    let merged = merge_advice_values(&values)?;
    if !merged.conflicts.is_empty() {
        let mut d = super::pipeline::error_diagnostic(
            ImportDiagnosticCode::ConflictingBearingCapacities,
            "Selected advice conflicts with retained project advice".into(),
        );
        d.count = merged.conflicts.len();
        return Err(ImportError::Advice(SourceImportFailure {
            message: d.fallback_message.clone(),
            diagnostics: vec![d],
            unique_value_count: merged.unique_values.len() + merged.conflicts.len(),
            exact_duplicate_count: merged.exact_duplicate_count,
            conflicts: merged.conflicts,
        }));
    }
    retained_logs.extend(new.logs);
    new.logs = retained_logs;
    new.values = merged.unique_values;
    new.exact_duplicate_count = merged.exact_duplicate_count;
    new.sourced_values = values;
    Ok(new)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn csv(role: ImportRole, name: &str, text: &str) -> ImportSource {
        ImportSource {
            advice_operation: None,
            source_id: None,
            role,
            profile: ImportProfile::StandardTable,
            profile_options: Default::default(),
            file_name: name.into(),
            format: SourceFormat::Csv,
            bytes: text.as_bytes().to_vec(),
        }
    }
    fn project() -> PilePlanProject {
        super::super::import_project_from_sources(
            "Test",
            &[
                csv(ImportRole::LoadPoints, "loads.csv", "1,0,0,100"),
                csv(ImportRole::Cpts, "cpts.csv", "1,0,0"),
                csv(ImportRole::BearingCapacities, "a.csv", "1,-15,290,500"),
                csv(ImportRole::BearingCapacities, "b.csv", "1,-18,290,600"),
            ],
            Some(0.),
            "EUR",
        )
        .unwrap()
    }
    #[test]
    fn adding_advice_preserves_existing_values_and_sources() {
        let current = project();
        let mut extra = csv(ImportRole::BearingCapacities, "c.csv", "1,-20,290,700");
        extra.advice_operation = Some(AdviceImportOperation::Append);
        let refreshed =
            super::super::refresh_project_from_profiled_sources(&current, &[extra]).unwrap();
        assert_eq!(refreshed.inputs.bearing_capacities.len(), 3);
        assert_eq!(stored_advice_sources(&refreshed).len(), 3);
        assert_eq!(current.inputs.bearing_capacities.len(), 2);
    }
    #[test]
    fn replacing_one_advice_preserves_the_other_source() {
        let current = project();
        let old = stored_advice_sources(&current)
            .into_iter()
            .find(|s| s.file_names == vec!["a.csv"])
            .unwrap();
        let mut replacement = csv(ImportRole::BearingCapacities, "new-a.csv", "1,-16,290,550");
        replacement.advice_operation = Some(AdviceImportOperation::Replace { advice_id: old.id });
        let refreshed =
            super::super::refresh_project_from_profiled_sources(&current, &[replacement]).unwrap();
        assert_eq!(refreshed.inputs.bearing_capacities.len(), 2);
        assert!(refreshed
            .inputs
            .bearing_capacities
            .iter()
            .any(|c| c.pile_tip_level_m == -18.));
        assert!(!refreshed
            .inputs
            .bearing_capacities
            .iter()
            .any(|c| c.pile_tip_level_m == -15.));
    }
    #[test]
    fn appended_conflicts_block_and_legacy_projects_remain_replaceable() {
        let current = project();
        let mut extra = csv(ImportRole::BearingCapacities, "bad.csv", "1,-15,290,700");
        extra.advice_operation = Some(AdviceImportOperation::Append);
        assert_eq!(
            super::super::refresh_project_from_profiled_sources(&current, &[extra])
                .unwrap_err()
                .to_source_import_failure()
                .conflicts
                .len(),
            1
        );
        let mut legacy = current.clone();
        for log in &mut legacy.import_log {
            log.profile_details.clear();
        }
        let sources = stored_advice_sources(&legacy);
        assert_eq!(sources.len(), 1);
        assert!(sources[0].combined_legacy);
        let mut replacement = csv(
            ImportRole::BearingCapacities,
            "replacement.csv",
            "1,-20,290,800",
        );
        replacement.advice_operation = Some(AdviceImportOperation::Replace {
            advice_id: sources[0].id.clone(),
        });
        assert_eq!(
            super::super::refresh_project_from_profiled_sources(&legacy, &[replacement])
                .unwrap()
                .inputs
                .bearing_capacities
                .len(),
            1
        );
    }
    #[test]
    fn source_ownership_survives_cpt_remapping_and_ifcpp_roundtrip() {
        let current = project();
        let refreshed = super::super::refresh_project_from_profiled_sources(
            &current,
            &[csv(ImportRole::Cpts, "new-cpts.csv", "7,0,0")],
        )
        .unwrap();
        let text = crate::write_ifcpp_string(&refreshed).unwrap();
        let reopened = crate::read_ifcpp_str(&text).unwrap();
        let sources = stored_advice_sources(&reopened);
        assert_eq!(sources.len(), 2);
        assert!(sources
            .iter()
            .all(|s| !s.combined_legacy && s.item_count == 1));
        let target = sources
            .iter()
            .find(|s| s.file_names == vec!["a.csv"])
            .unwrap();
        let mut replacement = csv(ImportRole::BearingCapacities, "new-a.csv", "7,-16,290,550");
        replacement.advice_operation = Some(AdviceImportOperation::Replace {
            advice_id: target.id.clone(),
        });
        let replaced =
            super::super::refresh_project_from_profiled_sources(&reopened, &[replacement]).unwrap();
        assert_eq!(replaced.inputs.bearing_capacities.len(), 2);
        assert!(replaced
            .inputs
            .bearing_capacities
            .iter()
            .all(|c| c.cpt_id == 7));
    }
    #[test]
    fn replacing_one_owner_keeps_identical_values_owned_by_another_source() {
        let current = project();
        let mut shared = csv(ImportRole::BearingCapacities, "shared.csv", "1,-15,290,500");
        shared.advice_operation = Some(AdviceImportOperation::Append);
        let current =
            super::super::refresh_project_from_profiled_sources(&current, &[shared]).unwrap();
        let target = stored_advice_sources(&current)
            .into_iter()
            .find(|s| s.file_names == vec!["a.csv"])
            .unwrap();
        let mut replacement = csv(ImportRole::BearingCapacities, "new.csv", "1,-16,290,550");
        replacement.advice_operation = Some(AdviceImportOperation::Replace {
            advice_id: target.id,
        });
        let replaced =
            super::super::refresh_project_from_profiled_sources(&current, &[replacement]).unwrap();
        assert_eq!(replaced.inputs.bearing_capacities.len(), 3);
        assert!(replaced
            .inputs
            .bearing_capacities
            .iter()
            .any(|c| c.pile_tip_level_m == -15.));
    }
}
