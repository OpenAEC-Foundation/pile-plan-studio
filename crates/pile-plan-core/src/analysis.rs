use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

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
    pub max_angle_degrees: f64,
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
    pub pile_head_level_m: f64,
    pub items: Vec<PileCostSettingsItem>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileCostSettingsItem {
    pub pile_size_mm: u32,
    pub shape: PileCostShape,
    pub cost_per_m3_eur: f64,
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
pub struct GreedyOptimizationSettings {
    pub max_pile_sizes: usize,
    pub max_pile_tip_levels: usize,
    pub max_pile_configurations: usize,
    pub enabled_pile_sizes: Vec<u32>,
    pub enabled_pile_tip_levels: Vec<f64>,
    pub baseline_pile_sizes: Vec<u32>,
    pub baseline_pile_tip_levels: Vec<f64>,
    pub baseline_pile_configurations: Vec<PileConfigurationKey>,
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_m_key: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GreedyOptimizedPileChoice {
    pub load_point_id: u32,
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub is_option: bool,
    pub cost_eur: Option<u32>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CapacityKey {
    cpt_id: u32,
    pile_size_mm: u32,
    pile_tip_level_m_key: i64,
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
    if let Some(manual_cpt_ids) = manual_cpt_ids {
        return manually_selected_cpts(load_point, cpts, manual_cpt_ids);
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

    configurations
        .into_iter()
        .map(|(pile_size_mm, pile_tip_level_m)| {
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
    load_points
        .iter()
        .map(|load_point| {
            let settings = settings_by_load_point(load_point);
            let selected_cpts = selected_cpts(
                load_point,
                cpts,
                &settings,
                manual_cpt_ids_by_load_point
                    .get(&load_point.id)
                    .map(|ids| ids.as_slice()),
            );
            let options = pile_configuration_options(
                load_point.design_load_kn,
                &selected_cpts,
                bearing_capacities,
            );

            (load_point.id, options)
        })
        .collect()
}

pub fn calculate_pile_cost(
    pile_size_mm: u32,
    pile_tip_level_m: f64,
    settings: &PileCostSettings,
) -> Option<u32> {
    let settings_item = settings
        .items
        .iter()
        .find(|item| item.pile_size_mm == pile_size_mm)?;
    let pile_length_m = (settings.pile_head_level_m - pile_tip_level_m).abs();
    let cross_section_m2 = match settings_item.shape {
        PileCostShape::Round => std::f64::consts::PI * (pile_size_mm as f64 / 2000.0).powi(2),
        PileCostShape::Square => (pile_size_mm as f64 / 1000.0).powi(2),
    };

    Some((settings_item.cost_per_m3_eur * pile_length_m * cross_section_m2).trunc() as u32)
}

pub fn choose_default_pile_option<'a>(
    options: &'a [PileConfigurationOption],
    settings: &PileCostSettings,
) -> Option<&'a PileConfigurationOption> {
    options
        .iter()
        .filter(|option| option.is_option)
        .min_by(|left, right| {
            let left_cost = calculate_pile_cost(left.pile_size_mm, left.pile_tip_level_m, settings);
            let right_cost =
                calculate_pile_cost(right.pile_size_mm, right.pile_tip_level_m, settings);

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

pub fn greedy_optimize_pile_choices(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    cost_settings: &PileCostSettings,
    settings: &GreedyOptimizationSettings,
) -> Vec<GreedyOptimizedPileChoice> {
    let eligible_options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>> =
        options_by_load_point
            .iter()
            .map(|(load_point_id, options)| {
                (
                    *load_point_id,
                    options
                        .iter()
                        .filter(|option| {
                            option.is_option && optimization_option_enabled(option, settings)
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
            cost_settings,
            settings,
        ) else {
            break;
        };

        if !selected_configs.is_empty() {
            let current_score = optimization_score_for_configs(
                &eligible_options_by_load_point,
                &selected_configs,
                cost_settings,
            );
            let next_score = optimization_score_for_configs(
                &eligible_options_by_load_point,
                &[selected_configs.as_slice(), std::slice::from_ref(&config)].concat(),
                cost_settings,
            );

            if next_score >= current_score {
                break;
            }
        }

        selected_configs.push(config);
    }

    if selected_configs.is_empty() {
        selected_configs = all_optimization_configs(&eligible_options_by_load_point)
            .into_iter()
            .take(1)
            .collect();
    }

    let mut choices: Vec<_> = eligible_options_by_load_point
        .iter()
        .filter_map(|(load_point_id, options)| {
            let selected_option =
                cheapest_option_for_configs(options, &selected_configs, cost_settings)
                    .or_else(|| cheapest_valid_option(options, cost_settings))?;

            Some(GreedyOptimizedPileChoice {
                load_point_id: *load_point_id,
                pile_size_mm: selected_option.pile_size_mm,
                pile_tip_level_m: selected_option.pile_tip_level_m,
                is_option: selected_option.is_option,
                cost_eur: calculate_pile_cost(
                    selected_option.pile_size_mm,
                    selected_option.pile_tip_level_m,
                    cost_settings,
                ),
            })
        })
        .collect();

    choices.sort_by_key(|choice| choice.load_point_id);
    choices
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct OptimizationConfig {
    pile_size_mm: u32,
    pile_tip_level_m_key: i64,
}

impl OptimizationConfig {
    fn from_option(option: &PileConfigurationOption) -> Self {
        Self {
            pile_size_mm: option.pile_size_mm,
            pile_tip_level_m_key: scaled_level_key(option.pile_tip_level_m),
        }
    }

    fn matches_option(&self, option: &PileConfigurationOption) -> bool {
        self.pile_size_mm == option.pile_size_mm
            && self.pile_tip_level_m_key == scaled_level_key(option.pile_tip_level_m)
    }

    fn as_key(&self) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm: self.pile_size_mm,
            pile_tip_level_m_key: self.pile_tip_level_m_key,
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
            .any(|level| scaled_level_key(*level) == scaled_level_key(option.pile_tip_level_m))
}

fn best_next_optimization_config(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    selected_configs: &[OptimizationConfig],
    cost_settings: &PileCostSettings,
    settings: &GreedyOptimizationSettings,
) -> Option<OptimizationConfig> {
    all_optimization_configs(options_by_load_point)
        .into_iter()
        .filter(|config| !selected_configs.contains(config))
        .filter(|config| {
            config_respects_limits(config, selected_configs, options_by_load_point, settings)
        })
        .min_by(|left, right| {
            let left_score = optimization_score_for_configs(
                options_by_load_point,
                &[selected_configs, std::slice::from_ref(left)].concat(),
                cost_settings,
            );
            let right_score = optimization_score_for_configs(
                options_by_load_point,
                &[selected_configs, std::slice::from_ref(right)].concat(),
                cost_settings,
            );

            left_score.cmp(&right_score)
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
            .then_with(|| right.pile_tip_level_m_key.cmp(&left.pile_tip_level_m_key))
    });
    configs
}

fn config_respects_limits(
    config: &OptimizationConfig,
    selected_configs: &[OptimizationConfig],
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    settings: &GreedyOptimizationSettings,
) -> bool {
    let next_configs = [selected_configs, std::slice::from_ref(config)].concat();
    let size_count = settings
        .baseline_pile_sizes
        .iter()
        .copied()
        .chain(next_configs.iter().map(|item| item.pile_size_mm))
        .collect::<HashSet<_>>()
        .len();
    let tip_count = settings
        .baseline_pile_tip_levels
        .iter()
        .map(|level| scaled_level_key(*level))
        .chain(next_configs.iter().map(|item| item.pile_tip_level_m_key))
        .collect::<HashSet<_>>()
        .len();
    let configuration_count = settings
        .baseline_pile_configurations
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

#[derive(Eq, Ord, PartialEq, PartialOrd)]
struct OptimizationScore {
    uncovered_count: usize,
    total_cost: u32,
}

fn optimization_score_for_configs(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
    configs: &[OptimizationConfig],
    cost_settings: &PileCostSettings,
) -> OptimizationScore {
    let mut uncovered_count = 0;
    let mut total_cost = 0;

    for options in options_by_load_point.values() {
        if let Some(option) = cheapest_option_for_configs(options, configs, cost_settings) {
            total_cost +=
                calculate_pile_cost(option.pile_size_mm, option.pile_tip_level_m, cost_settings)
                    .unwrap_or(u32::MAX / 4);
        } else {
            uncovered_count += 1;
            total_cost += u32::MAX / 8;
        }
    }

    OptimizationScore {
        uncovered_count,
        total_cost,
    }
}

fn cheapest_option_for_configs<'a>(
    options: &'a [PileConfigurationOption],
    configs: &[OptimizationConfig],
    cost_settings: &PileCostSettings,
) -> Option<&'a PileConfigurationOption> {
    options
        .iter()
        .filter(|option| configs.iter().any(|config| config.matches_option(option)))
        .min_by(|left, right| {
            let left_cost =
                calculate_pile_cost(left.pile_size_mm, left.pile_tip_level_m, cost_settings);
            let right_cost =
                calculate_pile_cost(right.pile_size_mm, right.pile_tip_level_m, cost_settings);

            left_cost
                .unwrap_or(u32::MAX)
                .cmp(&right_cost.unwrap_or(u32::MAX))
        })
}

fn cheapest_valid_option<'a>(
    options: &'a [PileConfigurationOption],
    cost_settings: &PileCostSettings,
) -> Option<&'a PileConfigurationOption> {
    options.iter().min_by(|left, right| {
        let left_cost =
            calculate_pile_cost(left.pile_size_mm, left.pile_tip_level_m, cost_settings);
        let right_cost =
            calculate_pile_cost(right.pile_size_mm, right.pile_tip_level_m, cost_settings);

        left_cost
            .unwrap_or(u32::MAX)
            .cmp(&right_cost.unwrap_or(u32::MAX))
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
            if seen.insert((key.pile_size_mm, key.pile_tip_level_m_key)) {
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
        pile_tip_level_m_key: scaled_level_key(pile_tip_level_m),
    }
}

fn scaled_level_key(pile_tip_level_m: f64) -> i64 {
    (pile_tip_level_m * 1000.0).round() as i64
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

    fn cost_settings() -> PileCostSettings {
        PileCostSettings {
            schema_version: 1,
            pile_head_level_m: -3.5,
            items: vec![
                PileCostSettingsItem {
                    pile_size_mm: 290,
                    shape: PileCostShape::Square,
                    cost_per_m3_eur: 220.0,
                },
                PileCostSettingsItem {
                    pile_size_mm: 320,
                    shape: PileCostShape::Square,
                    cost_per_m3_eur: 205.0,
                },
                PileCostSettingsItem {
                    pile_size_mm: 356,
                    shape: PileCostShape::Round,
                    cost_per_m3_eur: 190.0,
                },
            ],
        }
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
    fn manual_cpt_selection_overrides_algorithm() {
        let selected = selected_cpts(
            &load_point(),
            &[cpt(1, 10_000.0, 10_000.0), cpt(2, -10_000.0, -10_000.0)],
            &CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                max_angle_degrees: 120.0,
            },
            Some(&[2, 99, 1]),
        );

        let result: Vec<_> = selected
            .iter()
            .map(|item| (item.label.as_str(), item.cpt.id))
            .collect();
        assert_eq!(result, vec![("manual 1", 2), ("manual 3", 1)]);
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
                    pile_size_mm: 320,
                    pile_tip_level_m: -18.0,
                    is_option: true,
                    governing_cpt_id: Some(12),
                    governing_frd_kn: Some(650.0),
                    utilization: Some(600.0 / 650.0),
                    missing_cpt_ids: vec![],
                },
                PileConfigurationOption {
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
    fn calculates_pile_cost_with_correct_round_section_formula() {
        assert_eq!(calculate_pile_cost(320, -18.0, &cost_settings()), Some(304));
        assert_eq!(calculate_pile_cost(356, -18.0, &cost_settings()), Some(274));
        assert_eq!(calculate_pile_cost(400, -18.0, &cost_settings()), None);
    }

    #[test]
    fn chooses_the_cheapest_valid_pile_option_by_default() {
        let options = vec![
            PileConfigurationOption {
                pile_size_mm: 320,
                pile_tip_level_m: -18.0,
                is_option: true,
                governing_cpt_id: Some(1),
                governing_frd_kn: Some(700.0),
                utilization: Some(0.7),
                missing_cpt_ids: vec![],
            },
            PileConfigurationOption {
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
            choose_default_pile_option(&options, &cost_settings())
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

        assert!(choose_default_pile_option(&options, &cost_settings()).is_none());
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

        let choices = greedy_optimize_pile_choices(
            &options_by_load_point,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 1,
                max_pile_tip_levels: 1,
                max_pile_configurations: 1,
                enabled_pile_sizes: vec![290, 320, 350],
                enabled_pile_tip_levels: vec![-17.5, -18.0, -19.0],
                baseline_pile_sizes: vec![],
                baseline_pile_tip_levels: vec![],
                baseline_pile_configurations: vec![],
            },
        );

        assert_eq!(
            choices
                .iter()
                .map(|choice| (
                    choice.load_point_id,
                    choice.pile_size_mm,
                    choice.pile_tip_level_m
                ))
                .collect::<Vec<_>>(),
            vec![(1, 320, -18.0), (2, 320, -18.0), (3, 320, -18.0)]
        );
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

        let choices = greedy_optimize_pile_choices(
            &options_by_load_point,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 4,
                enabled_pile_sizes: vec![320],
                enabled_pile_tip_levels: vec![-18.0],
                baseline_pile_sizes: vec![],
                baseline_pile_tip_levels: vec![],
                baseline_pile_configurations: vec![],
            },
        );

        assert_eq!(choices[0].pile_size_mm, 320);
        assert_eq!(choices[0].pile_tip_level_m, -18.0);
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

        let choices = greedy_optimize_pile_choices(
            &options_by_load_point,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 4,
                enabled_pile_sizes: vec![],
                enabled_pile_tip_levels: vec![],
                baseline_pile_sizes: vec![],
                baseline_pile_tip_levels: vec![],
                baseline_pile_configurations: vec![],
            },
        );

        assert!(choices.is_empty());
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

        let choices = greedy_optimize_pile_choices(
            &options_by_load_point,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 2,
                max_pile_tip_levels: 2,
                max_pile_configurations: 1,
                enabled_pile_sizes: vec![320, 350],
                enabled_pile_tip_levels: vec![-18.0, -19.0],
                baseline_pile_sizes: vec![320],
                baseline_pile_tip_levels: vec![-18.0],
                baseline_pile_configurations: vec![PileConfigurationKey {
                    pile_size_mm: 320,
                    pile_tip_level_m_key: scaled_level_key(-18.0),
                }],
            },
        );

        assert_eq!(choices[0].pile_size_mm, 320);
        assert_eq!(choices[0].pile_tip_level_m, -18.0);
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

        let choices = greedy_optimize_pile_choices(
            &options_by_load_point,
            &cost_settings(),
            &GreedyOptimizationSettings {
                max_pile_sizes: 3,
                max_pile_tip_levels: 5,
                max_pile_configurations: 3,
                enabled_pile_sizes: vec![290, 320, 356],
                enabled_pile_tip_levels: vec![-18.0, -20.0],
                baseline_pile_sizes: vec![],
                baseline_pile_tip_levels: vec![],
                baseline_pile_configurations: vec![],
            },
        );

        assert_eq!(
            choices
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
            pile_size_mm,
            pile_tip_level_m,
            is_option,
            governing_cpt_id: Some(1),
            governing_frd_kn: Some(1000.0),
            utilization: Some(utilization),
            missing_cpt_ids: vec![],
        }
    }
}
