use serde::{Deserialize, Serialize};

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
