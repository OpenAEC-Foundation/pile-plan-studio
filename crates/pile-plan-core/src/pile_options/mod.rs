use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

mod aggregation;
mod advice_inspection;
pub use advice_inspection::{inspect_foundation_advice,FoundationAdviceInspectionRequest};
mod analysis;
mod costs;
mod foundation_advice;
mod status;

pub use aggregation::{
    aggregate_pile_options_for_load_points, AggregatedPileConfiguration,
    AggregatedPileConfigurationStatus,
};
pub use analysis::{build_pile_option_analysis, build_pile_option_analysis_for_groups, calculate_pile_option_analysis, PileOptionAnalysisResult};
pub use costs::{
    calculate_pile_cost, evaluate_pile_cost_catalog_edit, validate_pile_cost_settings,
    InvalidPileCostSettings, InvalidPileCostSettingsItem, PileCostCatalogAction,
    PileCostCatalogBlockReason, PileCostCatalogEditInput, PileCostCatalogEditResult,
    PileCostSettings, PileCostSettingsItem, PileCostShape, PileCostValidationReason,
};
pub use foundation_advice::CptBearingCapacityRow;
pub use status::{pile_option_technical_status, PileOptionTechnicalStatus};

use crate::{cpt_selection::SelectedCpt, pile_configuration::PileConfigurationKey};
pub(crate) use foundation_advice::FoundationAdviceIndex;

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
    pub technical_status: PileOptionTechnicalStatus,
    #[serde(default)]
    pub compression: Option<DirectionAssessment>,
    #[serde(default)]
    pub tension: Option<DirectionAssessment>,
}

