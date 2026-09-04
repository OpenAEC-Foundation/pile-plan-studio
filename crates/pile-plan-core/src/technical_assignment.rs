use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::{
    aggregate_pile_options_for_load_points, AggregatedPileConfigurationStatus, LoadPointGroup,
    PileConfigurationOption, PileOptionTechnicalStatus,
};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentAvailability {
    Available,
    NoPileConfigurations,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentIssueCause {
    NoValidOption,
    GroupMemberWithoutValidOption,
    NoCommonValidGroupConfiguration,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TechnicalAssignmentIssueStatus {
    MissingCapacityData,
    InsufficientCapacity,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentIssue {
    pub load_point_id: u32,
    pub cause: TechnicalAssignmentIssueCause,
    pub status: TechnicalAssignmentIssueStatus,
    pub group_load_point_ids: Vec<u32>,
    pub blocking_load_point_ids: Vec<u32>,
    pub missing_cpt_ids: Vec<u32>,
    pub has_missing_capacity_data: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentAssessment {
    pub availability: TechnicalAssignmentAvailability,
    pub issues: Vec<TechnicalAssignmentIssue>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TechnicalAssignmentAssessmentError {
    pub missing_load_point_ids: Vec<u32>,
}

pub fn assess_technical_assignment(
    groups: &[LoadPointGroup],
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> Result<TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError> {
    let mut normalized_groups = groups
        .iter()
        .filter_map(|group| {
            let mut load_point_ids = group.load_point_ids.clone();
            load_point_ids.sort_unstable();
            load_point_ids.dedup();
            (!load_point_ids.is_empty()).then_some(load_point_ids)
        })
        .collect::<Vec<_>>();
    normalized_groups.sort();

    let expected_load_point_ids = normalized_groups
        .iter()
        .flatten()
        .copied()
        .collect::<BTreeSet<_>>();
    let missing_load_point_ids = expected_load_point_ids
        .iter()
        .filter(|load_point_id| !options_by_load_point.contains_key(load_point_id))
        .copied()
        .collect::<Vec<_>>();
    if !missing_load_point_ids.is_empty() {
        return Err(TechnicalAssignmentAssessmentError {
            missing_load_point_ids,
        });
    }

    if normalized_groups.is_empty() {
        return Ok(TechnicalAssignmentAssessment {
            availability: TechnicalAssignmentAvailability::Available,
            issues: Vec::new(),
        });
    }

    let has_any_configuration = expected_load_point_ids.iter().any(|load_point_id| {
        options_by_load_point
            .get(load_point_id)
            .is_some_and(|options| !options.is_empty())
    });
    if !has_any_configuration {
        return Ok(TechnicalAssignmentAssessment {
            availability: TechnicalAssignmentAvailability::NoPileConfigurations,
            issues: Vec::new(),
        });
    }

    let mut issues = Vec::new();
    for group_load_point_ids in normalized_groups {
        let group_options = group_load_point_ids
            .iter()
            .map(|load_point_id| {
                (
                    *load_point_id,
                    options_by_load_point
                        .get(load_point_id)
                        .cloned()
                        .unwrap_or_default(),
                )
            })
            .collect::<HashMap<_, _>>();
        let aggregates = aggregate_pile_options_for_load_points(&group_options);
        if aggregates
            .iter()
            .any(|item| item.status == AggregatedPileConfigurationStatus::Valid)
        {
            continue;
        }

        let status = if aggregates.is_empty()
            || aggregates
                .iter()
                .all(|item| item.status == AggregatedPileConfigurationStatus::Missing)
        {
            TechnicalAssignmentIssueStatus::MissingCapacityData
        } else {
            TechnicalAssignmentIssueStatus::InsufficientCapacity
        };
        let has_missing_configuration = aggregates
            .iter()
            .any(|item| item.status == AggregatedPileConfigurationStatus::Missing);
        let missing_cpt_ids = aggregates
            .iter()
            .flat_map(|item| item.missing_cpt_ids.iter().copied())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let individually_invalid_ids = group_load_point_ids
            .iter()
            .filter(|load_point_id| {
                !group_options
                    .get(load_point_id)
                    .into_iter()
                    .flatten()
                    .any(|option| option.technical_status == PileOptionTechnicalStatus::Valid)
            })
            .copied()
            .collect::<Vec<_>>();
        let blocking_load_point_ids = if individually_invalid_ids.is_empty() {
            group_load_point_ids.clone()
        } else {
            individually_invalid_ids.clone()
        };

        for load_point_id in &group_load_point_ids {
            let cause = if individually_invalid_ids.is_empty() {
                TechnicalAssignmentIssueCause::NoCommonValidGroupConfiguration
            } else if individually_invalid_ids
                .binary_search(load_point_id)
                .is_ok()
            {
                TechnicalAssignmentIssueCause::NoValidOption
            } else {
                TechnicalAssignmentIssueCause::GroupMemberWithoutValidOption
            };
            issues.push(TechnicalAssignmentIssue {
                load_point_id: *load_point_id,
                cause,
                status,
                group_load_point_ids: group_load_point_ids.clone(),
                blocking_load_point_ids: blocking_load_point_ids.clone(),
                missing_cpt_ids: missing_cpt_ids.clone(),
                has_missing_capacity_data: status
                    == TechnicalAssignmentIssueStatus::InsufficientCapacity
                    && has_missing_configuration,
            });
        }
    }

    Ok(TechnicalAssignmentAssessment {
        availability: TechnicalAssignmentAvailability::Available,
        issues,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{
        pile_option_technical_status, LoadPointGroup, PileConfigurationKey, PileConfigurationOption,
    };

    use super::{
        assess_technical_assignment, TechnicalAssignmentAvailability,
        TechnicalAssignmentIssueCause, TechnicalAssignmentIssueStatus,
    };

    fn group(ids: &[u32]) -> LoadPointGroup {
        LoadPointGroup {
            load_point_ids: ids.to_vec(),
        }
    }

    fn option(
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
        is_option: bool,
        utilization: Option<f64>,
        missing_cpt_ids: &[u32],
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: PileConfigurationKey {
                pile_size_mm,
                pile_tip_level_mm,
            },
            pile_size_mm,
            pile_tip_level_m: pile_tip_level_mm as f64 / 1_000.0,
            is_option,
            governing_cpt_id: utilization.map(|_| 1),
            governing_frd_kn: utilization.map(|_| 1_000.0),
            utilization,
            missing_cpt_ids: missing_cpt_ids.to_vec(),
            technical_status: pile_option_technical_status(is_option, utilization, missing_cpt_ids),
        }
    }

    fn valid(size: u32, tip: i64) -> PileConfigurationOption {
        option(size, tip, true, Some(0.80), &[])
    }

    fn insufficient(size: u32, tip: i64) -> PileConfigurationOption {
        option(size, tip, false, Some(1.10), &[])
    }

    fn missing(size: u32, tip: i64, cpts: &[u32]) -> PileConfigurationOption {
        option(size, tip, false, Some(0.90), cpts)
    }

    #[test]
    fn common_valid_configuration_has_no_issues() {
        let assessment = assess_technical_assignment(
            &[group(&[2, 1])],
            &HashMap::from([
                (1, vec![valid(320, -18_000)]),
                (2, vec![valid(320, -18_000)]),
            ]),
        )
        .unwrap();

        assert_eq!(
            assessment.availability,
            TechnicalAssignmentAvailability::Available
        );
        assert!(assessment.issues.is_empty());
    }

    #[test]
    fn one_member_without_a_valid_option_marks_every_member_missing() {
        let assessment = assess_technical_assignment(
            &[group(&[1, 2])],
            &HashMap::from([
                (1, vec![valid(320, -18_000)]),
                (2, vec![missing(320, -18_000, &[62])]),
            ]),
        )
        .unwrap();

        assert_eq!(assessment.issues.len(), 2);
        assert!(assessment
            .issues
            .iter()
            .all(|issue| issue.status == TechnicalAssignmentIssueStatus::MissingCapacityData));
        assert_eq!(
            assessment.issues[0].cause,
            TechnicalAssignmentIssueCause::GroupMemberWithoutValidOption
        );
        assert_eq!(
            assessment.issues[1].cause,
            TechnicalAssignmentIssueCause::NoValidOption
        );
        assert_eq!(assessment.issues[0].group_load_point_ids, vec![1, 2]);
        assert_eq!(assessment.issues[0].blocking_load_point_ids, vec![2]);
        assert_eq!(assessment.issues[1].blocking_load_point_ids, vec![2]);
        assert_eq!(assessment.issues[0].missing_cpt_ids, vec![62]);
    }

    #[test]
    fn individually_valid_non_overlapping_options_are_missing() {
        let assessment = assess_technical_assignment(
            &[group(&[1, 2])],
            &HashMap::from([
                (1, vec![valid(290, -18_000)]),
                (2, vec![valid(320, -19_000)]),
            ]),
        )
        .unwrap();

        assert!(assessment.issues.iter().all(|issue| {
            issue.cause == TechnicalAssignmentIssueCause::NoCommonValidGroupConfiguration
                && issue.status == TechnicalAssignmentIssueStatus::MissingCapacityData
        }));
        assert_eq!(assessment.issues[0].blocking_load_point_ids, vec![1, 2]);
        assert!(assessment.issues[0].missing_cpt_ids.is_empty());
    }

    #[test]
    fn one_complete_insufficient_common_configuration_makes_a_mixed_group_red() {
        let assessment = assess_technical_assignment(
            &[group(&[1, 2])],
            &HashMap::from([
                (1, vec![valid(290, -18_000), missing(320, -19_000, &[62])]),
                (2, vec![insufficient(290, -18_000), valid(350, -20_000)]),
            ]),
        )
        .unwrap();

        assert!(assessment.issues.iter().all(|issue| {
            issue.cause == TechnicalAssignmentIssueCause::NoCommonValidGroupConfiguration
                && issue.status == TechnicalAssignmentIssueStatus::InsufficientCapacity
                && issue.has_missing_capacity_data
        }));
        assert_eq!(assessment.issues[0].missing_cpt_ids, vec![62]);
    }

    #[test]
    fn empty_global_configuration_set_is_unavailable_but_empty_project_is_available() {
        let unavailable =
            assess_technical_assignment(&[group(&[1])], &HashMap::from([(1, Vec::new())])).unwrap();
        assert_eq!(
            unavailable.availability,
            TechnicalAssignmentAvailability::NoPileConfigurations
        );
        assert!(unavailable.issues.is_empty());

        let empty = assess_technical_assignment(&[], &HashMap::new()).unwrap();
        assert_eq!(
            empty.availability,
            TechnicalAssignmentAvailability::Available
        );
        assert!(empty.issues.is_empty());
    }

    #[test]
    fn absent_expected_analysis_entry_is_a_contract_error() {
        let error =
            assess_technical_assignment(&[group(&[1, 2])], &HashMap::from([(1, Vec::new())]))
                .unwrap_err();

        assert_eq!(error.missing_load_point_ids, vec![2]);
    }
}
