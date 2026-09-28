use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
#[serde(rename_all = "kebab-case")]
pub enum PileCostValidationReason {
    NonPositivePileSize,
    NonFiniteCost,
    NegativeCost,
    DuplicatePileSize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct InvalidPileCostSettingsItem {
    pub index: usize,
    pub pile_size_mm: u32,
    pub reason: PileCostValidationReason,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct InvalidPileCostSettings {
    pub errors: Vec<InvalidPileCostSettingsItem>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PileCostShape {
    Round,
    Square,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum PileCostCatalogAction {
    Add {
        item: PileCostSettingsItem,
    },
    Update {
        pile_size_mm: u32,
        shape: Option<PileCostShape>,
        cost_per_m3: Option<f64>,
    },
    Remove {
        pile_size_mm: u32,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileCostCatalogEditInput {
    pub settings: PileCostSettings,
    pub used_pile_sizes_mm: Vec<u32>,
    pub actions: Vec<PileCostCatalogAction>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PileCostCatalogBlockReason {
    EmptyActions,
    DuplicateTarget,
    DuplicatePileSize,
    UnknownPileSize,
    UsedPileSize,
    EmptyUpdate,
    InvalidCost,
    InvalidPileSize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PileCostCatalogEditResult {
    Applied {
        settings: PileCostSettings,
        changed_sizes_mm: Vec<u32>,
        changed: bool,
    },
    Blocked {
        reason: PileCostCatalogBlockReason,
        pile_size_mm: Option<u32>,
        action_index: usize,
    },
}

pub fn evaluate_pile_cost_catalog_edit(
    input: &PileCostCatalogEditInput,
) -> PileCostCatalogEditResult {
    let blocked = |reason, pile_size_mm, action_index| PileCostCatalogEditResult::Blocked {
        reason,
        pile_size_mm,
        action_index,
    };
    if input.actions.is_empty() {
        return blocked(PileCostCatalogBlockReason::EmptyActions, None, 0);
    }
    let used = input
        .used_pile_sizes_mm
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    let mut settings = input.settings.clone();
    let mut changed_sizes = Vec::new();
    for (index, action) in input.actions.iter().enumerate() {
        let size = match action {
            PileCostCatalogAction::Add { item } => item.pile_size_mm,
            PileCostCatalogAction::Update { pile_size_mm, .. }
            | PileCostCatalogAction::Remove { pile_size_mm } => *pile_size_mm,
        };
        if size == 0 {
            return blocked(
                PileCostCatalogBlockReason::InvalidPileSize,
                Some(size),
                index,
            );
        }
        if !seen.insert(size) {
            return blocked(
                PileCostCatalogBlockReason::DuplicateTarget,
                Some(size),
                index,
            );
        }
        let position = settings
            .items
            .iter()
            .position(|item| item.pile_size_mm == size);
        match action {
            PileCostCatalogAction::Add { item } => {
                if position.is_some() {
                    return blocked(
                        PileCostCatalogBlockReason::DuplicatePileSize,
                        Some(size),
                        index,
                    );
                }
                if !item.cost_per_m3.is_finite() || item.cost_per_m3 < 0.0 {
                    return blocked(PileCostCatalogBlockReason::InvalidCost, Some(size), index);
                }
                settings.items.push(item.clone());
                changed_sizes.push(size);
            }
            PileCostCatalogAction::Update {
                shape, cost_per_m3, ..
            } => {
                let Some(position) = position else {
                    return blocked(
                        PileCostCatalogBlockReason::UnknownPileSize,
                        Some(size),
                        index,
                    );
                };
                if shape.is_none() && cost_per_m3.is_none() {
                    return blocked(PileCostCatalogBlockReason::EmptyUpdate, Some(size), index);
                }
                if cost_per_m3.is_some_and(|cost| !cost.is_finite() || cost < 0.0) {
                    return blocked(PileCostCatalogBlockReason::InvalidCost, Some(size), index);
                }
                let item = &mut settings.items[position];
                let before = item.clone();
                if let Some(shape) = shape {
                    item.shape = shape.clone();
                }
                if let Some(cost) = cost_per_m3 {
                    item.cost_per_m3 = *cost;
                }
                if *item != before {
                    changed_sizes.push(size);
                }
            }
            PileCostCatalogAction::Remove { .. } => {
                let Some(position) = position else {
                    return blocked(
                        PileCostCatalogBlockReason::UnknownPileSize,
                        Some(size),
                        index,
                    );
                };
                if used.contains(&size) {
                    return blocked(PileCostCatalogBlockReason::UsedPileSize, Some(size), index);
                }
                settings.items.remove(position);
                changed_sizes.push(size);
            }
        }
    }
    if changed_sizes.is_empty() {
        return PileCostCatalogEditResult::Applied {
            settings: input.settings.clone(),
            changed_sizes_mm: vec![],
            changed: false,
        };
    }
    settings.items.sort_by_key(|item| item.pile_size_mm);
    if validate_pile_cost_settings(&settings).is_err() {
        return blocked(
            PileCostCatalogBlockReason::InvalidCost,
            None,
            input.actions.len(),
        );
    }
    PileCostCatalogEditResult::Applied {
        changed: settings != input.settings,
        settings,
        changed_sizes_mm: changed_sizes,
    }
}

pub fn validate_pile_cost_settings(
    settings: &PileCostSettings,
) -> Result<(), InvalidPileCostSettings> {
    let mut seen_sizes = std::collections::HashSet::new();
    let errors = settings
        .items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let reason = if item.pile_size_mm == 0 {
                Some(PileCostValidationReason::NonPositivePileSize)
            } else if !item.cost_per_m3.is_finite() {
                Some(PileCostValidationReason::NonFiniteCost)
            } else if item.cost_per_m3 < 0.0 {
                Some(PileCostValidationReason::NegativeCost)
            } else if !seen_sizes.insert(item.pile_size_mm) {
                Some(PileCostValidationReason::DuplicatePileSize)
            } else {
                None
            };
            reason.map(|reason| InvalidPileCostSettingsItem {
                index,
                pile_size_mm: item.pile_size_mm,
                reason,
            })
        })
        .collect::<Vec<_>>();

    if errors.is_empty() {
        Ok(())
    } else {
        Err(InvalidPileCostSettings { errors })
    }
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn calculates_pile_cost_with_correct_round_section_formula() {
        let settings = PileCostSettings {
            schema_version: 1,
            items: vec![
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
        };

        assert_eq!(calculate_pile_cost(320, -18.0, -3.5, &settings), Some(304));
        assert_eq!(calculate_pile_cost(356, -18.0, -3.5, &settings), Some(274));
        assert_eq!(calculate_pile_cost(400, -18.0, -3.5, &settings), None);
    }
}
