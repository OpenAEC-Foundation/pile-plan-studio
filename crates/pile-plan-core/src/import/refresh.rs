use std::collections::{HashMap, HashSet};

use crate::{PilePlanProject, ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint};

use super::{
    capacity_columns, cpt_columns, import_warnings, parse_bearing_capacities_with_diagnostics,
    parse_cpts, pipeline::parse_load_source, provenance_entry, read_source_table,
    reconcile_imported_inputs, ImportError, ImportProfile, ImportRole, ImportSource,
};

const MATCH_TOLERANCE_MM: f64 = 1.0;

trait PositionedObject {
    fn id(&self) -> u32;
    fn x_mm(&self) -> f64;
    fn y_mm(&self) -> f64;
}

impl PositionedObject for ProjectLoadPoint {
    fn id(&self) -> u32 {
        self.id
    }
    fn x_mm(&self) -> f64 {
        self.x_mm
    }
    fn y_mm(&self) -> f64 {
        self.y_mm
    }
}

impl PositionedObject for ProjectCpt {
    fn id(&self) -> u32 {
        self.id
    }
    fn x_mm(&self) -> f64 {
        self.x_mm
    }
    fn y_mm(&self) -> f64 {
        self.y_mm
    }
}

fn match_load_points(old: &[ProjectLoadPoint], new: &[ProjectLoadPoint]) -> HashMap<u32, u32> {
    match_positioned_objects(old, new)
}

fn match_cpts(old: &[ProjectCpt], new: &[ProjectCpt]) -> HashMap<u32, u32> {
    match_positioned_objects(old, new)
}

fn match_positioned_objects<T: PositionedObject>(old: &[T], new: &[T]) -> HashMap<u32, u32> {
    let new_by_id: HashMap<u32, usize> = new
        .iter()
        .enumerate()
        .map(|(index, item)| (item.id(), index))
        .collect();
    let mut mapping = HashMap::new();
    let mut used_new = HashSet::new();
    let mut unmatched_old = Vec::new();

    for (old_index, old_item) in old.iter().enumerate() {
        let same_id_match = new_by_id
            .get(&old_item.id())
            .copied()
            .filter(|new_index| within_tolerance(old_item, &new[*new_index]));
        if let Some(new_index) = same_id_match {
            mapping.insert(old_item.id(), new[new_index].id());
            used_new.insert(new_index);
        } else {
            unmatched_old.push(old_index);
        }
    }

    let candidates_by_old: HashMap<usize, Vec<usize>> = unmatched_old
        .iter()
        .map(|old_index| {
            let candidates = new
                .iter()
                .enumerate()
                .filter(|(new_index, new_item)| {
                    !used_new.contains(new_index) && within_tolerance(&old[*old_index], *new_item)
                })
                .map(|(new_index, _)| new_index)
                .collect();
            (*old_index, candidates)
        })
        .collect();
    let mut old_candidate_count_by_new: HashMap<usize, usize> = HashMap::new();
    for candidates in candidates_by_old.values() {
        for new_index in candidates {
            *old_candidate_count_by_new.entry(*new_index).or_default() += 1;
        }
    }

    for (old_index, candidates) in candidates_by_old {
        if candidates.len() != 1 {
            continue;
        }
        let new_index = candidates[0];
        if old_candidate_count_by_new.get(&new_index) == Some(&1) {
            mapping.insert(old[old_index].id(), new[new_index].id());
        }
    }

    mapping
}

fn within_tolerance<T: PositionedObject>(old: &T, new: &T) -> bool {
    (old.x_mm() - new.x_mm()).hypot(old.y_mm() - new.y_mm()) <= MATCH_TOLERANCE_MM
}

