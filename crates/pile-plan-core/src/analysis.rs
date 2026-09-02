use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::pile_configuration::PileConfigurationKey;

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
                pile_tip_level_mm: PileConfigurationKey::from_metres(290, -17.5).pile_tip_level_mm,
            })
        );
        assert_eq!(
            choices.get(&2),
            Some(&PileConfigurationKey {
                pile_size_mm: 290,
                pile_tip_level_mm: PileConfigurationKey::from_metres(290, -18.0).pile_tip_level_mm,
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
}
