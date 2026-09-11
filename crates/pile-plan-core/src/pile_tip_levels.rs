use serde::{Deserialize, Serialize};
use std::fmt;

const MILLIMETRES_PER_METRE: f64 = 1_000.0;
const FLOAT_NOISE_TOLERANCE_MM: f64 = 1.0e-6;
pub(crate) const MAX_EXACT_INTEGER_MM: f64 = 9_007_199_254_740_991.0;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PileTipLevelPrecisionErrorReason {
    NonFinite,
    OutOfRange,
    Submillimetre,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PileTipLevelPrecisionError {
    pub value: String,
    pub reason: PileTipLevelPrecisionErrorReason,
}

impl PileTipLevelPrecisionError {
    fn new(value_m: f64, reason: PileTipLevelPrecisionErrorReason) -> Self {
        Self {
            value: value_m.to_string(),
            reason,
        }
    }
}

impl fmt::Display for PileTipLevelPrecisionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid pile tip level {} m: {}",
            self.value,
            match self.reason {
                PileTipLevelPrecisionErrorReason::NonFinite => "value is not finite",
                PileTipLevelPrecisionErrorReason::OutOfRange => {
                    "millimetre value is outside the exact integer range"
                }
                PileTipLevelPrecisionErrorReason::Submillimetre => {
                    "value has submillimetre precision"
                }
            }
        )
    }
}

impl std::error::Error for PileTipLevelPrecisionError {}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InvalidPileTipLevels {
    pub values: Vec<PileTipLevelPrecisionError>,
}

impl fmt::Display for InvalidPileTipLevels {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} invalid pile tip level(s)", self.values.len())
    }
}

impl std::error::Error for InvalidPileTipLevels {}

pub(crate) fn validate_pile_tip_level_values(
    values: impl Iterator<Item = f64>,
) -> Result<Vec<i64>, InvalidPileTipLevels> {
    let mut keys = Vec::new();
    let mut invalid = Vec::new();
    for value in values {
        match try_pile_tip_level_mm(value) {
            Ok(key) => keys.push(key),
            Err(error) => {
                if !invalid.contains(&error) {
                    invalid.push(error);
                }
            }
        }
    }
    if invalid.is_empty() {
        Ok(keys)
    } else {
        Err(InvalidPileTipLevels { values: invalid })
    }
}

pub fn try_pile_tip_level_mm(pile_tip_level_m: f64) -> Result<i64, PileTipLevelPrecisionError> {
    if !pile_tip_level_m.is_finite() {
        return Err(PileTipLevelPrecisionError::new(
            pile_tip_level_m,
            PileTipLevelPrecisionErrorReason::NonFinite,
        ));
    }

    let scaled = pile_tip_level_m * MILLIMETRES_PER_METRE;
    let rounded = scaled.round();
    if !rounded.is_finite() || rounded.abs() > MAX_EXACT_INTEGER_MM {
        return Err(PileTipLevelPrecisionError::new(
            pile_tip_level_m,
            PileTipLevelPrecisionErrorReason::OutOfRange,
        ));
    }
    if (scaled - rounded).abs() > FLOAT_NOISE_TOLERANCE_MM {
        return Err(PileTipLevelPrecisionError::new(
            pile_tip_level_m,
            PileTipLevelPrecisionErrorReason::Submillimetre,
        ));
    }

    Ok(rounded as i64)
}

pub fn pile_tip_level_m(pile_tip_level_mm: i64) -> f64 {
    pile_tip_level_mm as f64 / MILLIMETRES_PER_METRE
}

#[cfg(test)]
mod tests {
    use super::{try_pile_tip_level_mm, PileTipLevelPrecisionErrorReason, MAX_EXACT_INTEGER_MM};

    #[test]
    fn accepts_whole_millimetre_levels() {
        assert_eq!(try_pile_tip_level_mm(-18.0).unwrap(), -18_000);
        assert_eq!(try_pile_tip_level_mm(-18.5).unwrap(), -18_500);
        assert_eq!(try_pile_tip_level_mm(-18.25).unwrap(), -18_250);
        assert_eq!(try_pile_tip_level_mm(-18.525).unwrap(), -18_525);
        assert_eq!(try_pile_tip_level_mm(18.525).unwrap(), 18_525);
    }

    #[test]
    fn canonicalizes_positive_and_negative_zero() {
        assert_eq!(try_pile_tip_level_mm(0.0).unwrap(), 0);
        assert_eq!(try_pile_tip_level_mm(-0.0).unwrap(), 0);
    }

    #[test]
    fn tolerates_only_insignificant_binary_noise() {
        assert_eq!(try_pile_tip_level_mm(-18.525000000000002).unwrap(), -18_525);
    }

    #[test]
    fn rejects_physical_submillimetre_levels() {
        assert_eq!(
            try_pile_tip_level_mm(-18.5004).unwrap_err().reason,
            PileTipLevelPrecisionErrorReason::Submillimetre,
        );
        assert_eq!(
            try_pile_tip_level_mm(18.5004).unwrap_err().reason,
            PileTipLevelPrecisionErrorReason::Submillimetre,
        );
    }

    #[test]
    fn rejects_non_finite_and_inexact_transport_values() {
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                try_pile_tip_level_mm(value).unwrap_err().reason,
                PileTipLevelPrecisionErrorReason::NonFinite,
            );
        }
        assert_eq!(
            try_pile_tip_level_mm((MAX_EXACT_INTEGER_MM + 1.0) / 1_000.0)
                .unwrap_err()
                .reason,
            PileTipLevelPrecisionErrorReason::OutOfRange,
        );
    }
}