pub fn refresh_project_from_profiled_sources(
    current: &PilePlanProject,
    sources: &[ImportSource],
) -> Result<PilePlanProject, ImportError> {
    if sources.is_empty() {
        return Err(ImportError::Validation(
            "Select at least one import source to refresh.".to_string(),
        ));
    }

    let load_source = optional_source_for_role(sources, ImportRole::LoadPoints)?;
    let cpt_source = optional_source_for_role(sources, ImportRole::Cpts)?;
    let capacity_source = optional_source_for_role(sources, ImportRole::BearingCapacities)?;
    let mut replacement_logs = Vec::new();

    let new_load_points = if let Some(source) = load_source {
        let (load_points, log) = parse_load_source(source)?;
        replacement_logs.push(log);
        load_points
    } else {
        current.inputs.load_points.clone()
    };
    let load_point_mapping = if load_source.is_some() {
        match_load_points(&current.inputs.load_points, &new_load_points)
    } else {
        identity_mapping(current.inputs.load_points.iter().map(|item| item.id))
    };

    let new_cpts = if let Some(source) = cpt_source {
        let table = read_source_table(&source.file_name, source.format, &source.bytes)?;
        let cpts = parse_cpts(&table)?;
        let mut log = provenance_entry(source, table.sheet_name, cpt_columns());
        log.source_profile = Some(ImportProfile::StandardTable);
        replacement_logs.push(log);
        cpts
    } else {
        current.inputs.cpts.clone()
    };
    let cpt_mapping = if cpt_source.is_some() {
        match_cpts(&current.inputs.cpts, &new_cpts)
    } else {
        identity_mapping(current.inputs.cpts.iter().map(|item| item.id))
    };

    let new_bearing_capacities = if let Some(source) = capacity_source {
        let table = read_source_table(&source.file_name, source.format, &source.bytes)?;
        let parsed = parse_bearing_capacities_with_diagnostics(&table)?;
        let reconciliation =
            reconcile_imported_inputs(&new_load_points, &new_cpts, parsed.bearing_capacities)?;
        let mut log = provenance_entry(source, table.sheet_name.clone(), capacity_columns());
        log.source_profile = Some(ImportProfile::StandardTable);
        log.warnings = import_warnings(&table, &parsed.empty_frd_rows, &reconciliation);
        replacement_logs.push(log);
        reconciliation.bearing_capacities
    } else if cpt_source.is_some() {
        remap_bearing_capacities(&current.inputs.bearing_capacities, &cpt_mapping)
    } else {
        current.inputs.bearing_capacities.clone()
    };

    let mut refreshed = current.clone();
    refreshed.inputs.load_points = new_load_points;
    refreshed.inputs.cpts = new_cpts;
    refreshed.inputs.bearing_capacities = new_bearing_capacities;
    refreshed.settings.cpt_selection_by_load_point = current
        .settings
        .cpt_selection_by_load_point
        .iter()
        .filter_map(|(old_id, settings)| {
            load_point_mapping
                .get(old_id)
                .map(|new_id| (*new_id, settings.clone()))
        })
        .collect();
    refreshed.user_state.selected_piles = current
        .user_state
        .selected_piles
        .iter()
        .filter_map(|(old_id, choice)| {
            load_point_mapping
                .get(old_id)
                .map(|new_id| (*new_id, choice.clone()))
        })
        .collect();
    refreshed.user_state.manual_cpt_selections =
        remap_manual_cpt_selections(current, &load_point_mapping, &cpt_mapping);

    if capacity_source.is_some() {
        refreshed.settings.active_pile_sizes = reconcile_active_sizes(
            &current.inputs.bearing_capacities,
            &current.settings.active_pile_sizes,
            &refreshed.inputs.bearing_capacities,
        );
        refreshed.settings.active_pile_tip_levels = reconcile_active_tip_levels(
            &current.inputs.bearing_capacities,
            &current.settings.active_pile_tip_levels,
            &refreshed.inputs.bearing_capacities,
        );
    }

    let supplied_roles: HashSet<ImportRole> = sources.iter().map(|source| source.role).collect();
    refreshed.import_log.retain(|entry| {
        entry
            .source_role
            .is_none_or(|role| !supplied_roles.contains(&role))
    });
    refreshed.import_log.extend(replacement_logs);

    Ok(refreshed)
}

