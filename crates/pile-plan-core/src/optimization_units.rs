use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    aggregate_pile_options_for_load_points, calculate_pile_cost, AggregatedPileConfigurationStatus,
    LoadPointGroup, PileConfigurationKey, PileConfigurationOption, PileCostSettings,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OptimizationCandidateSettings {
    pub max_utilization: f64,
    pub enabled_pile_sizes: Vec<u32>,
    pub enabled_pile_tip_levels_mm: Vec<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PrepareOptimizationUnitsInput {
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub candidate_settings: OptimizationCandidateSettings,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OptimizationUnit {
    pub load_point_ids: Vec<u32>,
    pub forced_configuration: Option<PileConfigurationKey>,
    pub has_technically_valid_configuration: bool,
    pub technically_valid_load_point_ids: Vec<u32>,
    pub options: Vec<OptimizationUnitOption>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OptimizationUnitOption {
    pub configuration: PileConfigurationKey,
    pub total_cost: u64,
    pub maximum_utilization: f64,
    pub critical_load_point_id: u32,
    pub critical_governing_cpt_id: Option<u32>,
    pub critical_governing_frd_kn: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationPreparationDiagnosticKind {
    InvalidGroupPartition,
    MissingPileHeadLevel,
    MissingAnalysisData,
    ConflictingLockedConfigurations,
    LockedMemberUnassigned,
    LockedConfigurationUnavailable,
    LockedConfigurationExceedsUtilizationLimit,
    MissingRelevantCost,
    NoEligibleConfiguration,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OptimizationPreparationDiagnostic {
    pub kind: OptimizationPreparationDiagnosticKind,
    pub load_point_ids: Vec<u32>,
    pub configuration: Option<PileConfigurationKey>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OptimizationPreparationResult {
    pub units: Vec<OptimizationUnit>,
    pub diagnostics: Vec<OptimizationPreparationDiagnostic>,
}

pub fn prepare_optimization_units(
    input: &PrepareOptimizationUnitsInput,
) -> OptimizationPreparationResult {
    let enabled_sizes = input
        .candidate_settings
        .enabled_pile_sizes
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let enabled_tip_levels = input
        .candidate_settings
        .enabled_pile_tip_levels_mm
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let max_utilization = input.candidate_settings.max_utilization.clamp(0.0, 1.0);
    let locked_load_point_ids = input
        .locked_load_point_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut groups = input.groups.clone();
    for group in &mut groups {
        group.load_point_ids.sort_unstable();
        group.load_point_ids.dedup();
    }
    groups.sort_by(|left, right| left.load_point_ids.cmp(&right.load_point_ids));
    let mut diagnostics = Vec::new();

    if input.pile_head_level_m.is_none() {
        diagnostics.push(OptimizationPreparationDiagnostic {
            kind: OptimizationPreparationDiagnosticKind::MissingPileHeadLevel,
            load_point_ids: Vec::new(),
            configuration: None,
        });
    }

    let mut units = Vec::with_capacity(groups.len());
    for group in groups {
        let missing_analysis_ids = group
            .load_point_ids
            .iter()
            .filter(|load_point_id| !input.options_by_load_point.contains_key(load_point_id))
            .copied()
            .collect::<Vec<_>>();
        if !missing_analysis_ids.is_empty() {
            diagnostics.push(OptimizationPreparationDiagnostic {
                kind: OptimizationPreparationDiagnosticKind::MissingAnalysisData,
                load_point_ids: missing_analysis_ids.clone(),
                configuration: None,
            });
        }

        let member_options = group
            .load_point_ids
            .iter()
            .filter_map(|load_point_id| {
                input
                    .options_by_load_point
                    .get(load_point_id)
                    .cloned()
                    .map(|options| (*load_point_id, options))
            })
            .collect::<HashMap<_, _>>();
        let aggregates = if missing_analysis_ids.is_empty() {
            aggregate_pile_options_for_load_points(&member_options)
        } else {
            Vec::new()
        };
        let has_technically_valid_configuration = aggregates
            .iter()
            .any(|candidate| candidate.status == AggregatedPileConfigurationStatus::Valid);
        let technically_valid_load_point_ids = member_options
            .iter()
            .filter(|(_, options)| options.iter().any(|option| option.is_option))
            .map(|(load_point_id, _)| *load_point_id)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let locked_members = group
            .load_point_ids
            .iter()
            .filter(|load_point_id| locked_load_point_ids.contains(load_point_id))
            .copied()
            .collect::<Vec<_>>();
        let unassigned_locked_members = locked_members
            .iter()
            .filter(|load_point_id| !input.current_assignments.contains_key(load_point_id))
            .copied()
            .collect::<Vec<_>>();
        let locked_configurations = locked_members
            .iter()
            .filter_map(|load_point_id| input.current_assignments.get(load_point_id).cloned())
            .collect::<BTreeSet<_>>();

        let mut group_has_specific_error = !missing_analysis_ids.is_empty();
        if !unassigned_locked_members.is_empty() {
            group_has_specific_error = true;
            diagnostics.push(OptimizationPreparationDiagnostic {
                kind: OptimizationPreparationDiagnosticKind::LockedMemberUnassigned,
                load_point_ids: unassigned_locked_members.clone(),
                configuration: None,
            });
        }
        if locked_configurations.len() > 1 {
            group_has_specific_error = true;
            diagnostics.push(OptimizationPreparationDiagnostic {
                kind: OptimizationPreparationDiagnosticKind::ConflictingLockedConfigurations,
                load_point_ids: locked_members.clone(),
                configuration: None,
            });
        }

        let forced_configuration = (unassigned_locked_members.is_empty()
            && locked_configurations.len() == 1)
            .then(|| locked_configurations.iter().next().cloned())
            .flatten();
        let mut eligible = Vec::new();

        if !group_has_specific_error {
            if let Some(forced) = &forced_configuration {
                let forced_aggregate = aggregates
                    .iter()
                    .find(|candidate| &candidate.configuration == forced);
                match forced_aggregate {
                    Some(candidate)
                        if candidate.status == AggregatedPileConfigurationStatus::Valid =>
                    {
                        let exceeding_unlocked_members = group
                            .load_point_ids
                            .iter()
                            .filter(|load_point_id| !locked_load_point_ids.contains(load_point_id))
                            .filter(|load_point_id| {
                                member_options
                                    .get(load_point_id)
                                    .and_then(|options| {
                                        options
                                            .iter()
                                            .filter(|option| &option.configuration == forced)
                                            .filter_map(|option| option.utilization)
                                            .max_by(f64::total_cmp)
                                    })
                                    .is_none_or(|utilization| utilization > max_utilization)
                            })
                            .copied()
                            .collect::<Vec<_>>();
                        if exceeding_unlocked_members.is_empty() {
                            eligible.push(candidate);
                        } else {
                            diagnostics.push(OptimizationPreparationDiagnostic {
                                kind: OptimizationPreparationDiagnosticKind::LockedConfigurationExceedsUtilizationLimit,
                                load_point_ids: exceeding_unlocked_members,
                                configuration: Some(forced.clone()),
                            });
                        }
                    }
                    _ => {
                        diagnostics.push(OptimizationPreparationDiagnostic {
                            kind: OptimizationPreparationDiagnosticKind::LockedConfigurationUnavailable,
                            load_point_ids: group.load_point_ids.clone(),
                            configuration: Some(forced.clone()),
                        });
                    }
                }
            } else {
                eligible.extend(aggregates.iter().filter(|candidate| {
                    candidate.status == AggregatedPileConfigurationStatus::Valid
                        && enabled_sizes.contains(&candidate.configuration.pile_size_mm)
                        && enabled_tip_levels.contains(&candidate.configuration.pile_tip_level_mm)
                        && candidate
                            .maximum_utilization
                            .is_some_and(|utilization| utilization <= max_utilization)
                }));
            }
        }

        let mut options = Vec::new();
        if let Some(pile_head_level_m) = input.pile_head_level_m {
            for candidate in eligible {
                let Some(member_cost) = calculate_pile_cost(
                    candidate.configuration.pile_size_mm,
                    candidate.configuration.pile_tip_level_m(),
                    pile_head_level_m,
                    &input.cost_settings,
                ) else {
                    diagnostics.push(OptimizationPreparationDiagnostic {
                        kind: OptimizationPreparationDiagnosticKind::MissingRelevantCost,
                        load_point_ids: group.load_point_ids.clone(),
                        configuration: Some(candidate.configuration.clone()),
                    });
                    continue;
                };
                let (Some(maximum_utilization), Some(critical_load_point_id)) = (
                    candidate.maximum_utilization,
                    candidate.critical_load_point_id,
                ) else {
                    continue;
                };
                options.push(OptimizationUnitOption {
                    configuration: candidate.configuration.clone(),
                    total_cost: u64::from(member_cost) * group.load_point_ids.len() as u64,
                    maximum_utilization,
                    critical_load_point_id,
                    critical_governing_cpt_id: candidate.critical_governing_cpt_id,
                    critical_governing_frd_kn: candidate.critical_governing_frd_kn,
                });
            }
        }
        options.sort_by(|left, right| left.configuration.cmp(&right.configuration));
        units.push(OptimizationUnit {
            load_point_ids: group.load_point_ids,
            forced_configuration,
            has_technically_valid_configuration,
            technically_valid_load_point_ids,
            options,
        });
    }

    OptimizationPreparationResult { units, diagnostics }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{
        LoadPointGroup, PileConfigurationKey, PileConfigurationOption, PileCostSettings,
        PileCostSettingsItem, PileCostShape,
    };

    use super::{
        prepare_optimization_units, OptimizationCandidateSettings,
        OptimizationPreparationDiagnosticKind, PrepareOptimizationUnitsInput,
    };

    fn configuration(pile_size_mm: u32, pile_tip_level_mm: i64) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm,
            pile_tip_level_mm,
        }
    }

    fn option(
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
        is_option: bool,
        utilization: f64,
        governing_cpt_id: u32,
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: configuration(pile_size_mm, pile_tip_level_mm),
            pile_size_mm,
            pile_tip_level_m: pile_tip_level_mm as f64 / 1000.0,
            is_option,
            governing_cpt_id: Some(governing_cpt_id),
            governing_frd_kn: Some(1_000.0),
            utilization: Some(utilization),
            missing_cpt_ids: Vec::new(),
            technical_status: crate::pile_option_technical_status(
                is_option,
                Some(utilization),
                &[],
            ),
        }
    }

    fn input(
        groups: &[&[u32]],
        options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    ) -> PrepareOptimizationUnitsInput {
        PrepareOptimizationUnitsInput {
            groups: groups
                .iter()
                .map(|ids| LoadPointGroup {
                    load_point_ids: ids.to_vec(),
                })
                .collect(),
            options_by_load_point,
            current_assignments: HashMap::new(),
            locked_load_point_ids: Vec::new(),
            pile_head_level_m: Some(0.0),
            cost_settings: PileCostSettings {
                schema_version: 1,
                items: vec![
                    PileCostSettingsItem {
                        pile_size_mm: 1000,
                        shape: PileCostShape::Square,
                        cost_per_m3: 100.0,
                    },
                    PileCostSettingsItem {
                        pile_size_mm: 1200,
                        shape: PileCostShape::Square,
                        cost_per_m3: 100.0,
                    },
                ],
            },
            candidate_settings: OptimizationCandidateSettings {
                max_utilization: 0.95,
                enabled_pile_sizes: vec![1000, 1200],
                enabled_pile_tip_levels_mm: vec![-10_000, -12_000],
            },
        }
    }

    #[test]
    fn preserves_singletons_as_optimization_units() {
        let result = prepare_optimization_units(&input(
            &[&[7]],
            HashMap::from([(7, vec![option(1000, -10_000, true, 0.7, 17)])]),
        ));

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.units.len(), 1);
        assert_eq!(result.units[0].load_point_ids, vec![7]);
        assert_eq!(result.units[0].options.len(), 1);
    }

    #[test]
    fn retains_only_configurations_valid_for_every_group_member() {
        let result = prepare_optimization_units(&input(
            &[&[1, 2]],
            HashMap::from([
                (
                    1,
                    vec![
                        option(1000, -10_000, true, 0.70, 11),
                        option(1200, -12_000, true, 0.60, 12),
                    ],
                ),
                (
                    2,
                    vec![
                        option(1000, -10_000, true, 0.80, 21),
                        option(1200, -12_000, false, 1.10, 22),
                    ],
                ),
            ]),
        ));

        assert_eq!(
            result.units[0]
                .options
                .iter()
                .map(|option| option.configuration.clone())
                .collect::<Vec<_>>(),
            vec![configuration(1000, -10_000)]
        );
    }

    #[test]
    fn applies_enabled_filters_and_maximum_utilization() {
        let mut prepared_input = input(
            &[&[1]],
            HashMap::from([(
                1,
                vec![
                    option(1000, -10_000, true, 0.96, 11),
                    option(1200, -12_000, true, 0.70, 12),
                ],
            )]),
        );
        prepared_input.candidate_settings.enabled_pile_sizes = vec![1000];

        let result = prepare_optimization_units(&prepared_input);

        assert!(result.units[0].options.is_empty());
    }

    #[test]
    fn group_option_sums_cost_and_reports_critical_member() {
        let result = prepare_optimization_units(&input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1000, -10_000, true, 0.90, 22)]),
            ]),
        ));
        let option = &result.units[0].options[0];

        assert_eq!(option.total_cost, 2_000);
        assert_eq!(option.maximum_utilization, 0.90);
        assert_eq!(option.critical_load_point_id, 2);
        assert_eq!(option.critical_governing_cpt_id, Some(22));
    }

    #[test]
    fn critical_member_ties_are_deterministic() {
        let result = prepare_optimization_units(&input(
            &[&[8, 2]],
            HashMap::from([
                (8, vec![option(1000, -10_000, true, 0.80, 18)]),
                (2, vec![option(1000, -10_000, true, 0.80, 12)]),
            ]),
        ));

        assert_eq!(result.units[0].load_point_ids, vec![2, 8]);
        assert_eq!(result.units[0].options[0].critical_load_point_id, 2);
    }

    #[test]
    fn common_locked_configuration_bypasses_enabled_filters() {
        let forced = configuration(1200, -12_000);
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1200, -12_000, true, 0.70, 11)]),
                (2, vec![option(1200, -12_000, true, 0.75, 21)]),
            ]),
        );
        prepared_input.candidate_settings.enabled_pile_sizes = vec![1000];
        prepared_input.candidate_settings.enabled_pile_tip_levels_mm = vec![-10_000];
        prepared_input.current_assignments = HashMap::from([(1, forced.clone())]);
        prepared_input.locked_load_point_ids = vec![1];

        let result = prepare_optimization_units(&prepared_input);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.units[0].forced_configuration, Some(forced.clone()));
        assert_eq!(result.units[0].options[0].configuration, forced);
    }

    #[test]
    fn locked_members_are_exempt_from_the_optimization_utilization_limit() {
        let forced = configuration(1000, -10_000);
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.99, 11)]),
                (2, vec![option(1000, -10_000, true, 0.75, 21)]),
            ]),
        );
        prepared_input.candidate_settings.max_utilization = 0.80;
        prepared_input.current_assignments = HashMap::from([(1, forced.clone())]);
        prepared_input.locked_load_point_ids = vec![1];

        let result = prepare_optimization_units(&prepared_input);

        assert!(result.diagnostics.is_empty());
        assert_eq!(result.units[0].options[0].maximum_utilization, 0.99);
    }

    #[test]
    fn conflicting_locked_configurations_are_reported() {
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1200, -12_000, true, 0.70, 21)]),
            ]),
        );
        prepared_input.current_assignments = HashMap::from([
            (1, configuration(1000, -10_000)),
            (2, configuration(1200, -12_000)),
        ]);
        prepared_input.locked_load_point_ids = vec![1, 2];

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::ConflictingLockedConfigurations
        );
        assert!(result.units[0].options.is_empty());
    }

    #[test]
    fn unassigned_locked_members_are_reported() {
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1000, -10_000, true, 0.70, 21)]),
            ]),
        );
        prepared_input.locked_load_point_ids = vec![2];

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(result.diagnostics[0].load_point_ids, vec![2]);
        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::LockedMemberUnassigned
        );
    }

    #[test]
    fn forced_configuration_must_be_technically_available_for_every_member() {
        let forced = configuration(1000, -10_000);
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1000, -10_000, false, 1.10, 21)]),
            ]),
        );
        prepared_input.current_assignments = HashMap::from([(1, forced.clone())]);
        prepared_input.locked_load_point_ids = vec![1];

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::LockedConfigurationUnavailable
        );
        assert_eq!(result.diagnostics[0].configuration, Some(forced));
    }

    #[test]
    fn forced_configuration_applies_utilization_limit_to_unlocked_members() {
        let forced = configuration(1000, -10_000);
        let mut prepared_input = input(
            &[&[1, 2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1000, -10_000, true, 0.90, 21)]),
            ]),
        );
        prepared_input.candidate_settings.max_utilization = 0.80;
        prepared_input.current_assignments = HashMap::from([(1, forced.clone())]);
        prepared_input.locked_load_point_ids = vec![1];

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::LockedConfigurationExceedsUtilizationLimit
        );
        assert_eq!(result.diagnostics[0].load_point_ids, vec![2]);
        assert_eq!(result.diagnostics[0].configuration, Some(forced));
    }

    #[test]
    fn missing_head_level_is_one_global_diagnostic() {
        let mut prepared_input = input(
            &[&[1], &[2]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1000, -10_000, true, 0.70, 21)]),
            ]),
        );
        prepared_input.pile_head_level_m = None;

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::MissingPileHeadLevel
        );
        assert!(result.diagnostics[0].load_point_ids.is_empty());
    }

    #[test]
    fn missing_cost_for_an_eligible_configuration_is_reported() {
        let mut prepared_input = input(
            &[&[1]],
            HashMap::from([(1, vec![option(1000, -10_000, true, 0.70, 11)])]),
        );
        prepared_input.cost_settings.items.clear();

        let result = prepare_optimization_units(&prepared_input);

        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::MissingRelevantCost
        );
        assert_eq!(
            result.diagnostics[0].configuration,
            Some(configuration(1000, -10_000))
        );
    }

    #[test]
    fn absent_member_analysis_is_reported() {
        let result = prepare_optimization_units(&input(
            &[&[1, 2]],
            HashMap::from([(1, vec![option(1000, -10_000, true, 0.70, 11)])]),
        ));

        assert_eq!(
            result.diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::MissingAnalysisData
        );
        assert_eq!(result.diagnostics[0].load_point_ids, vec![2]);
    }

    #[test]
    fn empty_candidate_domain_is_retained_as_a_non_blocking_unit() {
        let result = prepare_optimization_units(&input(
            &[&[1]],
            HashMap::from([(1, vec![option(1000, -10_000, false, 1.10, 11)])]),
        ));

        assert!(result.diagnostics.is_empty());
        assert!(result.units[0].options.is_empty());
        assert!(!result.units[0].has_technically_valid_configuration);
    }

    #[test]
    fn diagnostics_are_collected_across_all_groups() {
        let mut prepared_input = input(
            &[&[1, 2], &[10, 11]],
            HashMap::from([
                (1, vec![option(1000, -10_000, true, 0.70, 11)]),
                (2, vec![option(1200, -12_000, true, 0.70, 21)]),
                (10, vec![option(1000, -10_000, true, 0.70, 110)]),
            ]),
        );
        prepared_input.current_assignments = HashMap::from([
            (1, configuration(1000, -10_000)),
            (2, configuration(1200, -12_000)),
        ]);
        prepared_input.locked_load_point_ids = vec![1, 2];

        let result = prepare_optimization_units(&prepared_input);
        let kinds = result
            .diagnostics
            .iter()
            .map(|diagnostic| diagnostic.kind.clone())
            .collect::<Vec<_>>();

        assert!(
            kinds.contains(&OptimizationPreparationDiagnosticKind::ConflictingLockedConfigurations)
        );
        assert!(kinds.contains(&OptimizationPreparationDiagnosticKind::MissingAnalysisData));
    }
}
