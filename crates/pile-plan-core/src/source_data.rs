use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPoint {
    pub id: u32,
    pub name: String,
    pub x_mm: f64,
    pub y_mm: f64,
    pub design_load_kn: f64,
    #[serde(default)]
    pub tension: TensionDemand,
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
    /// None denotes advice explicitly valid for every pile-cap count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pile_count: Option<u32>,
    /// A scoped empty cell blocks fallback to general advice; it is not zero capacity.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub missing: bool,
    pub cpt_id: u32,
    pub pile_tip_level_m: f64,
    pub pile_size_mm: u32,
    pub frd_kn: f64,
    #[serde(default)]
    pub direction: ResistanceDirection,
}

/// An omitted import is deliberately distinct from an explicitly missing value.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum TensionDemand {
    #[default]
    NotImported,
    Missing,
    Known {
        value_kn: f64,
    },
}
impl TensionDemand {
    pub fn is_valid(&self) -> bool {
        match self {
            Self::Known { value_kn } => value_kn.is_finite() && *value_kn >= 0.,
            _ => true,
        }
    }
    pub(crate) fn divided(&self, count: u8) -> Self {
        match self {
            Self::Known { value_kn } => Self::Known {
                value_kn: value_kn / f64::from(count),
            },
            other => other.clone(),
        }
    }
    pub(crate) fn sum<'a>(values: impl Iterator<Item = &'a Self>) -> Self {
        let mut sum = 0.;
        let mut known = false;
        let mut absent = false;
        for value in values {
            match value {
                Self::Known { value_kn } if value_kn.is_finite() && *value_kn >= 0. => {
                    sum += value_kn;
                    known = true
                }
                Self::NotImported => absent = true,
                _ => return Self::Missing,
            }
        }
        if known && absent || !sum.is_finite() {
            Self::Missing
        } else if known {
            Self::Known { value_kn: sum }
        } else {
            Self::NotImported
        }
    }
}
#[derive(
    Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize,
)]
#[serde(rename_all = "snake_case")]
pub enum ResistanceDirection {
    #[default]
    Compression,
    Tension,
}
