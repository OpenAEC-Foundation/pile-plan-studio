use serde::{Deserialize, Serialize};

use crate::{pile_tip_level_m, try_pile_tip_level_mm, PileTipLevelPrecisionError};

#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct PileConfigurationKey {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}

impl PileConfigurationKey {
    pub fn try_from_metres(
        pile_size_mm: u32,
        pile_tip_level_m: f64,
    ) -> Result<Self, PileTipLevelPrecisionError> {
        Ok(Self {
            pile_size_mm,
            pile_tip_level_mm: try_pile_tip_level_mm(pile_tip_level_m)?,
        })
    }

    #[cfg(test)]
    pub(crate) fn from_metres(pile_size_mm: u32, pile_tip_level_m: f64) -> Self {
        Self::try_from_metres(pile_size_mm, pile_tip_level_m)
            .expect("pile tip level must be validated before creating a configuration key")
    }

    pub fn pile_tip_level_m(&self) -> f64 {
        pile_tip_level_m(self.pile_tip_level_mm)
    }
}

#[cfg(test)]
pub(crate) fn pile_tip_level_mm(pile_tip_level_m: f64) -> i64 {
    try_pile_tip_level_mm(pile_tip_level_m)
        .expect("pile tip level must be validated before deriving a millimetre key")
}

#[cfg(test)]
mod tests {
    use super::PileConfigurationKey;
    use crate::PileTipLevelPrecisionErrorReason;

    #[test]
    fn canonical_key_rejects_submillimetre_metres() {
        assert_eq!(
            PileConfigurationKey::try_from_metres(320, -18.5004)
                .unwrap_err()
                .reason,
            PileTipLevelPrecisionErrorReason::Submillimetre,
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
