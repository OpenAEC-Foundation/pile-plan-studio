use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::{PileConfigurationKey, PileConfigurationOption};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AggregatedPileConfiguration {
    pub configuration: PileConfigurationKey,
    pub pile_tip_level_m: f64,
    pub status: AggregatedPileConfigurationStatus,
    pub missing_load_point_ids: Vec<u32>,
    pub invalid_load_point_ids: Vec<u32>,
    pub maximum_utilization: Option<f64>,
    pub critical_load_point_id: Option<u32>,
    pub critical_governing_cpt_id: Option<u32>,
    pub critical_governing_frd_kn: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AggregatedPileConfigurationStatus {
    Valid,
    Invalid,
    Missing,
}

pub fn aggregate_pile_options_for_load_points(
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> Vec<AggregatedPileConfiguration> {
    let mut load_point_ids = options_by_load_point.keys().copied().collect::<Vec<_>>();
    load_point_ids.sort_unstable();

    let indexed = options_by_load_point
        .iter()
        .map(|(load_point_id, options)| {
            let mut by_configuration =
                HashMap::<PileConfigurationKey, Vec<&PileConfigurationOption>>::new();
            for option in options {
                by_configuration
                    .entry(option.configuration.clone())
                    .or_default()
                    .push(option);
            }
            (*load_point_id, by_configuration)
        })
        .collect::<HashMap<_, _>>();
    let mut configurations = indexed
        .values()
        .flat_map(HashMap::keys)
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    configurations.sort_by(|left, right| {
        left.pile_size_mm
            .cmp(&right.pile_size_mm)
            .then_with(|| right.pile_tip_level_mm.cmp(&left.pile_tip_level_mm))
    });

    configurations
        .into_iter()
        .map(|configuration| {
            let mut missing_load_point_ids = Vec::new();
            let mut invalid_load_point_ids = Vec::new();
            let mut critical: Option<(f64, u32, &PileConfigurationOption)> = None;

            for load_point_id in &load_point_ids {
                let matching = indexed
                    .get(load_point_id)
                    .and_then(|options| options.get(&configuration));
                let Some(matching) = matching else {
                    missing_load_point_ids.push(*load_point_id);
                    continue;
                };

                if matching
                    .iter()
                    .any(|option| !option.missing_cpt_ids.is_empty())
                {
                    missing_load_point_ids.push(*load_point_id);
                } else if matching.iter().any(|option| !option.is_option) {
                    invalid_load_point_ids.push(*load_point_id);
                }

                for option in matching {
                    let Some(utilization) = option.utilization else {
                        continue;
                    };
                    let replace = critical.as_ref().is_none_or(
                        |(current_utilization, current_load_point_id, current_option)| {
                            utilization > *current_utilization
                                || (utilization == *current_utilization
                                    && (*load_point_id < *current_load_point_id
                                        || (*load_point_id == *current_load_point_id
                                            && option.governing_cpt_id
                                                < current_option.governing_cpt_id)))
                        },
                    );
                    if replace {
                        critical = Some((utilization, *load_point_id, option));
                    }
                }
            }

            let status = if !missing_load_point_ids.is_empty() {
                AggregatedPileConfigurationStatus::Missing
            } else if !invalid_load_point_ids.is_empty() {
                AggregatedPileConfigurationStatus::Invalid
            } else {
                AggregatedPileConfigurationStatus::Valid
            };
            let (maximum_utilization, critical_load_point_id, critical_option) = critical
                .map(|(utilization, load_point_id, option)| {
                    (Some(utilization), Some(load_point_id), Some(option))
                })
                .unwrap_or((None, None, None));

            AggregatedPileConfiguration {
                pile_tip_level_m: configuration.pile_tip_level_m(),
                configuration,
                status,
                missing_load_point_ids,
                invalid_load_point_ids,
                maximum_utilization,
                critical_load_point_id,
                critical_governing_cpt_id: critical_option
                    .and_then(|option| option.governing_cpt_id),
                critical_governing_frd_kn: critical_option
                    .and_then(|option| option.governing_frd_kn),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{PileConfigurationKey, PileConfigurationOption};

    use super::{aggregate_pile_options_for_load_points, AggregatedPileConfigurationStatus};

    fn option(
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
        is_option: bool,
        utilization: Option<f64>,
        governing_cpt_id: Option<u32>,
        governing_frd_kn: Option<f64>,
    ) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: PileConfigurationKey {
                pile_size_mm,
                pile_tip_level_mm,
            },
            pile_size_mm,
            pile_tip_level_m: pile_tip_level_mm as f64 / 1000.0,
            is_option,
            governing_cpt_id,
            governing_frd_kn,
            utilization,
            missing_cpt_ids: Vec::new(),
        }
    }

    #[test]
    fn aggregate_reports_the_maximum_utilization_and_critical_load_point() {
        let result = aggregate_pile_options_for_load_points(&HashMap::from([
            (
                7,
                vec![option(
                    320,
                    -18_500,
                    true,
                    Some(0.71),
                    Some(61),
                    Some(700.0),
                )],
            ),
            (
                3,
                vec![option(
                    320,
                    -18_500,
                    true,
                    Some(0.90),
                    Some(64),
                    Some(1000.0),
                )],
            ),
        ]));

        assert_eq!(result[0].maximum_utilization, Some(0.90));
        assert_eq!(result[0].critical_load_point_id, Some(3));
        assert_eq!(result[0].critical_governing_cpt_id, Some(64));
        assert_eq!(result[0].critical_governing_frd_kn, Some(1000.0));
    }

    #[test]
    fn aggregate_breaks_equal_utilization_by_lower_load_point_id() {
        let result = aggregate_pile_options_for_load_points(&HashMap::from([
            (
                8,
                vec![option(320, -18_500, true, Some(0.8), Some(68), Some(800.0))],
            ),
            (
                2,
                vec![option(320, -18_500, true, Some(0.8), Some(62), Some(820.0))],
            ),
        ]));

        assert_eq!(result[0].critical_load_point_id, Some(2));
        assert_eq!(result[0].critical_governing_cpt_id, Some(62));
    }

    #[test]
    fn missing_configuration_has_priority_over_invalid_configuration() {
        let result = aggregate_pile_options_for_load_points(&HashMap::from([
            (
                1,
                vec![option(
                    320,
                    -18_500,
                    false,
                    Some(1.1),
                    Some(61),
                    Some(600.0),
                )],
            ),
            (2, vec![]),
        ]));

        assert_eq!(result[0].status, AggregatedPileConfigurationStatus::Missing);
        assert_eq!(result[0].missing_load_point_ids, vec![2]);
        assert_eq!(result[0].invalid_load_point_ids, vec![1]);
    }

    #[test]
    fn missing_cpt_capacity_marks_the_load_point_missing() {
        let mut missing_capacity = option(320, -18_500, false, None, None, None);
        missing_capacity.missing_cpt_ids = vec![4];

        let result = aggregate_pile_options_for_load_points(&HashMap::from([
            (1, vec![missing_capacity]),
            (
                2,
                vec![option(320, -18_500, true, Some(0.7), Some(61), Some(700.0))],
            ),
        ]));

        assert_eq!(result[0].status, AggregatedPileConfigurationStatus::Missing);
        assert_eq!(result[0].missing_load_point_ids, vec![1]);
        assert!(result[0].invalid_load_point_ids.is_empty());
    }

    #[test]
    fn singleton_aggregate_preserves_individual_option_facts() {
        let result = aggregate_pile_options_for_load_points(&HashMap::from([(
            9,
            vec![option(
                290,
                -17_750,
                true,
                Some(0.75),
                Some(63),
                Some(640.0),
            )],
        )]));

        assert_eq!(result[0].configuration.pile_size_mm, 290);
        assert_eq!(result[0].pile_tip_level_m, -17.75);
        assert_eq!(result[0].status, AggregatedPileConfigurationStatus::Valid);
        assert_eq!(result[0].critical_load_point_id, Some(9));
    }

    #[test]
    fn output_is_stable_and_sorted_for_shuffled_input() {
        let first = aggregate_pile_options_for_load_points(&HashMap::from([
            (
                2,
                vec![
                    option(320, -19_000, true, Some(0.7), Some(2), Some(700.0)),
                    option(290, -18_000, true, Some(0.6), Some(2), Some(800.0)),
                ],
            ),
            (
                1,
                vec![
                    option(290, -18_000, true, Some(0.5), Some(1), Some(900.0)),
                    option(320, -19_000, true, Some(0.8), Some(1), Some(650.0)),
                ],
            ),
        ]));
        let second = aggregate_pile_options_for_load_points(&HashMap::from([
            (
                1,
                vec![
                    option(320, -19_000, true, Some(0.8), Some(1), Some(650.0)),
                    option(290, -18_000, true, Some(0.5), Some(1), Some(900.0)),
                ],
            ),
            (
                2,
                vec![
                    option(290, -18_000, true, Some(0.6), Some(2), Some(800.0)),
                    option(320, -19_000, true, Some(0.7), Some(2), Some(700.0)),
                ],
            ),
        ]));

        assert_eq!(first, second);
        assert_eq!(
            first
                .iter()
                .map(|item| item.configuration.pile_size_mm)
                .collect::<Vec<_>>(),
            vec![290, 320]
        );
    }
}
