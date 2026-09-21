//! Read-only migration of settings from projects saved with the retired optimizer.
use crate::{IlpCandidateSource, IlpOptimizationSettings};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct LegacyOptimizationSettings {
    #[serde(default)]
    pub max_pile_sizes: usize,
    #[serde(default)]
    pub max_pile_tip_levels: usize,
    #[serde(default = "default_max_utilization")]
    pub max_utilization: f64,
    #[serde(default)]
    pub candidate_source: LegacyCandidateSource,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LegacyCandidateSource {
    #[default]
    AllAvailable,
    ActiveLegend,
}

fn default_max_utilization() -> f64 {
    1.0
}

impl Default for LegacyOptimizationSettings {
    fn default() -> Self {
        Self {
            max_pile_sizes: 0,
            max_pile_tip_levels: 0,
            max_utilization: 1.0,
            candidate_source: Default::default(),
        }
    }
}

impl LegacyOptimizationSettings {
    pub(crate) fn to_ilp_settings(&self) -> IlpOptimizationSettings {
        IlpOptimizationSettings {
            max_pile_tip_levels: u32::try_from(self.max_pile_tip_levels)
                .ok()
                .filter(|n| *n > 0),
            max_pile_sizes: u32::try_from(self.max_pile_sizes).ok().filter(|n| *n > 0),
            max_pile_configurations: None,
            max_utilization: self.max_utilization,
            candidate_source: match self.candidate_source {
                LegacyCandidateSource::AllAvailable => IlpCandidateSource::AllAvailable,
                LegacyCandidateSource::ActiveLegend => IlpCandidateSource::ActiveLegend,
            },
            ..IlpOptimizationSettings::default()
        }
    }
}