fn optional_source_for_role(
    sources: &[ImportSource],
    role: ImportRole,
) -> Result<Option<&ImportSource>, ImportError> {
    let mut matches = sources.iter().filter(|source| source.role == role);
    let first = matches.next();
    if let (Some(first), Some(second)) = (first, matches.next()) {
        return Err(ImportError::Validation(format!(
            "Multiple import sources assigned to {}: {}, {}.",
            role.label(),
            first.file_name,
            second.file_name,
        )));
    }
    Ok(first)
}

fn identity_mapping(ids: impl Iterator<Item = u32>) -> HashMap<u32, u32> {
    ids.map(|id| (id, id)).collect()
}

fn remap_bearing_capacities(
    capacities: &[ProjectBearingCapacity],
    cpt_mapping: &HashMap<u32, u32>,
) -> Vec<ProjectBearingCapacity> {
    capacities
        .iter()
        .filter_map(|capacity| {
            cpt_mapping.get(&capacity.cpt_id).map(|new_cpt_id| {
                let mut remapped = capacity.clone();
                remapped.cpt_id = *new_cpt_id;
                remapped
            })
        })
        .collect()
}

fn remap_manual_cpt_selections(
    current: &PilePlanProject,
    load_point_mapping: &HashMap<u32, u32>,
    cpt_mapping: &HashMap<u32, u32>,
) -> HashMap<u32, Vec<u32>> {
    current
        .user_state
        .manual_cpt_selections
        .iter()
        .filter_map(|(old_load_point_id, old_cpt_ids)| {
            let new_load_point_id = load_point_mapping.get(old_load_point_id)?;
            let mut seen = HashSet::new();
            let new_cpt_ids: Vec<u32> = old_cpt_ids
                .iter()
                .filter_map(|old_cpt_id| cpt_mapping.get(old_cpt_id).copied())
                .filter(|new_cpt_id| seen.insert(*new_cpt_id))
                .collect();
            (!new_cpt_ids.is_empty()).then_some((*new_load_point_id, new_cpt_ids))
        })
        .collect()
}

fn reconcile_active_sizes(
    old_capacities: &[ProjectBearingCapacity],
    old_active: &[u32],
    new_capacities: &[ProjectBearingCapacity],
) -> Vec<u32> {
    let old_available: HashSet<u32> = old_capacities
        .iter()
        .map(|capacity| capacity.pile_size_mm)
        .collect();
    let old_active: HashSet<u32> = old_active.iter().copied().collect();
    let mut new_available: Vec<u32> = new_capacities
        .iter()
        .map(|capacity| capacity.pile_size_mm)
        .collect();
    new_available.sort_unstable();
    new_available.dedup();
    new_available.retain(|value| !old_available.contains(value) || old_active.contains(value));
    new_available
}

fn reconcile_active_tip_levels(
    old_capacities: &[ProjectBearingCapacity],
    old_active: &[f64],
    new_capacities: &[ProjectBearingCapacity],
) -> Vec<f64> {
    let old_available: HashSet<i64> = old_capacities
        .iter()
        .map(|capacity| tip_key(capacity.pile_tip_level_m))
        .collect();
    let old_active: HashSet<i64> = old_active.iter().map(|value| tip_key(*value)).collect();
    let mut new_available: Vec<i64> = new_capacities
        .iter()
        .map(|capacity| tip_key(capacity.pile_tip_level_m))
        .collect();
    new_available.sort_unstable_by(|left, right| right.cmp(left));
    new_available.dedup();
    new_available.retain(|value| !old_available.contains(value) || old_active.contains(value));
    new_available
        .into_iter()
        .map(|value| value as f64 / 1000.0)
        .collect()
}

fn tip_key(value: f64) -> i64 {
    (value * 1000.0).round() as i64
}

#[cfg(test)]
mod tests {
    use crate::{
        import_project_from_generic_sources, CptSelectionAlgorithm, CptSelectionSettings,
        ImportProfile, ImportProfileOptions, ImportRole, ImportSource, PileConfigurationKey,
        ProjectCpt, ProjectLoadPoint, SelectedPileChoice, SourceFormat,
    };

