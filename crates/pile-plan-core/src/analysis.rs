use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::pile_configuration::{pile_tip_level_mm, PileConfigurationKey};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPoint {
    pub id: u32,
    pub name: String,
    pub x_mm: f64,
    pub y_mm: f64,
    pub design_load_kn: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Cpt {
    pub id: u32,
    pub name: String,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BearingCapacity {
    pub cpt_id: u32,
    pub pile_tip_level_m: f64,
    pub pile_size_mm: u32,
    pub frd_kn: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CptSelectionSettings {
    pub algorithm: CptSelectionAlgorithm,
    pub max_distance_m: f64,
    #[serde(default = "default_monopoly_distance_m")]
    pub monopoly_distance_m: f64,
    pub max_angle_degrees: f64,
}

fn default_monopoly_distance_m() -> f64 {
    1.0
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CptSelectionAlgorithm {
    Quadrants,
    MaximumAngle,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SelectedCpt {
    pub label: String,
    pub quadrant: Option<String>,
    pub cpt: Cpt,
    pub distance_mm: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileConfigurationOption {
    pub configuration: PileConfigurationKey,
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub is_option: bool,
    pub governing_cpt_id: Option<u32>,
    pub governing_frd_kn: Option<f64>,
    pub utilization: Option<f64>,
    pub missing_cpt_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileCostSettings {
    pub schema_version: u32,
    pub items: Vec<PileCostSettingsItem>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileCostSettingsItem {
    pub pile_size_mm: u32,
    pub shape: PileCostShape,
    #[serde(alias = "cost_per_m3_eur")]
    pub cost_per_m3: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PileCostShape {
    Round,
    Square,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BearingCapacitySummary {
    pub count: usize,
    pub min_frd_kn: f64,
    pub max_frd_kn: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CptBearingCapacityRow {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub frd_kn: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectAnalysisResult {
    pub pile_options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub selected_cpts_by_load_point: HashMap<u32, Vec<SelectedCpt>>,
    pub cpt_frd_rows_by_cpt_id: Option<HashMap<u32, Vec<CptBearingCapacityRow>>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationSettings {
    pub max_pile_sizes: usize,
    pub max_pile_tip_levels: usize,
    pub max_pile_configurations: usize,
    #[serde(default = "default_max_utilization")]
    pub max_utilization: f64,
    pub enabled_pile_sizes: Vec<u32>,
    pub enabled_pile_tip_levels: Vec<f64>,
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
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub locked_load_point_ids: Vec<u32>,
    #[serde(default)]
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub limit_scope: OptimizationLimitScope,
    pub pile_head_level_m: f64,
    pub cost_settings: PileCostSettings,
    pub settings: GreedyOptimizationSettings,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizedPileChoice {
    pub load_point_id: u32,
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub is_option: bool,
    pub cost: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GreedyUnassignedReason {
    NoValidOption,
    OptimizationConstraints,
    ConfigurationLimits,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GreedyUnassignedLoadPoint {
    pub load_point_id: u32,
    pub reason: GreedyUnassignedReason,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizationResult {
    pub assignments: Vec<GreedyOptimizedPileChoice>,
    pub unassigned: Vec<GreedyUnassignedLoadPoint>,
    pub selected_configurations: Vec<PileConfigurationKey>,
    pub pile_size_count: usize,
    pub pile_tip_level_count: usize,
    pub configuration_count: usize,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CapacityKey {
    cpt_id: u32,
    pile_size_mm: u32,
    pile_tip_level_mm: i64,
}

pub fn bearing_capacity_summary(
    bearing_capacities: &[BearingCapacity],
    cpt_id: u32,
) -> Option<BearingCapacitySummary> {
    let frds: Vec<f64> = bearing_capacities
        .iter()
        .filter(|capacity| capacity.cpt_id == cpt_id)
        .map(|capacity| capacity.frd_kn)
        .collect();

    if frds.is_empty() {
        return None;
    }

    Some(BearingCapacitySummary {
        count: frds.len(),
        min_frd_kn: frds.iter().copied().fold(f64::INFINITY, f64::min),
        max_frd_kn: frds.iter().copied().fold(f64::NEG_INFINITY, f64::max),
    })
}

pub fn bearing_capacity_rows_for_cpt(
    bearing_capacities: &[BearingCapacity],
    cpt_id: u32,
) -> Vec<CptBearingCapacityRow> {
    let mut rows: Vec<_> = bearing_capacities
        .iter()
        .filter(|capacity| capacity.cpt_id == cpt_id)
        .map(|capacity| CptBearingCapacityRow {
            pile_size_mm: capacity.pile_size_mm,
            pile_tip_level_m: capacity.pile_tip_level_m,
            frd_kn: capacity.frd_kn,
        })
        .collect();

    rows.sort_by(|left, right| {
        left.pile_size_mm
            .cmp(&right.pile_size_mm)
            .then_with(|| right.pile_tip_level_m.total_cmp(&left.pile_tip_level_m))
    });
    rows
}

pub fn selected_cpts(
    load_point: &LoadPoint,
    cpts: &[Cpt],
    settings: &CptSelectionSettings,
    manual_cpt_ids: Option<&[u32]>,
) -> Vec<SelectedCpt> {
    let algorithmic = algorithmically_selected_cpts(load_point, cpts, settings);
    let Some(manual_cpt_ids) = manual_cpt_ids else {
        return algorithmic;
    };

    let nearest_id = cpts
        .iter()
        .filter(|cpt| distance_mm(load_point, cpt) <= settings.max_distance_m * 1000.0)
        .min_by(|left, right| {
            distance_mm(load_point, left)
                .total_cmp(&distance_mm(load_point, right))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|cpt| cpt.id);
    let single_nearest_id = (manual_cpt_ids.len() == 1)
        .then(|| manual_cpt_ids.first().copied())
        .flatten()
        .filter(|cpt_id| Some(*cpt_id) == nearest_id);
    if let Some(cpt_id) = single_nearest_id {
        let Some(cpt) = cpts.iter().find(|cpt| cpt.id == cpt_id).cloned() else {
            return Vec::new();
        };
        return vec![SelectedCpt {
            label: "nearest".to_string(),
            quadrant: None,
            distance_mm: distance_mm(load_point, &cpt),
            cpt,
        }];
    }

    let manual_ids: HashSet<_> = manual_cpt_ids.iter().copied().collect();
    let algorithmic_ids: HashSet<_> = algorithmic
        .iter()
        .map(|selection| selection.cpt.id)
        .collect();
    let mut selections: Vec<_> = algorithmic
        .into_iter()
        .filter(|selection| manual_ids.contains(&selection.cpt.id))
        .collect();
    let mut additions: Vec<_> = manual_cpt_ids
        .iter()
        .filter(|cpt_id| !algorithmic_ids.contains(cpt_id))
        .filter_map(|cpt_id| cpts.iter().find(|cpt| cpt.id == *cpt_id).cloned())
        .collect();
    additions.sort_by(|left, right| {
        distance_mm(load_point, left)
            .total_cmp(&distance_mm(load_point, right))
            .then_with(|| left.id.cmp(&right.id))
    });
    selections.extend(
        additions
            .into_iter()
            .enumerate()
            .map(|(index, cpt)| SelectedCpt {
                label: format!("manual {}", index + 1),
                quadrant: None,
                distance_mm: distance_mm(load_point, &cpt),
                cpt,
            }),
    );
    selections
}

fn algorithmically_selected_cpts(
    load_point: &LoadPoint,
    cpts: &[Cpt],
    settings: &CptSelectionSettings,
) -> Vec<SelectedCpt> {
    let max_distance_mm = settings.max_distance_m * 1000.0;
    if let Some(cpt) = cpts
        .iter()
        .filter(|cpt| distance_mm(load_point, cpt) <= max_distance_mm)
        .filter(|cpt| distance_mm(load_point, cpt) <= settings.monopoly_distance_m * 1000.0)
        .min_by(|left, right| {
            distance_mm(load_point, left)
                .total_cmp(&distance_mm(load_point, right))
                .then_with(|| left.id.cmp(&right.id))
        })
    {
        return vec![SelectedCpt {
            label: "nearest".to_string(),
            quadrant: None,
            cpt: cpt.clone(),
            distance_mm: distance_mm(load_point, cpt),
        }];
    }

    match settings.algorithm {
        CptSelectionAlgorithm::Quadrants => {
            selected_cpts_by_quadrant(load_point, cpts, settings.max_distance_m)
        }
        CptSelectionAlgorithm::MaximumAngle => selected_cpts_by_maximum_angle(
            load_point,
            cpts,
            settings.max_distance_m,
            settings.max_angle_degrees,
        ),
    }
}

pub fn manually_selected_cpts(
    load_point: &LoadPoint,
    cpts: &[Cpt],
    manual_cpt_ids: &[u32],
) -> Vec<SelectedCpt> {
    manual_cpt_ids
        .iter()
        .enumerate()
        .filter_map(|(index, cpt_id)| {
            let cpt = cpts.iter().find(|cpt| cpt.id == *cpt_id)?.clone();

            Some(SelectedCpt {
                label: format!("manual {}", index + 1),
                quadrant: None,
                distance_mm: distance_mm(load_point, &cpt),
                cpt,
            })
        })
        .collect()
}

pub fn selected_cpts_by_quadrant(
    load_point: &LoadPoint,
    cpts: &[Cpt],
    max_distance_m: f64,
) -> Vec<SelectedCpt> {
    let quadrants = ["upper right", "lower right", "upper left", "lower left"];
    let max_distance_mm = max_distance_m * 1000.0;

    quadrants
        .iter()
        .filter_map(|quadrant| {
            cpts.iter()
                .filter_map(|cpt| {
                    let distance = distance_mm(load_point, cpt);
                    let cpt_quadrant = cpt_quadrant(load_point, cpt);

                    if distance <= max_distance_mm && cpt_quadrant == *quadrant {
                        Some(SelectedCpt {
                            label: quadrant.to_string(),
                            quadrant: Some(quadrant.to_string()),
                            cpt: cpt.clone(),
                            distance_mm: distance,
                        })
                    } else {
                        None
                    }
                })
                .min_by(|left, right| left.distance_mm.total_cmp(&right.distance_mm))
        })
        .collect()
}

pub fn selected_cpts_by_maximum_angle(
    load_point: &LoadPoint,
    cpts: &[Cpt],
    max_distance_m: f64,
    max_angle_degrees: f64,
) -> Vec<SelectedCpt> {
    let max_distance_mm = max_distance_m * 1000.0;
    let mut candidates: Vec<_> = cpts
        .iter()
        .filter_map(|cpt| {
            let distance = distance_mm(load_point, cpt);

            if distance <= max_distance_mm {
                Some(SelectedCpt {
                    label: String::new(),
                    quadrant: None,
                    cpt: cpt.clone(),
                    distance_mm: distance,
                })
            } else {
                None
            }
        })
        .collect();

    candidates.sort_by(|left, right| left.distance_mm.total_cmp(&right.distance_mm));

    let first = match candidates.first().cloned() {
        Some(first) => first,
        None => return vec![],
    };

    let mut selected = vec![first.clone()];
    let mut remaining = candidates.into_iter().skip(1).collect::<Vec<_>>();
    let mut current = first.clone();

    while !remaining.is_empty() {
        let within_angle_index = remaining.iter().position(|candidate| {
            clockwise_angle_degrees(load_point, &current.cpt, &candidate.cpt) < max_angle_degrees
        });

        let chosen_index = within_angle_index.or_else(|| {
            let closing_angle = if current.cpt.id == first.cpt.id {
                360.0
            } else {
                clockwise_angle_degrees(load_point, &current.cpt, &first.cpt)
            };

            remaining
                .iter()
                .enumerate()
                .filter(|(_, candidate)| {
                    clockwise_angle_degrees(load_point, &current.cpt, &candidate.cpt)
                        < closing_angle
                })
                .min_by(|(_, left), (_, right)| {
                    clockwise_angle_degrees(load_point, &current.cpt, &left.cpt).total_cmp(
                        &clockwise_angle_degrees(load_point, &current.cpt, &right.cpt),
                    )
                })
                .map(|(index, _)| index)
        });

        let Some(chosen_index) = chosen_index else {
            break;
        };
        let chosen = remaining.remove(chosen_index);
        current = chosen.clone();
        selected.push(chosen);

        if clockwise_angle_degrees(load_point, &current.cpt, &first.cpt) < max_angle_degrees {
            break;
        }
    }

    selected
        .into_iter()
        .enumerate()
        .map(|(index, mut selection)| {
            selection.label = if index == 0 {
                "nearest".to_string()
            } else {
                format!("angle {}", index + 1)
            };
            selection
        })
        .collect()
}

pub fn pile_configuration_options(
    design_load_kn: f64,
    selected_cpts: &[SelectedCpt],
    bearing_capacities: &[BearingCapacity],
) -> Vec<PileConfigurationOption> {
    let configurations = unique_pile_configurations(bearing_capacities);
    let index = bearing_capacity_index(bearing_capacities);

    pile_configuration_options_with_index(design_load_kn, selected_cpts, &configurations, &index)
}

fn pile_configuration_options_with_index(
    design_load_kn: f64,
    selected_cpts: &[SelectedCpt],
    configurations: &[(u32, f64)],
    index: &HashMap<CapacityKey, &BearingCapacity>,
) -> Vec<PileConfigurationOption> {
    configurations
        .iter()
        .map(|&(pile_size_mm, pile_tip_level_m)| {
            let matching_capacities: Vec<_> = selected_cpts
                .iter()
                .map(|selection| {
                    (
                        selection.cpt.id,
                        index.get(&capacity_key(
                            selection.cpt.id,
                            pile_size_mm,
                            pile_tip_level_m,
                        )),
                    )
                })
                .collect();
            let missing_cpt_ids = matching_capacities
                .iter()
                .filter_map(|(cpt_id, capacity)| capacity.is_none().then_some(*cpt_id))
                .collect::<Vec<_>>();
            let governing_capacity = matching_capacities
                .iter()
                .filter_map(|(_, capacity)| capacity.copied())
                .min_by(|left, right| left.frd_kn.total_cmp(&right.frd_kn));
            let governing_frd_kn = governing_capacity.map(|capacity| capacity.frd_kn);
            let utilization = governing_frd_kn.map(|frd_kn| design_load_kn / frd_kn);

            PileConfigurationOption {
                configuration: PileConfigurationKey::from_metres(pile_size_mm, pile_tip_level_m),
                pile_size_mm,
                pile_tip_level_m,
                is_option: missing_cpt_ids.is_empty()
                    && utilization.is_some_and(|value| value <= 1.0),
                governing_cpt_id: governing_capacity.map(|capacity| capacity.cpt_id),
                governing_frd_kn,
                utilization,
                missing_cpt_ids,
            }
        })
        .collect()
}

pub fn build_pile_options_by_load_point(
    load_points: &[LoadPoint],
    cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    settings_by_load_point: impl Fn(&LoadPoint) -> CptSelectionSettings,
    manual_cpt_ids_by_load_point: &HashMap<u32, Vec<u32>>,
) -> HashMap<u32, Vec<PileConfigurationOption>> {
    build_project_analysis(
        load_points,
        cpts,
        bearing_capacities,
        settings_by_load_point,
        manual_cpt_ids_by_load_point,
        false,
    )
    .pile_options_by_load_point
}

pub fn build_project_analysis(
    load_points: &[LoadPoint],
    cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    settings_by_load_point: impl Fn(&LoadPoint) -> CptSelectionSettings,
    manual_cpt_ids_by_load_point: &HashMap<u32, Vec<u32>>,
    include_cpt_frd_rows: bool,
) -> ProjectAnalysisResult {
    let configurations = unique_pile_configurations(bearing_capacities);
    let capacity_index = bearing_capacity_index(bearing_capacities);
    let mut pile_options_by_load_point = HashMap::new();
    let mut selected_cpts_by_load_point = HashMap::new();

    for load_point in load_points {
        let settings = settings_by_load_point(load_point);
        let selections = selected_cpts(
            load_point,
            cpts,
            &settings,
            manual_cpt_ids_by_load_point
                .get(&load_point.id)
                .map(Vec::as_slice),
        );
        let options = pile_configuration_options_with_index(
            load_point.design_load_kn,
            &selections,
            &configurations,
            &capacity_index,
        );
        selected_cpts_by_load_point.insert(load_point.id, selections);
        pile_options_by_load_point.insert(load_point.id, options);
    }

    ProjectAnalysisResult {
        pile_options_by_load_point,
        selected_cpts_by_load_point,
        cpt_frd_rows_by_cpt_id: include_cpt_frd_rows
            .then(|| grouped_bearing_capacity_rows(bearing_capacities)),
    }
}

fn grouped_bearing_capacity_rows(
    bearing_capacities: &[BearingCapacity],
) -> HashMap<u32, Vec<CptBearingCapacityRow>> {
    let mut rows_by_cpt: HashMap<u32, Vec<CptBearingCapacityRow>> = HashMap::new();
    for capacity in bearing_capacities {
        rows_by_cpt
            .entry(capacity.cpt_id)
            .or_default()
            .push(CptBearingCapacityRow {
                pile_size_mm: capacity.pile_size_mm,
                pile_tip_level_m: capacity.pile_tip_level_m,
                frd_kn: capacity.frd_kn,
            });
    }
    for rows in rows_by_cpt.values_mut() {
        rows.sort_by(|left, right| {
            left.pile_size_mm
                .cmp(&right.pile_size_mm)
                .then_with(|| right.pile_tip_level_m.total_cmp(&left.pile_tip_level_m))
        });
    }
    rows_by_cpt
}

pub fn calculate_pile_cost(
    pile_size_mm: u32,
    pile_tip_level_m: f64,
    pile_head_level_m: f64,
    settings: &PileCostSettings,
) -> Option<u32> {
    let settings_item = settings
        .items
        .iter()
        .find(|item| item.pile_size_mm == pile_size_mm)?;
    let pile_length_m = (pile_head_level_m - pile_tip_level_m).abs();
    let cross_section_m2 = match settings_item.shape {
        PileCostShape::Round => std::f64::consts::PI * (pile_size_mm as f64 / 2000.0).powi(2),
        PileCostShape::Square => (pile_size_mm as f64 / 1000.0).powi(2),
    };

    Some((settings_item.cost_per_m3 * pile_length_m * cross_section_m2).trunc() as u32)
}

pub fn choose_default_pile_option<'a>(
    options: &'a [PileConfigurationOption],
    pile_head_level_m: f64,
    settings: &PileCostSettings,
) -> Option<&'a PileConfigurationOption> {
    options
        .iter()
        .filter(|option| {
            option.is_option
                && calculate_pile_cost(
                    option.pile_size_mm,
                    option.pile_tip_level_m,
                    pile_head_level_m,
                    settings,
                )
                .is_some()
        })
        .min_by(|left, right| {
            let left_cost = calculate_pile_cost(
                left.pile_size_mm,
                left.pile_tip_level_m,
                pile_head_level_m,
                settings,
            );
            let right_cost = calculate_pile_cost(
                right.pile_size_mm,
                right.pile_tip_level_m,
                pile_head_level_m,
                settings,
            );

            match (left_cost, right_cost) {
                (Some(left_cost), Some(right_cost)) => left_cost.cmp(&right_cost),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => left
                    .pile_size_mm
                    .cmp(&right.pile_size_mm)
                    .then_with(|| right.pile_tip_level_m.total_cmp(&left.pile_tip_level_m)),
            }
        })
}

pub fn choose_default_pile_options(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    pile_head_level_m: f64,
    settings: &PileCostSettings,
) -> HashMap<u32, PileConfigurationKey> {
    options_by_load_point
        .iter()
        .filter_map(|(load_point_id, options)| {
            choose_default_pile_option(options, pile_head_level_m, settings)
                .map(|option| (*load_point_id, option.configuration.clone()))
        })
        .collect()
}

pub fn greedy_optimize_pile_choices(input: &GreedyOptimizationInput) -> GreedyOptimizationResult {
    let locked_ids = input
        .locked_load_point_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut effective_target_ids = input
        .target_load_point_ids
        .iter()
        .copied()
        .filter(|load_point_id| !locked_ids.contains(load_point_id))
        .collect::<Vec<_>>();
    effective_target_ids.sort_unstable();
    effective_target_ids.dedup();
    let effective_target_set = effective_target_ids.iter().copied().collect::<HashSet<_>>();
    let options_by_load_point = effective_target_ids
        .iter()
        .map(|load_point_id| {
            (
                *load_point_id,
                input
                    .options_by_load_point
                    .get(load_point_id)
                    .cloned()
                    .unwrap_or_default(),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut baseline_configurations = if input.limit_scope == OptimizationLimitScope::WholePlan {
        input
            .current_assignments
            .iter()
            .filter(|(load_point_id, _)| !effective_target_set.contains(load_point_id))
            .map(|(_, config)| config.clone())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    baseline_configurations.sort_by(|left, right| {
        left.pile_size_mm
            .cmp(&right.pile_size_mm)
            .then_with(|| right.pile_tip_level_mm.cmp(&left.pile_tip_level_mm))
    });
    baseline_configurations.dedup();

    let eligible_options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>> =
        options_by_load_point
            .iter()
            .map(|(load_point_id, options)| {
                (
                    *load_point_id,
                    options
                        .iter()
                        .filter(|option| {
                            option.is_option
                                && option.utilization.is_some_and(|utilization| {
                                    utilization <= input.settings.max_utilization.clamp(0.0, 1.0)
                                })
                                && optimization_option_enabled(option, &input.settings)
                        })
                        .cloned()
                        .collect(),
                )
            })
            .collect();
    let mut selected_configs = Vec::<OptimizationConfig>::new();

    loop {
        let Some(config) = best_next_optimization_config(
            &eligible_options_by_load_point,
            &selected_configs,
            input.pile_head_level_m,
            &input.cost_settings,
            &input.settings,
            &baseline_configurations,
        ) else {
            break;
        };

        if !selected_configs.is_empty() {
            let current_score = optimization_score_for_configs(
                &eligible_options_by_load_point,
                &selected_configs,
                input.pile_head_level_m,
                &input.cost_settings,
            );
            let next_score = optimization_score_for_configs(
                &eligible_options_by_load_point,
                &[selected_configs.as_slice(), std::slice::from_ref(&config)].concat(),
                input.pile_head_level_m,
                &input.cost_settings,
            );

            if next_score >= current_score {
                break;
            }
        }

        selected_configs.push(config);
    }

    let mut assignments: Vec<_> = eligible_options_by_load_point
        .iter()
        .filter_map(|(load_point_id, options)| {
            let selected_option = cheapest_option_for_configs(
                options,
                &selected_configs,
                input.pile_head_level_m,
                &input.cost_settings,
            )?;

            Some(GreedyOptimizedPileChoice {
                load_point_id: *load_point_id,
                pile_size_mm: selected_option.pile_size_mm,
                pile_tip_level_m: selected_option.pile_tip_level_m,
                is_option: selected_option.is_option,
                cost: calculate_pile_cost(
                    selected_option.pile_size_mm,
                    selected_option.pile_tip_level_m,
                    input.pile_head_level_m,
                    &input.cost_settings,
                ),
            })
        })
        .collect();

    assignments.sort_by_key(|choice| choice.load_point_id);
    let assigned_ids = assignments
        .iter()
        .map(|choice| choice.load_point_id)
        .collect::<HashSet<_>>();
    let mut unassigned: Vec<_> = options_by_load_point
        .iter()
        .filter(|(load_point_id, _)| !assigned_ids.contains(load_point_id))
        .map(|(load_point_id, options)| {
            let reason = if !options.iter().any(|option| option.is_option) {
                GreedyUnassignedReason::NoValidOption
            } else if eligible_options_by_load_point
                .get(load_point_id)
                .is_none_or(Vec::is_empty)
            {
                GreedyUnassignedReason::OptimizationConstraints
            } else {
                GreedyUnassignedReason::ConfigurationLimits
            };
            GreedyUnassignedLoadPoint {
                load_point_id: *load_point_id,
                reason,
            }
        })
        .collect();
    unassigned.sort_by_key(|item| item.load_point_id);

    let mut selected_configurations = selected_configs
        .iter()
        .map(OptimizationConfig::as_key)
        .collect::<Vec<_>>();
    selected_configurations.sort_by(|left, right| {
        left.pile_size_mm
            .cmp(&right.pile_size_mm)
            .then_with(|| right.pile_tip_level_mm.cmp(&left.pile_tip_level_mm))
    });
    let pile_size_count = baseline_configurations
        .iter()
        .map(|item| item.pile_size_mm)
        .chain(selected_configs.iter().map(|item| item.pile_size_mm))
        .collect::<HashSet<_>>()
        .len();
    let pile_tip_level_count = baseline_configurations
        .iter()
        .map(|item| item.pile_tip_level_mm)
        .chain(selected_configs.iter().map(|item| item.pile_tip_level_mm))
        .collect::<HashSet<_>>()
        .len();
    let configuration_count = baseline_configurations
        .iter()
        .cloned()
        .chain(selected_configs.iter().map(OptimizationConfig::as_key))
        .collect::<HashSet<_>>()
        .len();

    GreedyOptimizationResult {
        assignments,
        unassigned,
        selected_configurations,
        pile_size_count,
        pile_tip_level_count,
        configuration_count,
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct OptimizationConfig {
    pile_size_mm: u32,
    pile_tip_level_mm: i64,
}

impl OptimizationConfig {
    fn from_option(option: &PileConfigurationOption) -> Self {
        Self {
            pile_size_mm: option.configuration.pile_size_mm,
            pile_tip_level_mm: option.configuration.pile_tip_level_mm,
        }
    }

    fn matches_option(&self, option: &PileConfigurationOption) -> bool {
        self.pile_size_mm == option.configuration.pile_size_mm
            && self.pile_tip_level_mm == option.configuration.pile_tip_level_mm
    }

    fn as_key(&self) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm: self.pile_size_mm,
            pile_tip_level_mm: self.pile_tip_level_mm,
        }
    }
}

fn optimization_option_enabled(
    option: &PileConfigurationOption,
    settings: &GreedyOptimizationSettings,
) -> bool {
    settings.enabled_pile_sizes.contains(&option.pile_size_mm)
        && settings
            .enabled_pile_tip_levels
            .iter()
            .any(|level| pile_tip_level_mm(*level) == option.configuration.pile_tip_level_mm)
}

fn best_next_optimization_config(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    selected_configs: &[OptimizationConfig],
    pile_head_level_m: f64,
    cost_settings: &PileCostSettings,
    settings: &GreedyOptimizationSettings,
    baseline_configurations: &[PileConfigurationKey],
) -> Option<OptimizationConfig> {
    all_optimization_configs(options_by_load_point)
        .into_iter()
        .filter(|config| !selected_configs.contains(config))
        .filter(|config| {
            config_respects_limits(
                config,
                selected_configs,
                options_by_load_point,
                settings,
                baseline_configurations,
            )
        })
        .min_by(|left, right| {
            let left_score = optimization_score_for_configs(
                options_by_load_point,
                &[selected_configs, std::slice::from_ref(left)].concat(),
                pile_head_level_m,
                cost_settings,
            );
            let right_score = optimization_score_for_configs(
                options_by_load_point,
                &[selected_configs, std::slice::from_ref(right)].concat(),
                pile_head_level_m,
                cost_settings,
            );

            left_score.cmp(&right_score).then_with(|| {
                left.pile_size_mm
                    .cmp(&right.pile_size_mm)
                    .then_with(|| right.pile_tip_level_mm.cmp(&left.pile_tip_level_mm))
            })
        })
}

fn all_optimization_configs(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> Vec<OptimizationConfig> {
    let mut configs = Vec::new();
    let mut seen = HashSet::new();

    for options in options_by_load_point.values() {
        for option in options {
            let config = OptimizationConfig::from_option(option);
            if seen.insert(config.clone()) {
                configs.push(config);
            }
        }
    }

    configs.sort_by(|left, right| {
        left.pile_size_mm
            .cmp(&right.pile_size_mm)
            .then_with(|| right.pile_tip_level_mm.cmp(&left.pile_tip_level_mm))
    });
    configs
}

fn config_respects_limits(
    config: &OptimizationConfig,
    selected_configs: &[OptimizationConfig],
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    settings: &GreedyOptimizationSettings,
    baseline_configurations: &[PileConfigurationKey],
) -> bool {
    let next_configs = [selected_configs, std::slice::from_ref(config)].concat();
    let size_count = baseline_configurations
        .iter()
        .map(|item| item.pile_size_mm)
        .chain(next_configs.iter().map(|item| item.pile_size_mm))
        .collect::<HashSet<_>>()
        .len();
    let tip_count = baseline_configurations
        .iter()
        .map(|item| item.pile_tip_level_mm)
        .chain(next_configs.iter().map(|item| item.pile_tip_level_mm))
        .collect::<HashSet<_>>()
        .len();
    let configuration_count = baseline_configurations
        .iter()
        .cloned()
        .chain(next_configs.iter().map(OptimizationConfig::as_key))
        .collect::<HashSet<_>>()
        .len();
    let max_sizes = settings.max_pile_sizes.max(1);
    let max_tips = settings.max_pile_tip_levels.max(1);
    let max_configurations = settings.max_pile_configurations.max(1);

    size_count <= max_sizes
        && tip_count <= max_tips
        && configuration_count <= max_configurations
        && options_by_load_point
            .values()
            .any(|options| options.iter().any(|option| config.matches_option(option)))
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct OptimizationScore {
    uncovered_count: usize,
    unknown_cost_count: usize,
    known_total_cost: u64,
}

fn optimization_score_for_configs(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    configs: &[OptimizationConfig],
    pile_head_level_m: f64,
    cost_settings: &PileCostSettings,
) -> OptimizationScore {
    let mut uncovered_count = 0;
    let mut unknown_cost_count = 0;
    let mut known_total_cost = 0;

    for options in options_by_load_point.values() {
        if let Some(option) =
            cheapest_option_for_configs(options, configs, pile_head_level_m, cost_settings)
        {
            if let Some(cost) = calculate_pile_cost(
                option.pile_size_mm,
                option.pile_tip_level_m,
                pile_head_level_m,
                cost_settings,
            ) {
                known_total_cost += u64::from(cost);
            } else {
                unknown_cost_count += 1;
            }
        } else {
            uncovered_count += 1;
        }
    }

    OptimizationScore {
        uncovered_count,
        unknown_cost_count,
        known_total_cost,
    }
}

fn cheapest_option_for_configs<'a>(
    options: &'a [PileConfigurationOption],
    configs: &[OptimizationConfig],
    pile_head_level_m: f64,
    cost_settings: &PileCostSettings,
) -> Option<&'a PileConfigurationOption> {
    options
        .iter()
        .filter(|option| configs.iter().any(|config| config.matches_option(option)))
        .min_by(|left, right| {
            let left_cost = calculate_pile_cost(
                left.pile_size_mm,
                left.pile_tip_level_m,
                pile_head_level_m,
                cost_settings,
            );
            let right_cost = calculate_pile_cost(
                right.pile_size_mm,
                right.pile_tip_level_m,
                pile_head_level_m,
                cost_settings,
            );

            left_cost
                .is_none()
                .cmp(&right_cost.is_none())
                .then_with(|| {
                    left_cost
                        .unwrap_or_default()
                        .cmp(&right_cost.unwrap_or_default())
                })
                .then_with(|| left.pile_size_mm.cmp(&right.pile_size_mm))
                .then_with(|| {
                    pile_tip_level_mm(right.pile_tip_level_m)
                        .cmp(&pile_tip_level_mm(left.pile_tip_level_m))
                })
        })
}

fn unique_pile_configurations(bearing_capacities: &[BearingCapacity]) -> Vec<(u32, f64)> {
    let mut seen = HashSet::new();
    let mut configurations: Vec<_> = bearing_capacities
        .iter()
        .filter_map(|capacity| {
            let key = capacity_key(
                capacity.cpt_id,
                capacity.pile_size_mm,
                capacity.pile_tip_level_m,
            );
            if seen.insert((key.pile_size_mm, key.pile_tip_level_mm)) {
                Some((capacity.pile_size_mm, capacity.pile_tip_level_m))
            } else {
                None
            }
        })
        .collect();

    configurations.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| right.1.total_cmp(&left.1))
    });
    configurations
}

fn bearing_capacity_index(
    bearing_capacities: &[BearingCapacity],
) -> HashMap<CapacityKey, &BearingCapacity> {
    bearing_capacities
        .iter()
        .map(|capacity| {
            (
                capacity_key(
                    capacity.cpt_id,
                    capacity.pile_size_mm,
                    capacity.pile_tip_level_m,
                ),
                capacity,
            )
        })
        .collect()
}

fn capacity_key(cpt_id: u32, pile_size_mm: u32, pile_tip_level_m: f64) -> CapacityKey {
    CapacityKey {
        cpt_id,
        pile_size_mm,
        pile_tip_level_mm: PileConfigurationKey::from_metres(pile_size_mm, pile_tip_level_m)
            .pile_tip_level_mm,
    }
}

fn cpt_quadrant(load_point: &LoadPoint, cpt: &Cpt) -> &'static str {
    if cpt.x_mm >= load_point.x_mm && cpt.y_mm >= load_point.y_mm {
        "upper right"
    } else if cpt.x_mm >= load_point.x_mm && cpt.y_mm < load_point.y_mm {
        "lower right"
    } else if cpt.x_mm < load_point.x_mm && cpt.y_mm >= load_point.y_mm {
        "upper left"
    } else {
        "lower left"
    }
}

fn distance_mm(load_point: &LoadPoint, cpt: &Cpt) -> f64 {
    (cpt.x_mm - load_point.x_mm).hypot(cpt.y_mm - load_point.y_mm)
}

fn clockwise_angle_degrees(origin: &LoadPoint, from: &Cpt, to: &Cpt) -> f64 {
    let from_x = from.x_mm - origin.x_mm;
    let from_y = from.y_mm - origin.y_mm;
    let to_x = to.x_mm - origin.x_mm;
    let to_y = to.y_mm - origin.y_mm;
    let dot = from_x * to_x + from_y * to_y;
    let determinant = from_x * to_y - from_y * to_x;
    let angle = 180.0 - (-determinant).atan2(-dot).to_degrees();

    if angle == 360.0 {
        0.0
    } else {
        angle
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_point() -> LoadPoint {
        LoadPoint {
            id: 10,
            name: "Load point 10".to_string(),
            x_mm: 0.0,
            y_mm: 0.0,
            design_load_kn: 600.0,
        }
    }

    fn cpt(id: u32, x_mm: f64, y_mm: f64) -> Cpt {
        Cpt {
            id,
            name: format!("CPT {id}"),
            x_mm,
            y_mm,
        }
    }

    fn capacity(cpt_id: u32, tip: f64, size: u32, frd: f64) -> BearingCapacity {
        BearingCapacity {
            cpt_id,
            pile_tip_level_m: tip,
            pile_size_mm: size,
            frd_kn: frd,
        }
    }

    #[test]
    fn cpt_selection_settings_default_missing_monopoly_distance_to_one_meter() {
        let settings: CptSelectionSettings = serde_json::from_str(
            r#"{"algorithm":"quadrants","max_distance_m":25.0,"max_angle_degrees":120.0}"#,
        )
        .expect("legacy settings deserialize");

        assert_eq!(settings.monopoly_distance_m, 1.0);
    }

    fn cost_settings() -> PileCostSettings {
        PileCostSettings {
            schema_version: 1,
            items: vec![
                PileCostSettingsItem {
                    pile_size_mm: 290,
                    shape: PileCostShape::Square,
                    cost_per_m3: 220.0,
                },
                PileCostSettingsItem {
                    pile_size_mm: 320,
                    shape: PileCostShape::Square,
                    cost_per_m3: 205.0,
                },
                PileCostSettingsItem {
                    pile_size_mm: 356,
                    shape: PileCostShape::Round,
                    cost_per_m3: 190.0,
                },
            ],
        }
    }

    #[test]
    fn pile_cost_uses_an_explicit_pile_head_level() {
        let settings = PileCostSettings {
            schema_version: 2,
            items: vec![PileCostSettingsItem {
                pile_size_mm: 1000,
                shape: PileCostShape::Square,
                cost_per_m3: 100.0,
            }],
        };

        assert_eq!(calculate_pile_cost(1000, -10.0, 0.0, &settings), Some(1000));
    }

    #[test]
    fn selects_nearest_cpt_in_each_quadrant() {
        let selected = selected_cpts_by_quadrant(
            &load_point(),
            &[
                cpt(1, 10.0, 10.0),
                cpt(2, 20.0, 20.0),
                cpt(3, 10.0, -10.0),
                cpt(4, -10.0, 10.0),
                cpt(5, -10.0, -10.0),
            ],
            25.0,
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.quadrant.as_deref(), item.cpt.id))
            .collect();
        assert_eq!(
            result,
            vec![
                ("upper right", Some("upper right"), 1),
                ("lower right", Some("lower right"), 3),
                ("upper left", Some("upper left"), 4),
                ("lower left", Some("lower left"), 5),
            ]
        );
    }

    #[test]
    fn selects_cpts_by_maximum_angle() {
        let selected = selected_cpts_by_maximum_angle(
            &load_point(),
            &[
                cpt(1, 10_000.0, 0.0),
                cpt(2, 0.0, 10_000.0),
                cpt(3, -10_000.0, 0.0),
                cpt(4, 0.0, -10_000.0),
            ],
            25.0,
            120.0,
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.cpt.id))
            .collect();
        assert_eq!(
            result,
            vec![
                ("nearest", 1),
                ("angle 2", 4),
                ("angle 3", 3),
                ("angle 4", 2),
            ]
        );
    }

    #[test]
    fn monopoly_override_returns_only_the_nearest_cpt() {
        let selected = selected_cpts(
            &load_point(),
            &[
                cpt(1, 500.0, 500.0),
                cpt(2, 600.0, -600.0),
                cpt(3, -700.0, 700.0),
                cpt(4, -800.0, -800.0),
            ],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            None,
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].cpt.id, 1);
        assert_eq!(selected[0].label, "nearest");
        assert_eq!(selected[0].quadrant, None);
    }

    #[test]
    fn monopoly_override_selects_the_nearest_candidate() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(1, 800.0, 0.0), cpt(2, 600.0, 0.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::MaximumAngle,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            None,
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].cpt.id, 2);
    }

    #[test]
    fn monopoly_override_breaks_equal_distance_ties_by_lower_cpt_id() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(2, 500.0, 500.0), cpt(1, -500.0, -500.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            None,
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].cpt.id, 1);
    }

    #[test]
    fn monopoly_override_enforces_maximum_distance() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(1, 2_000.0, 0.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 1.0,
                monopoly_distance_m: 5.0,
                max_angle_degrees: 120.0,
            },
            None,
        );

        assert!(selected.is_empty());
    }

    #[test]
    fn monopoly_override_falls_back_to_quadrant_selection() {
        let selected = selected_cpts(
            &load_point(),
            &[
                cpt(1, 2_000.0, 2_000.0),
                cpt(2, 2_000.0, -2_000.0),
                cpt(3, -2_000.0, 2_000.0),
                cpt(4, -2_000.0, -2_000.0),
            ],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            None,
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.quadrant.as_deref(), item.cpt.id))
            .collect();
        assert_eq!(
            result,
            vec![
                ("upper right", Some("upper right"), 1),
                ("lower right", Some("lower right"), 2),
                ("upper left", Some("upper left"), 3),
                ("lower left", Some("lower left"), 4),
            ]
        );
    }

    #[test]
    fn manual_override_preserves_algorithm_labels_and_labels_only_additions_as_manual() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(1, 10_000.0, 10_000.0), cpt(2, -10_000.0, -10_000.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            Some(&[2, 99, 1]),
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.cpt.id))
            .collect();
        assert_eq!(result, vec![("upper right", 1), ("lower left", 2)]);
    }

    #[test]
    fn manual_override_keeps_maximum_angle_labels_and_numbers_only_added_cpts() {
        let selected = selected_cpts(
            &load_point(),
            &[
                cpt(1, 10_000.0, 0.0),
                cpt(2, 0.0, -10_000.0),
                cpt(3, -10_000.0, 0.0),
                cpt(4, 0.0, 10_000.0),
                cpt(5, 15_000.0, 0.0),
            ],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::MaximumAngle,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            Some(&[1, 4, 3, 5]),
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.cpt.id))
            .collect();
        assert_eq!(
            result,
            vec![
                ("nearest", 1),
                ("angle 3", 3),
                ("angle 4", 4),
                ("manual 1", 5)
            ]
        );
    }

    #[test]
    fn manual_additions_follow_algorithmic_selections_in_distance_order() {
        let selected = selected_cpts(
            &load_point(),
            &[
                cpt(1, 10_000.0, 10_000.0),
                cpt(2, -10_000.0, -10_000.0),
                cpt(8, 20_000.0, 0.0),
                cpt(9, 15_000.0, 0.0),
            ],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            Some(&[8, 2, 9, 1]),
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.cpt.id))
            .collect();
        assert_eq!(
            result,
            vec![
                ("upper right", 1),
                ("lower left", 2),
                ("manual 1", 9),
                ("manual 2", 8),
            ]
        );
    }

    #[test]
    fn single_manual_override_of_geometrically_nearest_cpt_is_named_nearest() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(1, 2_000.0, 2_000.0), cpt(2, -1_000.0, -1_000.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 0.0,
                max_angle_degrees: 120.0,
            },
            Some(&[2]),
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].label, "nearest");
        assert_eq!(selected[0].cpt.id, 2);
    }

    #[test]
    fn calculates_pile_configuration_options_for_selected_cpts() {
        let options = pile_configuration_options(
            600.0,
            &[
                SelectedCpt {
                    label: "upper right".to_string(),
                    quadrant: Some("upper right".to_string()),
                    cpt: cpt(11, 0.0, 0.0),
                    distance_mm: 0.0,
                },
                SelectedCpt {
                    label: "upper left".to_string(),
                    quadrant: Some("upper left".to_string()),
                    cpt: cpt(12, 0.0, 0.0),
                    distance_mm: 0.0,
                },
            ],
            &[
                capacity(11, -18.0, 320, 700.0),
                capacity(11, -19.0, 320, 740.0),
                capacity(12, -18.0, 320, 650.0),
            ],
        );

        assert_eq!(
            options,
            vec![
                PileConfigurationOption {
                    configuration: PileConfigurationKey::from_metres(320, -18.0),
                    pile_size_mm: 320,
                    pile_tip_level_m: -18.0,
                    is_option: true,
                    governing_cpt_id: Some(12),
                    governing_frd_kn: Some(650.0),
                    utilization: Some(600.0 / 650.0),
                    missing_cpt_ids: vec![],
                },
                PileConfigurationOption {
                    configuration: PileConfigurationKey::from_metres(320, -19.0),
                    pile_size_mm: 320,
                    pile_tip_level_m: -19.0,
                    is_option: false,
                    governing_cpt_id: Some(11),
                    governing_frd_kn: Some(740.0),
                    utilization: Some(600.0 / 740.0),
                    missing_cpt_ids: vec![12],
                },
            ]
        );
    }

    #[test]
    fn project_analysis_batches_options_selections_and_cpt_rows() {
        let load = load_point();
        let cpts = vec![cpt(11, 10.0, 10.0), cpt(12, -10.0, 10.0)];
        let capacities = vec![
            capacity(11, -18.0, 320, 700.0),
            capacity(12, -18.0, 320, 650.0),
        ];
        let settings = CptSelectionSettings {
            algorithm: CptSelectionAlgorithm::Quadrants,
            max_distance_m: 25.0,
            monopoly_distance_m: 1.0,
            max_angle_degrees: 120.0,
        };

        let result = build_project_analysis(
            std::slice::from_ref(&load),
            &cpts,
            &capacities,
            |_| settings.clone(),
            &HashMap::new(),
            true,
        );

        assert_eq!(
            result.selected_cpts_by_load_point[&load.id],
            selected_cpts(&load, &cpts, &settings, None)
        );
        assert_eq!(
            result.pile_options_by_load_point[&load.id],
            pile_configuration_options(
                load.design_load_kn,
                &result.selected_cpts_by_load_point[&load.id],
                &capacities,
            )
        );
        assert_eq!(
            result.cpt_frd_rows_by_cpt_id.as_ref().unwrap()[&11].len(),
            1
        );
        assert_eq!(
            result.cpt_frd_rows_by_cpt_id.as_ref().unwrap()[&12].len(),
            1
        );
    }

    #[test]
    fn project_analysis_can_return_partial_load_points_without_cpt_rows() {
        let mut second = load_point();
        second.id = 2;
        let result = build_project_analysis(
            std::slice::from_ref(&second),
            &[cpt(11, 10.0, 10.0)],
            &[capacity(11, -18.0, 320, 700.0)],
            |_| CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            &HashMap::new(),
            false,
        );

        assert_eq!(
            result
                .pile_options_by_load_point
                .keys()
                .copied()
                .collect::<Vec<_>>(),
            vec![2]
        );
        assert_eq!(
            result
                .selected_cpts_by_load_point
                .keys()
                .copied()
                .collect::<Vec<_>>(),
            vec![2]
        );
        assert!(result.cpt_frd_rows_by_cpt_id.is_none());
    }

    #[test]
    fn calculates_pile_cost_with_correct_round_section_formula() {
        assert_eq!(
            calculate_pile_cost(320, -18.0, -3.5, &cost_settings()),
            Some(304)
        );
        assert_eq!(
            calculate_pile_cost(356, -18.0, -3.5, &cost_settings()),
            Some(274)
        );
        assert_eq!(
            calculate_pile_cost(400, -18.0, -3.5, &cost_settings()),
            None
        );
    }

    #[test]
    fn chooses_the_cheapest_valid_pile_option_by_default() {
        let options = vec![
            PileConfigurationOption {
                configuration: PileConfigurationKey::from_metres(320, -18.0),
                pile_size_mm: 320,
                pile_tip_level_m: -18.0,
                is_option: true,
                governing_cpt_id: Some(1),
                governing_frd_kn: Some(700.0),
                utilization: Some(0.7),
                missing_cpt_ids: vec![],
            },
            PileConfigurationOption {
                configuration: PileConfigurationKey::from_metres(290, -18.0),
                pile_size_mm: 290,
                pile_tip_level_m: -18.0,
                is_option: true,
                governing_cpt_id: Some(1),
                governing_frd_kn: Some(650.0),
                utilization: Some(0.75),
                missing_cpt_ids: vec![],
            },
        ];

        assert_eq!(
            choose_default_pile_option(&options, -3.5, &cost_settings())
                .map(|option| option.pile_size_mm),
            Some(290)
        );
    }

    #[test]
    fn does_not_choose_a_default_pile_option_when_none_are_valid() {
        let options = vec![
            pile_option(290, -17.5, false, 1.1),
            pile_option(320, -18.0, false, 1.2),
        ];

        assert!(choose_default_pile_option(&options, -3.5, &cost_settings()).is_none());
    }

    #[test]
    fn chooses_default_options_for_all_load_points() {
        let options = HashMap::from([
            (
                1,
                vec![
                    pile_option(290, -17.5, true, 0.7),
                    pile_option(320, -17.5, true, 0.6),
                ],
            ),
            (2, vec![pile_option(290, -18.0, true, 0.8)]),
        ]);

        let choices = choose_default_pile_options(&options, -3.5, &cost_settings());

        assert_eq!(
            choices.get(&1),
            Some(&PileConfigurationKey {
                pile_size_mm: 290,
                pile_tip_level_mm: pile_tip_level_mm(-17.5),
            })
        );
        assert_eq!(
            choices.get(&2),
            Some(&PileConfigurationKey {
                pile_size_mm: 290,
                pile_tip_level_mm: pile_tip_level_mm(-18.0),
            })
        );
    }

    #[test]
    fn default_options_omit_load_points_without_valid_options() {
        let options = HashMap::from([(
            1,
            vec![
                pile_option(290, -17.5, false, 1.1),
                PileConfigurationOption {
                    configuration: PileConfigurationKey::from_metres(320, -18.0),
                    pile_size_mm: 320,
                    pile_tip_level_m: -18.0,
                    is_option: false,
                    governing_cpt_id: None,
                    governing_frd_kn: None,
                    utilization: None,
                    missing_cpt_ids: vec![1],
                },
            ],
        )]);

        assert!(choose_default_pile_options(&options, -3.5, &cost_settings()).is_empty());
    }

    #[test]
    fn default_options_omit_valid_options_without_cost_settings() {
        let options = HashMap::from([(1, vec![pile_option(999, -17.5, true, 0.7)])]);

        assert!(choose_default_pile_options(&options, -3.5, &cost_settings()).is_empty());
    }

    #[test]
    fn greedy_optimizer_limits_distinct_sizes_and_tip_levels() {
        let options_by_load_point = HashMap::from([
            (
                1,
                vec![
                    pile_option(290, -17.5, true, 0.5),
                    pile_option(320, -18.0, true, 0.6),
                ],
            ),
            (
                2,
                vec![
                    pile_option(290, -17.5, false, 1.1),
                    pile_option(320, -18.0, true, 0.7),
                ],
            ),
            (
                3,
                vec![
                    pile_option(350, -19.0, true, 0.8),
                    pile_option(320, -18.0, true, 0.9),
                ],
            ),
        ]);

        let result = greedy_optimize_test(
            &options_by_load_point,
            -3.5,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 1,
                max_pile_tip_levels: 1,
                max_pile_configurations: 1,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![290, 320, 350],
                enabled_pile_tip_levels: vec![-17.5, -18.0, -19.0],
            },
        );

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| (
                    choice.load_point_id,
                    choice.pile_size_mm,
                    choice.pile_tip_level_m
                ))
                .collect::<Vec<_>>(),
            vec![(1, 320, -18.0), (2, 320, -18.0), (3, 320, -18.0)]
        );
        assert_eq!(result.pile_size_count, 1);
        assert_eq!(result.pile_tip_level_count, 1);
        assert_eq!(result.configuration_count, 1);
    }

    #[test]
    fn greedy_optimizer_respects_disabled_configurations() {
        let options_by_load_point = HashMap::from([(
            1,
            vec![
                pile_option(290, -17.5, true, 0.5),
                pile_option(320, -18.0, true, 0.6),
            ],
        )]);

        let result = greedy_optimize_test(
            &options_by_load_point,
            -3.5,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 4,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![320],
                enabled_pile_tip_levels: vec![-18.0],
            },
        );

        assert_eq!(result.assignments[0].pile_size_mm, 320);
        assert_eq!(result.assignments[0].pile_tip_level_m, -18.0);
    }

    #[test]
    fn greedy_optimizer_treats_empty_enabled_configurations_as_none_enabled() {
        let options_by_load_point = HashMap::from([(
            1,
            vec![
                pile_option(290, -17.5, true, 0.5),
                pile_option(320, -18.0, true, 0.6),
            ],
        )]);

        let result = greedy_optimize_test(
            &options_by_load_point,
            -3.5,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 4,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![],
                enabled_pile_tip_levels: vec![],
            },
        );

        assert!(result.assignments.is_empty());
    }

    #[test]
    fn greedy_optimizer_enforces_maximum_utilization_inclusively() {
        let options_by_load_point = HashMap::from([
            (1, vec![pile_option(290, -17.5, true, 0.8)]),
            (2, vec![pile_option(290, -17.5, true, 0.800_001)]),
        ]);

        let result = greedy_optimize_test(
            &options_by_load_point,
            -3.5,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 1,
                max_pile_tip_levels: 1,
                max_pile_configurations: 1,
                max_utilization: 0.8,
                enabled_pile_sizes: vec![290],
                enabled_pile_tip_levels: vec![-17.5],
            },
        );

        assert_eq!(result.assignments.len(), 1);
        assert_eq!(result.assignments[0].load_point_id, 1);
    }

    #[test]
    fn greedy_optimizer_respects_configuration_limit_with_baseline_plan() {
        let options_by_load_point = HashMap::from([(
            1,
            vec![
                pile_option(320, -18.0, true, 0.6),
                pile_option(350, -19.0, true, 0.7),
            ],
        )]);

        let result = greedy_optimize_pile_choices(&GreedyOptimizationInput {
            options_by_load_point,
            target_load_point_ids: vec![1],
            locked_load_point_ids: vec![],
            current_assignments: HashMap::from([(99, config_key(320, -18.0))]),
            limit_scope: OptimizationLimitScope::WholePlan,
            pile_head_level_m: -3.5,
            cost_settings: cost_settings(),
            settings: GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 1,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![320, 350],
                enabled_pile_tip_levels: vec![-18.0, -19.0],
            },
        });

        assert_eq!(result.assignments[0].pile_size_mm, 320);
        assert_eq!(result.assignments[0].pile_tip_level_m, -18.0);
    }

    #[test]
    fn greedy_optimizer_keeps_adding_configs_when_cost_improves_after_full_coverage() {
        let options_by_load_point = HashMap::from([
            (
                1,
                vec![
                    pile_option(320, -20.0, true, 0.6),
                    pile_option(290, -18.0, true, 0.7),
                ],
            ),
            (
                2,
                vec![
                    pile_option(320, -20.0, true, 0.6),
                    pile_option(356, -18.0, true, 0.7),
                ],
            ),
        ]);

        let result = greedy_optimize_test(
            &options_by_load_point,
            -3.5,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 3,
                max_pile_tip_levels: 5,
                max_pile_configurations: 3,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![290, 320, 356],
                enabled_pile_tip_levels: vec![-18.0, -20.0],
            },
        );

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|choice| (
                    choice.load_point_id,
                    choice.pile_size_mm,
                    choice.pile_tip_level_m
                ))
                .collect::<Vec<_>>(),
            vec![(1, 290, -18.0), (2, 356, -18.0)]
        );
    }

    #[test]
    fn greedy_optimizer_does_not_fall_back_outside_selected_configurations() {
        let options = HashMap::from([
            (1, vec![pile_option(290, -18.0, true, 0.6)]),
            (2, vec![pile_option(320, -19.0, true, 0.7)]),
        ]);
        let settings = greedy_settings(1, 1, 1, vec![290, 320], vec![-18.0, -19.0]);

        let result = greedy_optimize_test(&options, -3.5, &cost_settings(), &settings);

        assert_eq!(result.assignments.len(), 1);
        assert_eq!(result.unassigned.len(), 1);
        assert_eq!(
            result.unassigned[0].reason,
            GreedyUnassignedReason::ConfigurationLimits
        );
        assert!(result.assignments.iter().all(|choice| {
            result.selected_configurations.iter().any(|config| {
                config.pile_size_mm == choice.pile_size_mm
                    && config.pile_tip_level_mm == pile_tip_level_mm(choice.pile_tip_level_m)
            })
        }));
    }

    #[test]
    fn greedy_optimizer_reports_invalid_and_filtered_options_separately() {
        let options = HashMap::from([
            (1, vec![pile_option(290, -18.0, false, 1.2)]),
            (2, vec![pile_option(320, -19.0, true, 0.7)]),
        ]);
        let settings = greedy_settings(1, 1, 1, vec![290], vec![-18.0]);

        let result = greedy_optimize_test(&options, -3.5, &cost_settings(), &settings);

        assert_eq!(
            result.unassigned,
            vec![
                GreedyUnassignedLoadPoint {
                    load_point_id: 1,
                    reason: GreedyUnassignedReason::NoValidOption,
                },
                GreedyUnassignedLoadPoint {
                    load_point_id: 2,
                    reason: GreedyUnassignedReason::OptimizationConstraints,
                },
            ]
        );
    }

    #[test]
    fn greedy_optimizer_counts_many_uncovered_points_without_overflow() {
        let options = (1..=20_000).map(|id| (id, Vec::new())).collect();
        let result = greedy_optimize_test(
            &options,
            -3.5,
            &cost_settings(),
            &greedy_settings(1, 1, 1, vec![290], vec![-18.0]),
        );

        assert!(result.assignments.is_empty());
        assert_eq!(result.unassigned.len(), 20_000);
    }

    #[test]
    fn greedy_optimizer_prefers_known_cost_with_equal_coverage() {
        let options = HashMap::from([(
            1,
            vec![
                pile_option(290, -18.0, true, 0.6),
                pile_option(999, -18.0, true, 0.6),
            ],
        )]);
        let result = greedy_optimize_test(
            &options,
            -3.5,
            &cost_settings(),
            &greedy_settings(2, 1, 1, vec![290, 999], vec![-18.0]),
        );

        assert_eq!(result.assignments[0].pile_size_mm, 290);
    }

    #[test]
    fn greedy_optimizer_excludes_locked_targets_in_core() {
        let mut input = optimization_input(HashMap::from([
            (1, vec![pile_option(290, -18.0, true, 0.6)]),
            (2, vec![pile_option(320, -19.0, true, 0.7)]),
        ]));
        input.target_load_point_ids = vec![1, 2];
        input.locked_load_point_ids = vec![2];
        input.current_assignments.insert(2, config_key(320, -19.0));

        let result = greedy_optimize_pile_choices(&input);

        assert_eq!(
            result
                .assignments
                .iter()
                .map(|item| item.load_point_id)
                .collect::<Vec<_>>(),
            vec![1],
        );
        assert!(result.unassigned.iter().all(|item| item.load_point_id != 2));
    }

    #[test]
    fn whole_plan_limits_derive_baseline_from_non_targets() {
        let mut input = optimization_input(HashMap::from([
            (1, vec![pile_option(290, -18.0, true, 0.6)]),
            (2, vec![pile_option(320, -19.0, true, 0.7)]),
        ]));
        input.target_load_point_ids = vec![2];
        input.current_assignments.insert(1, config_key(290, -18.0));
        input.limit_scope = OptimizationLimitScope::WholePlan;
        input.settings.max_pile_configurations = 1;

        let result = greedy_optimize_pile_choices(&input);

        assert!(result.assignments.is_empty());
        assert_eq!(
            result.unassigned[0].reason,
            GreedyUnassignedReason::ConfigurationLimits
        );
    }

    #[test]
    fn lists_bearing_capacity_rows_for_one_cpt() {
        assert_eq!(
            bearing_capacity_rows_for_cpt(
                &[
                    capacity(11, -18.0, 320, 700.0),
                    capacity(11, -19.0, 320, 740.0)
                ],
                11,
            ),
            vec![
                CptBearingCapacityRow {
                    pile_size_mm: 320,
                    pile_tip_level_m: -18.0,
                    frd_kn: 700.0,
                },
                CptBearingCapacityRow {
                    pile_size_mm: 320,
                    pile_tip_level_m: -19.0,
                    frd_kn: 740.0,
                },
            ]
        );
    }

    fn pile_option(
        pile_size_mm: u32,
        pile_tip_level_m: f64,
        is_option: bool,
        utilization: f64,
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: PileConfigurationKey::from_metres(pile_size_mm, pile_tip_level_m),
            pile_size_mm,
            pile_tip_level_m,
            is_option,
            governing_cpt_id: Some(1),
            governing_frd_kn: Some(1000.0),
            utilization: Some(utilization),
            missing_cpt_ids: vec![],
        }
    }

    fn greedy_settings(
        max_pile_sizes: usize,
        max_pile_tip_levels: usize,
        max_pile_configurations: usize,
        enabled_pile_sizes: Vec<u32>,
        enabled_pile_tip_levels: Vec<f64>,
    ) -> GreedyOptimizationSettings {
        GreedyOptimizationSettings {
            max_pile_sizes,
            max_pile_tip_levels,
            max_pile_configurations,
            max_utilization: 1.0,
            enabled_pile_sizes,
            enabled_pile_tip_levels,
        }
    }

    fn config_key(pile_size_mm: u32, pile_tip_level_m: f64) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm,
            pile_tip_level_mm: pile_tip_level_mm(pile_tip_level_m),
        }
    }

    fn optimization_input(
        options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    ) -> GreedyOptimizationInput {
        let target_load_point_ids = options_by_load_point.keys().copied().collect();
        GreedyOptimizationInput {
            options_by_load_point,
            target_load_point_ids,
            locked_load_point_ids: vec![],
            current_assignments: HashMap::new(),
            limit_scope: OptimizationLimitScope::Target,
            pile_head_level_m: -3.5,
            cost_settings: cost_settings(),
            settings: greedy_settings(3, 5, 15, vec![290, 320, 350, 356], vec![-18.0, -19.0]),
        }
    }

    fn greedy_optimize_test(
        options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
        pile_head_level_m: f64,
        cost_settings: &PileCostSettings,
        settings: &GreedyOptimizationSettings,
    ) -> GreedyOptimizationResult {
        greedy_optimize_pile_choices(&GreedyOptimizationInput {
            options_by_load_point: options_by_load_point.clone(),
            target_load_point_ids: options_by_load_point.keys().copied().collect(),
            locked_load_point_ids: vec![],
            current_assignments: HashMap::new(),
            limit_scope: OptimizationLimitScope::Target,
            pile_head_level_m,
            cost_settings: cost_settings.clone(),
            settings: settings.clone(),
        })
    }
}
