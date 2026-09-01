use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}

impl PileConfigurationKey {
    pub fn from_metres(pile_size_mm: u32, pile_tip_level_m: f64) -> Self {
        Self {
            pile_size_mm,
            pile_tip_level_mm: pile_tip_level_mm(pile_tip_level_m),
        }
    }

    pub fn pile_tip_level_m(&self) -> f64 {
        self.pile_tip_level_mm as f64 / 1000.0
    }
}

pub(crate) fn pile_tip_level_mm(pile_tip_level_m: f64) -> i64 {
    (pile_tip_level_m * 1000.0).round() as i64
}

#[cfg(test)]
mod tests {
    use super::PileConfigurationKey;

    #[test]
    fn canonical_key_rounds_negative_metres_to_integer_millimetres() {
        assert_eq!(
            PileConfigurationKey::from_metres(320, -18.5004),
            PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_500,
            },
        );
    }

    #[test]
    fn canonical_key_converts_back_to_metres_for_physical_calculations() {
        let key = PileConfigurationKey {
            pile_size_mm: 290,
            pile_tip_level_mm: -17_750,
        };

        assert_eq!(key.pile_tip_level_m(), -17.75);
    }

    #[test]
    fn canonical_order_uses_size_then_tip_millimetres() {
        let mut keys = vec![
            PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -19_000,
            },
            PileConfigurationKey {
                pile_size_mm: 290,
                pile_tip_level_mm: -18_000,
            },
        ];

        keys.sort();

        assert_eq!(keys[0].pile_size_mm, 290);
    }
}