    use super::{match_cpts, match_load_points, refresh_project_from_profiled_sources};

    #[test]
    fn matches_load_point_with_validated_same_id() {
        let mapping = match_load_points(
            &[load_point(1, 1000.0, 2000.0)],
            &[load_point(1, 1000.5, 1999.5)],
        );

        assert_eq!(mapping.get(&1), Some(&1));
    }

    #[test]
    fn matches_changed_load_point_id_by_unique_coordinates() {
        let mapping = match_load_points(
            &[load_point(1, 1000.0, 2000.0)],
            &[load_point(9, 1000.5, 1999.5)],
        );

        assert_eq!(mapping.get(&1), Some(&9));
    }

    #[test]
    fn rejects_reused_load_point_id_at_another_position() {
        let mapping = match_load_points(
            &[load_point(1, 1000.0, 2000.0)],
            &[load_point(1, 5000.0, 6000.0)],
        );

        assert!(mapping.is_empty());
    }

    #[test]
    fn rejects_ambiguous_load_point_coordinate_fallback() {
        let mapping = match_load_points(
            &[load_point(1, 1000.0, 2000.0)],
            &[load_point(8, 999.5, 2000.0), load_point(9, 1000.5, 2000.0)],
        );

        assert!(mapping.is_empty());
    }

    #[test]
    fn rejects_coordinate_fallback_shared_by_multiple_old_load_points() {
        let mapping = match_load_points(
            &[load_point(1, 1000.0, 2000.0), load_point(2, 1000.5, 2000.0)],
            &[load_point(9, 1000.25, 2000.0)],
        );

        assert!(mapping.is_empty());
    }

    #[test]
    fn cpts_follow_the_same_matching_rules() {
        let mapping = match_cpts(
            &[cpt(61, 1000.0, 2000.0), cpt(62, 5000.0, 6000.0)],
            &[cpt(71, 1000.5, 1999.5), cpt(62, 9000.0, 9000.0)],
        );

        assert_eq!(mapping.get(&61), Some(&71));
        assert!(!mapping.contains_key(&62));
    }

    #[test]
    fn refreshing_load_points_preserves_matched_engineering_choices() {
        let mut current = project();
        current.user_state.selected_piles.insert(1, selected_pile());
        current.user_state.manual_cpt_selections.insert(1, vec![61]);
        current
            .settings
            .cpt_selection_by_load_point
            .insert(1, local_settings());
        let original_cpts = current.inputs.cpts.clone();
        let original_capacities = current.inputs.bearing_capacities.clone();

        let refreshed = refresh_project_from_profiled_sources(
            &current,
            &[csv_source(
                ImportRole::LoadPoints,
                "loads.csv",
                "9,0.5,0,900\n",
            )],
        )
        .unwrap();

        assert_eq!(refreshed.inputs.load_points[0].id, 9);
        assert_eq!(refreshed.inputs.load_points[0].design_load_kn, 900.0);
        assert_eq!(refreshed.inputs.cpts, original_cpts);
        assert_eq!(refreshed.inputs.bearing_capacities, original_capacities);
        assert_eq!(
            refreshed.user_state.selected_piles.get(&9),
            Some(&selected_pile())
        );
        assert_eq!(
            refreshed.user_state.manual_cpt_selections.get(&9),
            Some(&vec![61])
        );
        assert_eq!(
            refreshed.settings.cpt_selection_by_load_point.get(&9),
            Some(&local_settings())
        );
        assert!(!refreshed.user_state.selected_piles.contains_key(&1));
    }

    #[test]
    fn refreshing_cpts_remaps_manual_selections_and_retained_capacities() {
        let mut current = project();
        current.user_state.manual_cpt_selections.insert(1, vec![61]);

        let refreshed = refresh_project_from_profiled_sources(
            &current,
            &[csv_source(ImportRole::Cpts, "cpts.csv", "71,0.5,0\n")],
        )
        .unwrap();

        assert_eq!(refreshed.inputs.cpts[0].id, 71);
        assert_eq!(refreshed.inputs.bearing_capacities[0].cpt_id, 71);
        assert_eq!(
            refreshed.user_state.manual_cpt_selections.get(&1),
            Some(&vec![71])
        );
    }

