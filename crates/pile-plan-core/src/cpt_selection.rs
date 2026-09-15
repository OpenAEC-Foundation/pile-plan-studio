use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::source_data::{Cpt, LoadPoint};

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

pub(crate) fn select_cpts(
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

pub(crate) fn selected_cpts_by_quadrant(
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

pub(crate) fn selected_cpts_by_maximum_angle(
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
            (distance <= max_distance_mm).then(|| SelectedCpt {
                label: String::new(),
                quadrant: None,
                cpt: cpt.clone(),
                distance_mm: distance,
            })
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

    fn load() -> LoadPoint {
        LoadPoint {
            id: 10,
            name: "Load point 10".into(),
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

    fn settings(algorithm: CptSelectionAlgorithm) -> CptSelectionSettings {
        CptSelectionSettings {
            algorithm,
            max_distance_m: 25.0,
            monopoly_distance_m: 1.0,
            max_angle_degrees: 120.0,
        }
    }

    #[test]
    fn legacy_settings_default_monopoly_distance_to_one_meter() {
        let settings: CptSelectionSettings = serde_json::from_str(
            r#"{"algorithm":"quadrants","max_distance_m":25.0,"max_angle_degrees":120.0}"#,
        )
        .unwrap();
        assert_eq!(settings.monopoly_distance_m, 1.0);
    }

    #[test]
    fn selects_nearest_cpt_in_each_quadrant() {
        let selected = selected_cpts_by_quadrant(
            &load(),
            &[
                cpt(1, 10.0, 10.0),
                cpt(2, 20.0, 20.0),
                cpt(3, 10.0, -10.0),
                cpt(4, -10.0, 10.0),
                cpt(5, -10.0, -10.0),
            ],
            25.0,
        );
        assert_eq!(
            selected.iter().map(|item| item.cpt.id).collect::<Vec<_>>(),
            vec![1, 3, 4, 5]
        );
    }

    #[test]
    fn selects_cpts_by_maximum_angle() {
        let selected = selected_cpts_by_maximum_angle(
            &load(),
            &[
                cpt(1, 10_000.0, 0.0),
                cpt(2, 0.0, 10_000.0),
                cpt(3, -10_000.0, 0.0),
                cpt(4, 0.0, -10_000.0),
            ],
            25.0,
            120.0,
        );
        assert_eq!(
            selected.iter().map(|item| item.cpt.id).collect::<Vec<_>>(),
            vec![1, 4, 3, 2]
        );
    }

    #[test]
    fn monopoly_returns_only_nearest_and_breaks_ties_by_id() {
        let selected = select_cpts(
            &load(),
            &[cpt(2, 500.0, 500.0), cpt(1, -500.0, -500.0)],
            &settings(CptSelectionAlgorithm::Quadrants),
            None,
        );
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].cpt.id, 1);
        assert_eq!(selected[0].label, "nearest");
    }

    #[test]
    fn manual_additions_follow_algorithmic_selections_in_distance_order() {
        let selected = select_cpts(
            &load(),
            &[
                cpt(1, 10_000.0, 10_000.0),
                cpt(2, -10_000.0, -10_000.0),
                cpt(8, 20_000.0, 0.0),
                cpt(9, 15_000.0, 0.0),
            ],
            &settings(CptSelectionAlgorithm::Quadrants),
            Some(&[8, 2, 9, 1]),
        );
        assert_eq!(
            selected
                .iter()
                .map(|item| (item.label.as_str(), item.cpt.id))
                .collect::<Vec<_>>(),
            vec![
                ("upper right", 1),
                ("lower left", 2),
                ("manual 1", 9),
                ("manual 2", 8)
            ]
        );
    }
}
