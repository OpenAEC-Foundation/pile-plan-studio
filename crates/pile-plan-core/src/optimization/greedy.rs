use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    prepare_optimization_units, LoadPointGroup, OptimizationCandidateSettings,
    OptimizationPreparationDiagnostic, OptimizationPreparationDiagnosticKind, OptimizationUnit,
    OptimizationUnitOption, PileConfigurationKey, PileConfigurationOption, PileCostSettings,
    PrepareOptimizationUnitsInput,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationSettings {
    pub max_pile_sizes: usize,
    pub max_pile_tip_levels: usize,
    pub max_pile_configurations: usize,
    #[serde(default = "default_max_utilization")]
    pub max_utilization: f64,
    #[serde(default)]
    pub candidate_source: OptimizationCandidateSource,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationCandidateSource {
    #[default]
    AllAvailable,
    ActiveLegend,
}

fn default_max_utilization() -> f64 {
    1.0
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OptimizationLimitScope {
    Target,
    WholePlan,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationInput {
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub locked_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub limit_scope: OptimizationLimitScope,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub candidate_configurations: Vec<PileConfigurationKey>,
    pub settings: GreedyOptimizationSettings,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizedPileChoice {
    pub load_point_id: u32,
    pub configuration: PileConfigurationKey,
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub is_option: bool,
    pub cost: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OptimizationUnassignedReason {
    OptimizationConstraints,
    ConfigurationLimits,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct OptimizationUnassignedLoadPoint {
    pub load_point_id: u32,
    pub reason: OptimizationUnassignedReason,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationResult {
    pub assignments: Vec<GreedyOptimizedPileChoice>,
    pub unassigned: Vec<OptimizationUnassignedLoadPoint>,
    pub technical_unassigned_load_point_ids: Vec<u32>,
    pub unassigned_group_count: usize,
    pub selected_configurations: Vec<PileConfigurationKey>,
    pub pile_size_count: usize,
    pub pile_tip_level_count: usize,
    pub configuration_count: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum GreedyOptimizationOutcome {
    Completed {
        result: GreedyOptimizationResult,
    },
    Blocked {
        diagnostics: Vec<OptimizationPreparationDiagnostic>,
    },
}

pub fn greedy_optimize_pile_choices(input: &GreedyOptimizationInput) -> GreedyOptimizationOutcome {
    let target_groups = match select_target_groups(&input.groups, &input.target_load_point_ids) {
        Ok(groups) => groups,
        Err(diagnostic) => {
            return GreedyOptimizationOutcome::Blocked {
                diagnostics: vec![diagnostic],
            };
        }
    };
    let expanded_target_ids = target_groups
        .iter()
        .flat_map(|group| group.load_point_ids.iter().copied())
        .collect::<HashSet<_>>();
    let preparation = prepare_optimization_units(&PrepareOptimizationUnitsInput {
        groups: target_groups,
        options_by_load_point: input.options_by_load_point.clone(),
        current_assignments: input.current_assignments.clone(),
        locked_load_point_ids: input.locked_load_point_ids.clone(),
        pile_head_level_m: input.pile_head_level_m,
        cost_settings: input.cost_settings.clone(),
        candidate_settings: OptimizationCandidateSettings {
            max_utilization: input.settings.max_utilization,
            enabled_configurations: input.candidate_configurations.clone(),
        },
    });

    if !preparation.diagnostics.is_empty() {
        return GreedyOptimizationOutcome::Blocked {
            diagnostics: preparation.diagnostics,
        };
    }

    let baseline_configurations = if input.limit_scope == OptimizationLimitScope::WholePlan {
        input
            .current_assignments
            .iter()
            .filter(|(load_point_id, _)| !expanded_target_ids.contains(load_point_id))
            .map(|(_, configuration)| configuration.clone())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    GreedyOptimizationOutcome::Completed {
        result: greedy_optimize_units(
            &preparation.units,
            &preparation.technical_unassigned_load_point_ids,
            &baseline_configurations,
            &input.locked_load_point_ids,
            &input.settings,
        ),
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct OptimizationScore {
    uncovered_load_point_count: usize,
    known_total_cost: u64,
}

fn greedy_optimize_units(
    units: &[OptimizationUnit],
    technical_unassigned_load_point_ids: &[u32],
    baseline_configurations: &[PileConfigurationKey],
    locked_load_point_ids: &[u32],
    settings: &GreedyOptimizationSettings,
) -> GreedyOptimizationResult {
    let mut baseline_configurations = baseline_configurations.to_vec();
    baseline_configurations.sort();
    baseline_configurations.dedup();
    let mut selected_configurations = units
        .iter()
        .filter_map(|unit| unit.forced_configuration.clone())
        .collect::<Vec<_>>();
    selected_configurations.sort();
    selected_configurations.dedup();
    let all_candidates = units
        .iter()
        .flat_map(|unit| {
            unit.options
                .iter()
                .map(|option| option.configuration.clone())
        })
        .collect::<BTreeSet<_>>();
    let mut current_score = optimization_score_for_configurations(units, &selected_configurations);

    loop {
        let next = all_candidates
            .iter()
            .filter(|candidate| !selected_configurations.contains(candidate))
            .filter(|candidate| {
                candidate_respects_limits(
                    candidate,
                    &selected_configurations,
                    &baseline_configurations,
                    settings,
                )
            })
            .map(|candidate| {
                let mut next_configurations = selected_configurations.clone();
                next_configurations.push(candidate.clone());
                let score = optimization_score_for_configurations(units, &next_configurations);
                (score, candidate.clone())
            })
            .min_by(|(left_score, left), (right_score, right)| {
                left_score.cmp(right_score).then_with(|| left.cmp(right))
            });
        let Some((next_score, next_configuration)) = next else {
            break;
        };
        if next_score >= current_score {
            break;
        }
        selected_configurations.push(next_configuration);
        selected_configurations.sort();
        current_score = next_score;
    }

    expand_unit_results(
        units,
        technical_unassigned_load_point_ids,
        &selected_configurations,
        &baseline_configurations,
        locked_load_point_ids,
    )
}

fn optimization_score_for_configurations(
    units: &[OptimizationUnit],
    configurations: &[PileConfigurationKey],
) -> OptimizationScore {
    let mut score = OptimizationScore {
        uncovered_load_point_count: 0,
        known_total_cost: 0,
    };
    for unit in units {
        match cheapest_unit_option(unit, configurations) {
            Some(option) => score.known_total_cost += option.total_cost,
            None => score.uncovered_load_point_count += unit.load_point_ids.len(),
        }
    }
    score
}

fn cheapest_unit_option<'a>(
    unit: &'a OptimizationUnit,
    configurations: &[PileConfigurationKey],
) -> Option<&'a OptimizationUnitOption> {
    unit.options
        .iter()
        .filter(|option| configurations.contains(&option.configuration))
        .min_by(|left, right| {
            left.total_cost
                .cmp(&right.total_cost)
                .then_with(|| left.configuration.cmp(&right.configuration))
        })
}

fn candidate_respects_limits(
    candidate: &PileConfigurationKey,
    selected_configurations: &[PileConfigurationKey],
    baseline_configurations: &[PileConfigurationKey],
    settings: &GreedyOptimizationSettings,
) -> bool {
    let before = baseline_configurations
        .iter()
        .chain(selected_configurations)
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut after = before.clone();
    after.insert(candidate.clone());

    count_respects_limit(
        distinct_size_count(&before),
        distinct_size_count(&after),
        settings.max_pile_sizes.max(1),
    ) && count_respects_limit(
        distinct_tip_count(&before),
        distinct_tip_count(&after),
        settings.max_pile_tip_levels.max(1),
    ) && count_respects_limit(
        before.len(),
        after.len(),
        settings.max_pile_configurations.max(1),
    )
}

fn count_respects_limit(before: usize, after: usize, limit: usize) -> bool {
    after <= limit || (before > limit && after <= before)
}

fn distinct_size_count(configurations: &BTreeSet<PileConfigurationKey>) -> usize {
    configurations
        .iter()
        .map(|configuration| configuration.pile_size_mm)
        .collect::<BTreeSet<_>>()
        .len()
}

fn distinct_tip_count(configurations: &BTreeSet<PileConfigurationKey>) -> usize {
    configurations
        .iter()
        .map(|configuration| configuration.pile_tip_level_mm)
        .collect::<BTreeSet<_>>()
        .len()
}

fn expand_unit_results(
    units: &[OptimizationUnit],
    technical_unassigned_load_point_ids: &[u32],
    selected_configurations: &[PileConfigurationKey],
    baseline_configurations: &[PileConfigurationKey],
    locked_load_point_ids: &[u32],
) -> GreedyOptimizationResult {
    let locked_load_point_ids = locked_load_point_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut assignments = Vec::new();
    let mut unassigned = Vec::new();
    let mut unassigned_group_count = 0;

    for unit in units {
        if let Some(option) = cheapest_unit_option(unit, selected_configurations) {
            let member_cost = u64::try_from(unit.load_point_ids.len())
                .ok()
                .filter(|count| *count > 0)
                .and_then(|count| u32::try_from(option.total_cost / count).ok());
            for load_point_id in &unit.load_point_ids {
                if locked_load_point_ids.contains(load_point_id) {
                    continue;
                }
                assignments.push(GreedyOptimizedPileChoice {
                    load_point_id: *load_point_id,
                    configuration: option.configuration.clone(),
                    pile_size_mm: option.configuration.pile_size_mm,
                    pile_tip_level_m: option.configuration.pile_tip_level_m(),
                    is_option: true,
                    cost: member_cost,
                });
            }
        } else {
            let has_unlocked_member = unit
                .load_point_ids
                .iter()
                .any(|load_point_id| !locked_load_point_ids.contains(load_point_id));
            if has_unlocked_member {
                unassigned_group_count += 1;
            }
            for load_point_id in &unit.load_point_ids {
                if !locked_load_point_ids.contains(load_point_id) {
                    let reason = if !unit.options.is_empty() {
                        OptimizationUnassignedReason::ConfigurationLimits
                    } else {
                        OptimizationUnassignedReason::OptimizationConstraints
                    };
                    unassigned.push(OptimizationUnassignedLoadPoint {
                        load_point_id: *load_point_id,
                        reason,
                    });
                }
            }
        }
    }
    assignments.sort_by_key(|choice| choice.load_point_id);
    unassigned.sort_by_key(|item| item.load_point_id);

    let mut selected_configurations = selected_configurations.to_vec();
    selected_configurations.sort();
    selected_configurations.dedup();
    let counted_configurations = baseline_configurations
        .iter()
        .chain(&selected_configurations)
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut technical_unassigned_load_point_ids = technical_unassigned_load_point_ids.to_vec();
    technical_unassigned_load_point_ids.sort_unstable();
    technical_unassigned_load_point_ids.dedup();

    GreedyOptimizationResult {
        assignments,
        unassigned,
        technical_unassigned_load_point_ids,
        unassigned_group_count,
        selected_configurations,
        pile_size_count: distinct_size_count(&counted_configurations),
        pile_tip_level_count: distinct_tip_count(&counted_configurations),
        configuration_count: counted_configurations.len(),
    }
}

pub(crate) fn select_target_groups(
    groups: &[LoadPointGroup],
    target_ids: &[u32],
) -> Result<Vec<LoadPointGroup>, OptimizationPreparationDiagnostic> {
    let target_ids = target_ids.iter().copied().collect::<BTreeSet<_>>();
    let mut normalized_groups = groups
        .iter()
        .map(|group| {
            let mut load_point_ids = group.load_point_ids.clone();
            load_point_ids.sort_unstable();
            load_point_ids.dedup();
            LoadPointGroup { load_point_ids }
        })
        .collect::<Vec<_>>();
    normalized_groups.sort_by(|left, right| left.load_point_ids.cmp(&right.load_point_ids));

    let membership_counts = normalized_groups
        .iter()
        .flat_map(|group| group.load_point_ids.iter().copied())
        .fold(
            BTreeMap::<u32, usize>::new(),
            |mut counts, load_point_id| {
                *counts.entry(load_point_id).or_default() += 1;
                counts
            },
        );
    let selected_groups = normalized_groups
        .into_iter()
        .filter(|group| {
            group
                .load_point_ids
                .iter()
                .any(|load_point_id| target_ids.contains(load_point_id))
        })
        .collect::<Vec<_>>();
    let invalid_ids = target_ids
        .iter()
        .copied()
        .chain(
            selected_groups
                .iter()
                .flat_map(|group| group.load_point_ids.iter().copied()),
        )
        .filter(|load_point_id| membership_counts.get(load_point_id).copied() != Some(1))
        .collect::<BTreeSet<_>>();

    if invalid_ids.is_empty() {
        Ok(selected_groups)
    } else {
        Err(OptimizationPreparationDiagnostic {
            kind: OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
            load_point_ids: invalid_ids.into_iter().collect(),
            configuration: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeSet, HashMap};

    use crate::{LoadPointGroup, OptimizationPreparationDiagnosticKind};

    use crate::{
        PileConfigurationKey, PileConfigurationOption, PileCostSettings, PileCostSettingsItem,
        PileCostShape,
    };

    use super::{
        greedy_optimize_pile_choices, select_target_groups, GreedyOptimizationInput,
        GreedyOptimizationOutcome, GreedyOptimizationSettings, OptimizationCandidateSource,
        OptimizationLimitScope, OptimizationUnassignedLoadPoint, OptimizationUnassignedReason,
    };

    fn group(load_point_ids: &[u32]) -> LoadPointGroup {
        LoadPointGroup {
            load_point_ids: load_point_ids.to_vec(),
        }
    }

    fn configuration(pile_size_mm: u32, pile_tip_level_mm: i64) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm,
            pile_tip_level_mm,
        }
    }

    fn option(
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
        utilization: f64,
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: configuration(pile_size_mm, pile_tip_level_mm),
            pile_size_mm,
            pile_tip_level_m: pile_tip_level_mm as f64 / 1_000.0,
            is_option: true,
            governing_cpt_id: Some(1),
            governing_frd_kn: Some(1_000.0),
            utilization: Some(utilization),
            missing_cpt_ids: Vec::new(),
            technical_status: crate::pile_option_technical_status(true, Some(utilization), &[]),
        }
    }

    fn invalid_option(
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
        utilization: f64,
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            is_option: false,
            technical_status: crate::PileOptionTechnicalStatus::InsufficientCapacity,
            ..option(pile_size_mm, pile_tip_level_mm, utilization)
        }
    }

    fn cost_settings(sizes: &[u32]) -> PileCostSettings {
        PileCostSettings {
            schema_version: 1,
            items: sizes
                .iter()
                .map(|pile_size_mm| PileCostSettingsItem {
                    pile_size_mm: *pile_size_mm,
                    shape: PileCostShape::Square,
                    cost_per_m3: 100.0,
                })
                .collect(),
        }
    }

    fn unit_option(
        configuration: PileConfigurationKey,
        total_cost: u64,
    ) -> crate::OptimizationUnitOption {
        crate::OptimizationUnitOption {
            configuration,
            total_cost,
            maximum_utilization: 0.75,
            critical_load_point_id: 1,
            critical_governing_cpt_id: Some(1),
            critical_governing_frd_kn: Some(1_000.0),
        }
    }

    fn unit(
        load_point_ids: &[u32],
        forced_configuration: Option<PileConfigurationKey>,
        options: Vec<crate::OptimizationUnitOption>,
    ) -> crate::OptimizationUnit {
        crate::OptimizationUnit {
            load_point_ids: load_point_ids.to_vec(),
            forced_configuration,
            options,
        }
    }

    fn optimization_input(
        groups: Vec<LoadPointGroup>,
        options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    ) -> GreedyOptimizationInput {
        let target_load_point_ids = groups
            .iter()
            .flat_map(|group| group.load_point_ids.iter().copied())
            .collect();
        let candidate_configurations = options_by_load_point
            .values()
            .flatten()
            .map(|option| option.configuration.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        GreedyOptimizationInput {
            groups,
            options_by_load_point,
            target_load_point_ids,
            locked_load_point_ids: Vec::new(),
            current_assignments: HashMap::new(),
            limit_scope: OptimizationLimitScope::Target,
            pile_head_level_m: Some(-3.5),
            cost_settings: cost_settings(&[290, 320]),
            candidate_configurations,
            settings: GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 2,
                max_utilization: 1.0,
                candidate_source: OptimizationCandidateSource::AllAvailable,
            },
        }
    }

    #[test]
    fn selected_member_expands_to_complete_group() {
        let groups = vec![group(&[1, 2]), group(&[3])];

        assert_eq!(
            select_target_groups(&groups, &[2]).expect("valid partition"),
            vec![group(&[1, 2])],
        );
    }

    #[test]
    fn duplicate_selected_membership_is_blocked() {
        let groups = vec![group(&[1, 2]), group(&[2, 3])];

        let diagnostic = select_target_groups(&groups, &[2]).expect_err("invalid partition");

        assert_eq!(
            diagnostic.kind,
            OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
        );
        assert_eq!(diagnostic.load_point_ids, vec![2]);
        assert_eq!(diagnostic.configuration, None);
    }

    #[test]
    fn missing_target_membership_is_blocked() {
        let diagnostic =
            select_target_groups(&[group(&[1])], &[2]).expect_err("missing target membership");

        assert_eq!(
            diagnostic.kind,
            OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
        );
        assert_eq!(diagnostic.load_point_ids, vec![2]);
        assert_eq!(diagnostic.configuration, None);
    }

    #[test]
    fn grouped_run_assigns_one_common_configuration_to_every_member() {
        let input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([
                (1, vec![option(290, -18_000, 0.70)]),
                (2, vec![option(290, -18_000, 0.80)]),
            ]),
        );

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("valid grouped run should complete");
        };

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| (choice.load_point_id, choice.configuration.clone()))
                .collect::<Vec<_>>(),
            vec![
                (1, configuration(290, -18_000)),
                (2, configuration(290, -18_000)),
            ],
        );
    }

    #[test]
    fn group_with_individually_valid_but_no_common_configuration_is_unresolved() {
        let input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([
                (1, vec![option(290, -18_000, 0.70)]),
                (2, vec![option(320, -19_000, 0.80)]),
            ]),
        );

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("an infeasible group should not block other optimization units");
        };

        assert!(result.assignments.is_empty());
        assert_eq!(result.technical_unassigned_load_point_ids, vec![1, 2]);
        assert_eq!(result.unassigned_group_count, 0);
        assert!(result.unassigned.is_empty());
    }

    #[test]
    fn group_whose_members_all_lack_valid_options_is_not_counted_as_unresolved() {
        let input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([(1, vec![]), (2, vec![])]),
        );

        let GreedyOptimizationOutcome::Blocked { diagnostics } =
            greedy_optimize_pile_choices(&input)
        else {
            panic!("a project without configurations should be unavailable");
        };

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].kind,
            OptimizationPreparationDiagnosticKind::NoPileConfigurations
        );
    }

    #[test]
    fn group_filtered_by_optimizer_settings_is_unassigned_as_an_optimization_constraint() {
        let mut input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([
                (1, vec![option(320, -19_000, 0.70)]),
                (2, vec![option(320, -19_000, 0.80)]),
            ]),
        );
        input.candidate_configurations = vec![configuration(290, -18_000)];

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("filtered groups should not block other optimization units");
        };

        assert_eq!(
            result.unassigned,
            vec![
                OptimizationUnassignedLoadPoint {
                    load_point_id: 1,
                    reason: OptimizationUnassignedReason::OptimizationConstraints,
                },
                OptimizationUnassignedLoadPoint {
                    load_point_id: 2,
                    reason: OptimizationUnassignedReason::OptimizationConstraints,
                },
            ],
        );
    }

    #[test]
    fn one_member_without_options_leaves_the_complete_group_unassigned() {
        let input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([(1, vec![option(290, -18_000, 0.70)]), (2, vec![])]),
        );

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("an analyzed group without options should remain unresolved");
        };

        assert!(result.assignments.is_empty());
        assert_eq!(result.technical_unassigned_load_point_ids, vec![1, 2]);
        assert_eq!(result.unassigned_group_count, 0);
        assert!(result.unassigned.is_empty());
    }

    #[test]
    fn technically_invalid_group_does_not_block_a_valid_group() {
        let input = optimization_input(
            vec![group(&[1, 2]), group(&[3])],
            HashMap::from([
                (1, vec![option(290, -18_000, 0.70)]),
                (2, vec![option(320, -19_000, 0.80)]),
                (3, vec![option(290, -18_000, 0.75)]),
            ]),
        );

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("a technical issue must not block valid optimization units");
        };

        assert_eq!(result.technical_unassigned_load_point_ids, vec![1, 2]);
        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| choice.load_point_id)
                .collect::<Vec<_>>(),
            vec![3]
        );
        assert!(result.unassigned.is_empty());
        assert_eq!(result.unassigned_group_count, 0);
    }

    #[test]
    fn singleton_units_preserve_existing_configuration_limit_result() {
        let mut input = optimization_input(
            vec![group(&[1]), group(&[2]), group(&[3])],
            HashMap::from([
                (
                    1,
                    vec![option(290, -17_500, 0.50), option(320, -18_000, 0.60)],
                ),
                (
                    2,
                    vec![
                        invalid_option(290, -17_500, 1.10),
                        option(320, -18_000, 0.70),
                    ],
                ),
                (
                    3,
                    vec![option(350, -19_000, 0.80), option(320, -18_000, 0.90)],
                ),
            ]),
        );
        input.cost_settings = cost_settings(&[290, 320, 350]);
        input.settings.max_pile_sizes = 1;
        input.settings.max_pile_tip_levels = 1;
        input.settings.max_pile_configurations = 1;

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("valid singleton run should complete");
        };

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| (
                    choice.load_point_id,
                    choice.pile_size_mm,
                    choice.pile_tip_level_m,
                ))
                .collect::<Vec<_>>(),
            vec![(1, 320, -18.0), (2, 320, -18.0), (3, 320, -18.0)],
        );
        assert_eq!(result.pile_size_count, 1);
        assert_eq!(result.pile_tip_level_count, 1);
        assert_eq!(result.configuration_count, 1);
    }

    #[test]
    fn missing_relevant_cost_blocks_before_solving() {
        let mut input = optimization_input(
            vec![group(&[1])],
            HashMap::from([(1, vec![option(290, -18_000, 0.70)])]),
        );
        input.cost_settings.items.clear();

        let GreedyOptimizationOutcome::Blocked { diagnostics } =
            greedy_optimize_pile_choices(&input)
        else {
            panic!("missing cost should block optimization");
        };

        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.kind == OptimizationPreparationDiagnosticKind::MissingRelevantCost
        }));
    }

    #[test]
    fn coverage_score_counts_every_member_of_an_uncovered_unit() {
        let mut options_by_load_point = (1..=6)
            .map(|id| (id, vec![option(290, -18_000, 0.70)]))
            .collect::<HashMap<_, _>>();
        options_by_load_point.insert(7, vec![option(320, -19_000, 0.70)]);
        let mut input = optimization_input(
            vec![group(&[1, 2, 3, 4, 5, 6]), group(&[7])],
            options_by_load_point,
        );
        input.settings.max_pile_sizes = 1;
        input.settings.max_pile_tip_levels = 1;
        input.settings.max_pile_configurations = 1;

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("valid run should complete");
        };

        assert_eq!(result.assignments.len(), 6);
        assert!(result
            .assignments
            .iter()
            .all(|choice| choice.configuration == configuration(290, -18_000)));
        assert_eq!(
            result.unassigned,
            vec![super::OptimizationUnassignedLoadPoint {
                load_point_id: 7,
                reason: super::OptimizationUnassignedReason::ConfigurationLimits,
            }],
        );
    }

    #[test]
    fn locked_configuration_propagates_only_to_unlocked_members() {
        let forced = configuration(320, -19_000);
        let mut input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([
                (1, vec![option(320, -19_000, 0.99)]),
                (2, vec![option(320, -19_000, 0.75)]),
            ]),
        );
        input.locked_load_point_ids = vec![1];
        input.current_assignments = HashMap::from([(1, forced.clone())]);
        input.settings.max_utilization = 0.80;
        input.candidate_configurations = vec![configuration(290, -18_000)];

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("compatible lock should complete");
        };

        assert_eq!(result.assignments.len(), 1);
        assert_eq!(result.assignments[0].load_point_id, 2);
        assert_eq!(result.assignments[0].configuration, forced);
        assert!(result.unassigned.is_empty());
    }

    #[test]
    fn non_target_group_cannot_block_selected_scope() {
        let mut input = optimization_input(
            vec![group(&[1]), group(&[2])],
            HashMap::from([(1, vec![option(290, -18_000, 0.70)])]),
        );
        input.target_load_point_ids = vec![1];

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("non-target analysis gap should not block");
        };

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| choice.load_point_id)
                .collect::<Vec<_>>(),
            vec![1],
        );
    }

    #[test]
    fn whole_plan_baseline_excludes_every_member_of_expanded_target() {
        let mut input = optimization_input(
            vec![group(&[1, 2])],
            HashMap::from([
                (1, vec![option(290, -18_000, 0.70)]),
                (2, vec![option(290, -18_000, 0.75)]),
            ]),
        );
        input.target_load_point_ids = vec![1];
        input.current_assignments = HashMap::from([(2, configuration(320, -19_000))]);
        input.limit_scope = OptimizationLimitScope::WholePlan;
        input.settings.max_pile_sizes = 1;
        input.settings.max_pile_tip_levels = 1;
        input.settings.max_pile_configurations = 1;

        let GreedyOptimizationOutcome::Completed { result } = greedy_optimize_pile_choices(&input)
        else {
            panic!("expanded target should not count as baseline");
        };

        assert_eq!(result.assignments.len(), 2);
        assert_eq!(result.configuration_count, 1);
    }

    #[test]
    fn unit_solver_keeps_adding_configurations_when_cost_improves_after_full_coverage() {
        let shared = configuration(320, -20_000);
        let first_specific = configuration(290, -18_000);
        let second_specific = configuration(350, -18_000);
        let units = vec![
            unit(
                &[1],
                None,
                vec![
                    unit_option(shared.clone(), 100),
                    unit_option(first_specific.clone(), 40),
                ],
            ),
            unit(
                &[2],
                None,
                vec![
                    unit_option(shared, 100),
                    unit_option(second_specific.clone(), 30),
                ],
            ),
        ];
        let settings = GreedyOptimizationSettings {
            max_pile_sizes: 3,
            max_pile_tip_levels: 3,
            max_pile_configurations: 3,
            max_utilization: 1.0,
            candidate_source: OptimizationCandidateSource::AllAvailable,
        };

        let result = super::greedy_optimize_units(&units, &[], &[], &[], &settings);

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| choice.configuration.clone())
                .collect::<Vec<_>>(),
            vec![first_specific, second_specific],
        );
    }

    #[test]
    fn unit_solver_reuses_fixed_configuration_when_baseline_already_exceeds_limit() {
        let reusable = configuration(290, -18_000);
        let other_fixed = configuration(320, -19_000);
        let units = vec![unit(&[1], None, vec![unit_option(reusable.clone(), 100)])];
        let settings = GreedyOptimizationSettings {
            max_pile_sizes: 1,
            max_pile_tip_levels: 1,
            max_pile_configurations: 1,
            max_utilization: 1.0,
            candidate_source: OptimizationCandidateSource::AllAvailable,
        };

        let result = super::greedy_optimize_units(
            &units,
            &[],
            &[reusable.clone(), other_fixed],
            &[],
            &settings,
        );

        assert_eq!(result.assignments[0].configuration, reusable);
        assert_eq!(result.configuration_count, 2);
    }
}