    #[test]
    fn refreshing_cpts_removes_manual_override_when_no_selected_cpt_maps() {
        let mut current = project();
        current.user_state.manual_cpt_selections.insert(1, vec![61]);

        let refreshed = refresh_project_from_profiled_sources(
            &current,
            &[csv_source(ImportRole::Cpts, "cpts.csv", "71,5000,5000\n")],
        )
        .unwrap();

        assert!(!refreshed.user_state.manual_cpt_selections.contains_key(&1));
        assert!(refreshed.inputs.bearing_capacities.is_empty());
    }

    #[test]
    fn refreshing_foundation_advice_preserves_choices_and_reconciles_active_values() {
        let mut current = project();
        current.user_state.selected_piles.insert(1, selected_pile());
        current.settings.active_pile_sizes.clear();
        current.settings.active_pile_tip_levels = vec![-17.5];

        let refreshed = refresh_project_from_profiled_sources(
            &current,
            &[csv_source(
                ImportRole::BearingCapacities,
                "capacities.csv",
                "61,-17.5,290,250\n61,-20,320,500\n",
            )],
        )
        .unwrap();

        assert_eq!(refreshed.inputs.bearing_capacities.len(), 2);
        assert_eq!(
            refreshed.user_state.selected_piles.get(&1),
            Some(&selected_pile())
        );
        assert_eq!(refreshed.settings.active_pile_sizes, vec![320]);
        assert_eq!(
            refreshed.settings.active_pile_tip_levels,
            vec![-17.5, -20.0]
        );
    }

    #[test]
    fn rejects_duplicate_refresh_roles_atomically() {
        let current = project();
        let result = refresh_project_from_profiled_sources(
            &current,
            &[
                csv_source(ImportRole::LoadPoints, "loads-a.csv", "1,0,0,100\n"),
                csv_source(ImportRole::LoadPoints, "loads-b.csv", "1,0,0,200\n"),
            ],
        );

        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Multiple import sources"));
    }

    fn project() -> crate::PilePlanProject {
        import_project_from_generic_sources(
            "Refresh project",
            &[
                csv_source(ImportRole::LoadPoints, "loads.csv", "1,0,0,100\n"),
                csv_source(ImportRole::Cpts, "cpts.csv", "61,0,0\n"),
                csv_source(
                    ImportRole::BearingCapacities,
                    "capacities.csv",
                    "61,-17.5,290,700\n",
                ),
            ],
        )
        .unwrap()
    }

    fn selected_pile() -> SelectedPileChoice {
        SelectedPileChoice {
            pile: Some(PileConfigurationKey {
                pile_size_mm: 290,
                pile_tip_level_m_key: -17500,
            }),
            external_references: vec![],
        }
    }

    fn local_settings() -> CptSelectionSettings {
        CptSelectionSettings {
            algorithm: CptSelectionAlgorithm::MaximumAngle,
            max_distance_m: 18.0,
            monopoly_distance_m: 1.0,
            max_angle_degrees: 100.0,
        }
    }

    fn csv_source(role: ImportRole, file_name: &str, contents: &str) -> ImportSource {
        ImportSource {
            role,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
            file_name: file_name.to_string(),
            format: SourceFormat::Csv,
            bytes: contents.as_bytes().to_vec(),
        }
    }

    fn load_point(id: u32, x_mm: f64, y_mm: f64) -> ProjectLoadPoint {
        ProjectLoadPoint {
            id,
            name: format!("Load point {id}"),
            x_mm,
            y_mm,
            design_load_kn: 100.0,
        }
    }

    fn cpt(id: u32, x_mm: f64, y_mm: f64) -> ProjectCpt {
        ProjectCpt {
            id,
            name: format!("CPT {id}"),
            x_mm,
            y_mm,
        }
    }
}