#[cfg(test)]
/// Compatibility helper for pressure-only tests.
pub(crate) fn pile_configuration_options(
    design_load_kn: f64,
    selected_cpts: &[SelectedCpt],
    advice: &FoundationAdviceIndex<'_>,
) -> Vec<PileConfigurationOption> {
    pile_configuration_options_with_tension(
        design_load_kn,
        &crate::TensionDemand::NotImported,
        selected_cpts,
        advice,
        1,
    )
}
pub(crate) fn pile_configuration_options_with_tension(
    design_load_kn: f64,
    tension: &crate::TensionDemand,
    selected_cpts: &[SelectedCpt],
    advice: &FoundationAdviceIndex<'_>,
    pile_count: u32,
) -> Vec<PileConfigurationOption> {
    advice
        .configurations()
        .iter()
        .map(|available| {
            let compression = assess_direction(
                &crate::TensionDemand::Known {
                    value_kn: design_load_kn,
                },
                crate::ResistanceDirection::Compression,
                selected_cpts,
                advice,
                &available.key,
                pile_count,
            );
            let tension = assess_direction(
                tension,
                crate::ResistanceDirection::Tension,
                selected_cpts,
                advice,
                &available.key,
                pile_count,
            );
            let mut option = PileConfigurationOption {
                configuration: available.key.clone(),
                pile_size_mm: available.key.pile_size_mm,
                pile_tip_level_m: available.pile_tip_level_m,
                is_option: false,
                governing_cpt_id: compression.governing_cpt_id,
                governing_frd_kn: compression.governing_frd_kn,
                utilization: compression.utilization,
                missing_cpt_ids: compression.missing_cpt_ids.clone(),
                technical_status: PileOptionTechnicalStatus::Valid,
                compression: Some(compression),
                tension: Some(tension),
            };
            option.apply_scope(true);
            option.utilization = option.compression.as_ref().and_then(|a| a.utilization);
            option.governing_cpt_id = option.compression.as_ref().and_then(|a| a.governing_cpt_id);
            option.governing_frd_kn = option.compression.as_ref().and_then(|a| a.governing_frd_kn);
            option
        })
        .collect()
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectionStatus {
    Valid,
    InsufficientCapacity,
    MissingCapacityData,
    MissingDemand,
    NotAssessed,
    NoLoad,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct DirectionAssessment {
    #[serde(default)]
    pub cpt_resistances: Vec<CptResistanceFact>,
    pub demand_kn: Option<f64>,
    pub governing_cpt_id: Option<u32>,
    pub governing_frd_kn: Option<f64>,
    pub utilization: Option<f64>,
    pub missing_cpt_ids: Vec<u32>,
    pub status: DirectionStatus,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CptResistanceFact { pub cpt_id: u32, pub frd_kn: Option<f64> }
impl DirectionAssessment {
    pub fn passes(&self) -> bool {
        matches!(
            self.status,
            DirectionStatus::Valid | DirectionStatus::NoLoad | DirectionStatus::NotAssessed
        )
    }
}
impl PileConfigurationOption {
    /// Project an immutable core evaluation to the requested optimizer scope.
    /// Display code must use the original directional facts instead.
    pub fn apply_scope(&mut self, include_tension: bool) {
        let Some(pressure) = &self.compression else {
            return;
        };
        let checks = std::iter::once(pressure)
            .chain(self.tension.iter().filter(|_| include_tension))
            .collect::<Vec<_>>();
        self.is_option = checks.iter().all(|a| a.passes());
        self.technical_status = if checks.iter().any(|a| {
            matches!(
                a.status,
                DirectionStatus::MissingCapacityData | DirectionStatus::MissingDemand
            )
        }) {
            PileOptionTechnicalStatus::MissingCapacityData
        } else if self.is_option {
            PileOptionTechnicalStatus::Valid
        } else {
            PileOptionTechnicalStatus::InsufficientCapacity
        };
        // Unassessed directions have no utilization; a known zero contributes 0.
        self.utilization = checks
            .iter()
            .filter_map(|a| a.utilization)
            .max_by(f64::total_cmp)
            .or_else(|| self.is_option.then_some(0.));
        let critical = checks
            .iter()
            .filter(|a| a.utilization.is_some())
            .max_by(|a, b| a.utilization.unwrap().total_cmp(&b.utilization.unwrap()))
            .copied()
            .unwrap_or(pressure);
        self.governing_cpt_id = critical.governing_cpt_id;
        self.governing_frd_kn = critical.governing_frd_kn;
        self.missing_cpt_ids = checks
            .iter()
            .flat_map(|a| a.missing_cpt_ids.iter().copied())
            .collect();
    }
}
fn assess_direction(
    demand: &crate::TensionDemand,
    direction: crate::ResistanceDirection,
    cpts: &[SelectedCpt],
    advice: &FoundationAdviceIndex<'_>,
    key: &PileConfigurationKey,
    pile_count: u32,
) -> DirectionAssessment {
    let matches = cpts
        .iter()
        .map(|c| (c.cpt.id, advice.capacity(c.cpt.id, direction, key, pile_count)))
        .collect::<Vec<_>>();
    let governing = matches
        .iter()
        .filter_map(|(_, r)| *r)
        .min_by(|a, b| a.frd_kn.total_cmp(&b.frd_kn));
    let mut assessment = DirectionAssessment {
        cpt_resistances: matches.iter().map(|(id,value)|CptResistanceFact{cpt_id:*id,frd_kn:value.map(|v|v.frd_kn)}).collect(),
        demand_kn: None,
        governing_cpt_id: governing.map(|r| r.cpt_id),
        governing_frd_kn: governing.map(|r| r.frd_kn),
        utilization: None,
        missing_cpt_ids: vec![],
        status: DirectionStatus::NotAssessed,
    };
    let value = match demand {
        crate::TensionDemand::NotImported => return assessment,
        crate::TensionDemand::Missing => {
            assessment.status = DirectionStatus::MissingDemand;
            return assessment;
        }
        crate::TensionDemand::Known { value_kn } => *value_kn,
    };
    if !value.is_finite() || value < 0. {
        assessment.status = DirectionStatus::MissingDemand;
        return assessment;
    }
    assessment.demand_kn = Some(value);
    if value == 0. {
        assessment.status = DirectionStatus::NoLoad;
        assessment.utilization = Some(0.);
        return assessment;
    }
    assessment.missing_cpt_ids = matches
        .iter()
        .filter_map(|(id, r)| r.is_none().then_some(*id))
        .collect();
    assessment.utilization = assessment
        .governing_frd_kn
        .filter(|r| r.is_finite() && *r > 0.)
        .map(|r| value / r)
        .filter(|r| r.is_finite());
    assessment.status = if !assessment.missing_cpt_ids.is_empty() || governing.is_none() {
        DirectionStatus::MissingCapacityData
    } else if assessment.utilization.is_some_and(|u| u <= 1.) {
        DirectionStatus::Valid
    } else {
        DirectionStatus::InsufficientCapacity
    };
    assessment
}

pub(crate) fn choose_default_pile_option<'a>(
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
            let cost = |option: &PileConfigurationOption| {
                calculate_pile_cost(
                    option.pile_size_mm,
                    option.pile_tip_level_m,
                    pile_head_level_m,
                    settings,
                )
            };
            match (cost(left), cost(right)) {
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
    groups: &[crate::load_point_groups::LoadPointGroup],
    pile_head_level_m: f64,
    settings: &PileCostSettings,
) -> HashMap<u32, PileConfigurationKey> {
    let Ok(assessment) = crate::assess_technical_assignment(groups, options_by_load_point) else {
        return HashMap::new();
    };
    if assessment.availability != crate::TechnicalAssignmentAvailability::Available {
        return HashMap::new();
    }
    let invalid_ids = assessment
        .issues
        .iter()
        .map(|issue| issue.load_point_id)
        .collect::<HashSet<_>>();
    let mut choices = HashMap::new();
    for group in groups {
        if group
            .load_point_ids
            .iter()
            .any(|id| invalid_ids.contains(id))
        {
            continue;
        }
        let Some(first_id) = group.load_point_ids.first() else {
            continue;
        };
        let Some(first_options) = options_by_load_point.get(first_id) else {
            continue;
        };
        let member_options = group
            .load_point_ids
            .iter()
            .filter_map(|id| {
                options_by_load_point
                    .get(id)
                    .cloned()
                    .map(|options| (*id, options))
            })
            .collect::<HashMap<_, _>>();
        let valid = crate::aggregate_pile_options_for_load_points(&member_options)
            .into_iter()
            .filter(|candidate| candidate.status == crate::AggregatedPileConfigurationStatus::Valid)
            .map(|candidate| candidate.configuration)
            .collect::<HashSet<_>>();
        let common = first_options
            .iter()
            .filter(|candidate| valid.contains(&candidate.configuration))
            .cloned()
            .collect::<Vec<_>>();
        let Some(choice) = choose_default_pile_option(&common, pile_head_level_m, settings) else {
            continue;
        };
        for id in &group.load_point_ids {
            choices.insert(*id, choice.configuration.clone());
        }
    }
    choices
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        source_data::{BearingCapacity, Cpt},
        LoadPointGroup, PileCostSettingsItem, PileCostShape,
    };

    fn selected(id: u32) -> SelectedCpt {
        SelectedCpt {
            label: "nearest".into(),
            quadrant: None,
            cpt: Cpt {
                id,
                name: format!("CPT {id}"),
                x_mm: 0.0,
                y_mm: 0.0,
            },
            distance_mm: 0.0,
        }
    }

    fn row(cpt_id: u32, tip: f64, size: u32, frd: f64) -> BearingCapacity {
        BearingCapacity {
                pile_count: None,
                missing: false,
            cpt_id,
            pile_tip_level_m: tip,
            pile_size_mm: size,
            frd_kn: frd,
            direction: Default::default(),
        }
    }

    fn costs() -> PileCostSettings {
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
            ],
        }
    }

    #[test]
    fn calculates_governing_capacity_utilization_and_missing_data() {
        let rows = vec![
            row(11, -18.0, 320, 700.0),
            row(12, -18.0, 320, 650.0),
            row(11, -19.0, 320, 800.0),
        ];
        let advice = FoundationAdviceIndex::new(&rows).unwrap();
        let options = pile_configuration_options(600.0, &[selected(11), selected(12)], &advice);

        assert_eq!(options[0].governing_cpt_id, Some(12));
        assert_eq!(options[0].governing_frd_kn, Some(650.0));
        assert!(options[0].is_option);
        assert_eq!(options[1].missing_cpt_ids, vec![12]);
        assert_eq!(
            options[1].technical_status,
            PileOptionTechnicalStatus::MissingCapacityData
        );
    }

    #[test]
    fn nonpositive_capacity_is_insufficient_without_a_utilization_ratio() {
        for capacity in [-100.0, 0.0] {
            for load in [600.0] {
                let rows = vec![row(11, -18.0, 320, 700.0), row(12, -18.0, 320, capacity)];
                let advice = FoundationAdviceIndex::new(&rows).unwrap();
                let options =
                    pile_configuration_options(load, &[selected(11), selected(12)], &advice);
                let option = &options[0];
                assert!(!option.is_option, "capacity {capacity}, load {load}");
                assert_eq!(option.utilization, None);
                assert_eq!(option.governing_cpt_id, Some(12));
                assert_eq!(option.governing_frd_kn, Some(capacity));
                assert!(option.missing_cpt_ids.is_empty());
                assert_eq!(
                    option.technical_status,
                    PileOptionTechnicalStatus::InsufficientCapacity
                );

                let incomplete =
                    pile_configuration_options(load, &[selected(12), selected(13)], &advice);
                assert_eq!(
                    incomplete[0].technical_status,
                    PileOptionTechnicalStatus::MissingCapacityData
                );
                assert_eq!(incomplete[0].missing_cpt_ids, vec![13]);
            }
        }
    }

    #[test]
    fn optimizer_candidates_exclude_cheaper_nonpositive_capacity() {
        for capacity in [-100.0, 0.0] {
            let rows = vec![row(11, -18.0, 290, capacity), row(11, -18.0, 320, 700.0)];
            let advice = FoundationAdviceIndex::new(&rows).unwrap();
            let options = pile_configuration_options(600.0, &[selected(11)], &advice);
            let result = crate::prepare_optimization_units(&crate::PrepareOptimizationUnitsInput {
                groups: vec![LoadPointGroup {
                    load_point_ids: vec![1, 2],
                    origin: crate::LoadPointGroupOrigin::Automatic,
                }],
                options_by_load_point: HashMap::from([(1, options.clone()), (2, options.clone())]),
                current_assignments: HashMap::new(),
                locked_load_point_ids: vec![],
                pile_head_level_m: Some(-3.5),
                cost_settings: costs(),
                candidate_settings: crate::OptimizationCandidateSettings {
                    max_utilization: 1.0,
                    enabled_configurations: options
                        .iter()
                        .map(|o| o.configuration.clone())
                        .collect(),
                },
            });
            assert!(result.diagnostics.is_empty());
            assert_eq!(result.units.len(), 1);
            assert_eq!(result.units[0].options.len(), 1);
            assert_eq!(result.units[0].options[0].configuration.pile_size_mm, 320);
            assert_eq!(
                choose_default_pile_option(&options, -3.5, &costs())
                    .unwrap()
                    .pile_size_mm,
                320
            );
        }
    }

    #[test]
    fn advice_rejects_submillimetre_tip_levels() {
        assert!(FoundationAdviceIndex::new(&[row(11, -18.5004, 320, 700.0)]).is_err());
    }

    #[test]
    fn chooses_the_cheapest_valid_option() {
        let rows = vec![row(11, -18.0, 290, 700.0), row(11, -18.0, 320, 700.0)];
        let advice = FoundationAdviceIndex::new(&rows).unwrap();
        let options = pile_configuration_options(600.0, &[selected(11)], &advice);
        assert_eq!(
            choose_default_pile_option(&options, -3.5, &costs())
                .unwrap()
                .pile_size_mm,
            290
        );
    }

    #[test]
    fn grouped_defaults_assign_one_common_configuration_to_every_member() {
        let rows = vec![row(11, -18.0, 320, 700.0)];
        let advice = FoundationAdviceIndex::new(&rows).unwrap();
        let options = pile_configuration_options(600.0, &[selected(11)], &advice);
        let options_by_load_point = HashMap::from([(1, options.clone()), (2, options)]);
        let choices = choose_default_pile_options(
            &options_by_load_point,
            &[LoadPointGroup {
                load_point_ids: vec![1, 2],
                origin: crate::LoadPointGroupOrigin::Automatic,
            }],
            -3.5,
            &costs(),
        );
        assert_eq!(choices[&1], choices[&2]);
    }
}
