use super::neighborhood;
use super::{column_key, PileDrivingMatch, PileDrivingRecord};
use crate::import::{parse_finite_number, parse_nonnegative_u32};
use crate::PileConfigurationKey;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

const INCREMENT_MM: f64 = 250.0;
const NUMERIC_NOISE: f64 = 1.0e-6;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub(super) struct CheckSettings {
    minimum_end_blows: u32,
    end_window_increments: u32,
    maximum_end_drop: u32,
    length_tolerance_mm: f64,
    level_tolerance_mm: f64,
    pub(super) neighborhood_tolerance_pct: f64,
    pub(super) peer_energy_spread_kj: f64,
    target_energy_tolerance_kj: f64,
    expected_energy: Vec<ExpectedEnergy>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct ExpectedEnergy {
    pile_size_mm: u32,
    energy_kj: f64,
}

impl Default for CheckSettings {
    fn default() -> Self {
        Self {
            minimum_end_blows: 15,
            end_window_increments: 6,
            maximum_end_drop: 0,
            length_tolerance_mm: 0.0,
            level_tolerance_mm: 0.0,
            neighborhood_tolerance_pct: 10.0,
            peer_energy_spread_kj: 0.0,
            target_energy_tolerance_kj: 0.0,
            expected_energy: Vec::new(),
        }
    }
}

impl CheckSettings {
    pub(super) fn valid(&self) -> bool {
        let tolerances = [
            self.length_tolerance_mm,
            self.level_tolerance_mm,
            self.neighborhood_tolerance_pct,
            self.peer_energy_spread_kj,
            self.target_energy_tolerance_kj,
        ];
        let mut sizes = HashSet::new();
        self.end_window_increments >= 2
            && self.end_window_increments % 2 == 0
            && tolerances
                .into_iter()
                .all(|value| value.is_finite() && value >= 0.0)
            && self.expected_energy.iter().all(|target| {
                target.pile_size_mm > 0
                    && sizes.insert(target.pile_size_mm)
                    && target.energy_kj.is_finite()
                    && target.energy_kj > 0.0
            })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum CheckKind {
    Size,
    Length,
    Level,
    EndCalendar,
    Trend,
    EnergyTarget,
    Neighborhood,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum CheckStatus {
    Ok,
    Warning,
    Unavailable,
}

#[derive(Debug, Serialize)]
pub(super) struct Check {
    pub(super) kind: CheckKind,
    pub(super) status: CheckStatus,
    pub(super) actual: Option<f64>,
    pub(super) other: Option<f64>,
    pub(super) reference: Option<f64>,
    pub(super) tolerance: Option<f64>,
}

impl Check {
    fn compare(
        kind: CheckKind,
        actual: Option<f64>,
        reference: Option<f64>,
        tolerance: f64,
    ) -> Self {
        let status = match (actual, reference) {
            (Some(actual), Some(reference)) if exceeds((actual - reference).abs(), tolerance) => {
                CheckStatus::Warning
            }
            (Some(_), Some(_)) => CheckStatus::Ok,
            _ => CheckStatus::Unavailable,
        };
        Self {
            kind,
            status,
            actual,
            other: None,
            reference,
            tolerance: Some(tolerance),
        }
    }
}

pub(super) struct CheckColumns {
    positions: HashMap<String, Option<usize>>,
}

impl CheckColumns {
    pub(super) fn new(columns: &[String]) -> Self {
        let mut positions = HashMap::new();
        for (index, column) in columns.iter().enumerate() {
            // A repeated heading makes the affected measurement ambiguous.
            positions
                .entry(column_key(column))
                .and_modify(|position| *position = None)
                .or_insert(Some(index));
        }
        Self { positions }
    }

    fn cell<'a>(&self, row: &'a [String], field: &str) -> Option<&'a str> {
        row.get(self.positions.get(field).copied().flatten()?)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
    }

    fn number(&self, row: &[String], field: &str) -> Option<f64> {
        parse_finite_number(&self.cell(row, field)?.replace(',', ".")).ok()
    }
}

#[derive(Clone, Copy)]
struct Increment {
    number: u32,
    level: Option<f64>,
    blows: Option<u32>,
    step_mm: Option<f64>,
    energy_kj: Option<f64>,
}

fn ordered_increments(columns: &CheckColumns, rows: &[Vec<String>]) -> Option<Vec<Increment>> {
    let mut increments: Vec<_> = rows
        .iter()
        .map(|row| {
            Some(Increment {
                number: parse_nonnegative_u32(columns.cell(row, "tochtnummer")?)
                    .ok()
                    .filter(|n| *n > 0)?,
                level: columns.number(row, "ppnnap"),
                blows: columns
                    .cell(row, "slagen")
                    .and_then(|value| parse_nonnegative_u32(value).ok()),
                step_mm: columns.number(row, "mmzakkingpertocht"),
                energy_kj: energy_kj(columns, row),
            })
        })
        .collect::<Option<_>>()?;
    increments.sort_unstable_by_key(|increment| increment.number);
    if increments
        .windows(2)
        .any(|pair| pair[0].number == pair[1].number)
    {
        return None;
    }
    Some(increments)
}

fn energy_kj(columns: &CheckColumns, row: &[String]) -> Option<f64> {
    columns
        .number(row, "energieperslagkj")
        .filter(|value| *value >= 0.0)
}

fn exceeds(difference: f64, tolerance: f64) -> bool {
    difference - tolerance > NUMERIC_NOISE
}

fn full_increment(previous: Option<Increment>, current: Increment) -> bool {
    if !current
        .step_mm
        .is_some_and(|step| !exceeds((step - INCREMENT_MM).abs(), 0.0))
    {
        return false;
    }
    let previous = previous.filter(|previous| current.number - previous.number == 1);
    match (previous.and_then(|previous| previous.level), current.level) {
        (Some(before), Some(after)) => {
            !exceeds(((before - after) * 1000.0 - INCREMENT_MM).abs(), 0.0)
        }
        _ => true,
    }
}

fn full_end_window(increments: &[Increment], window_size: usize) -> Option<&[Increment]> {
    let start = increments.len().checked_sub(window_size)?;
    let window = &increments[start..];
    let before = start.checked_sub(1).map(|index| increments[index]);
    (full_increment(before, *window.first()?)
        && window.windows(2).all(|pair| {
            pair[1].number - pair[0].number == 1 && full_increment(Some(pair[0]), pair[1])
        }))
    .then_some(window)
}

fn trend_check(increments: &[Increment], settings: &CheckSettings) -> Check {
    let window_size = settings.end_window_increments;
    let half = window_size / 2;
    let totals = full_end_window(increments, window_size as usize).and_then(|window| {
        let (first, last) = window.split_at(half as usize);
        let sum_blows = |part: &[Increment]| {
            part.iter()
                .map(|increment| increment.blows.map(u64::from))
                .sum::<Option<u64>>()
        };
        sum_blows(first).zip(sum_blows(last))
    });
    // The halves have the same length, so their totals give an exact tolerance comparison.
    let allowed_drop = u64::from(settings.maximum_end_drop) * u64::from(half);
    Check {
        kind: CheckKind::Trend,
        status: match totals {
            Some((first, last)) if first.saturating_sub(last) > allowed_drop => {
                CheckStatus::Warning
            }
            Some(_) => CheckStatus::Ok,
            None => CheckStatus::Unavailable,
        },
        actual: totals.map(|(first, _)| first as f64 / f64::from(half)),
        other: totals.map(|(_, last)| last as f64 / f64::from(half)),
        reference: Some(f64::from(window_size)),
        tolerance: Some(f64::from(settings.maximum_end_drop)),
    }
}

fn consistent_dimension_mm(
    columns: &CheckColumns,
    rows: &[Vec<String>],
    field: &str,
) -> Option<f64> {
    let mut values = rows.iter().filter(|row| columns.cell(row, field).is_some());
    let measured = columns.number(values.next()?, field)? * 10.0;
    (measured.is_finite()
        && measured > 0.0
        && values.all(|row| {
            columns
                .number(row, field)
                .is_some_and(|value| !exceeds((value * 10.0 - measured).abs(), 0.0))
        }))
    .then_some(measured)
}

fn energy_target_check(values: &[f64], complete: bool, target: f64, tolerance: f64) -> Check {
    let status = if values
        .iter()
        .any(|energy| exceeds((energy - target).abs(), tolerance))
    {
        CheckStatus::Warning
    } else if complete && !values.is_empty() {
        CheckStatus::Ok
    } else {
        CheckStatus::Unavailable
    };
    Check {
        kind: CheckKind::EnergyTarget,
        status,
        actual: values.iter().copied().reduce(f64::min),
        other: values.iter().copied().reduce(f64::max),
        reference: Some(target),
        tolerance: Some(tolerance),
    }
}

pub(super) struct Assessment {
    pub checks: Vec<Check>,
    pub energy_range: Option<EnergyRange>,
    pub neighborhood_reading: Option<neighborhood::Reading>,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub(super) struct EnergyRange {
    minimum_kj: f64,
    maximum_kj: f64,
}

impl EnergyRange {
    fn merge(self, other: Self) -> Self {
        Self {
            minimum_kj: self.minimum_kj.min(other.minimum_kj),
            maximum_kj: self.maximum_kj.max(other.maximum_kj),
        }
    }
}

#[derive(Debug, Serialize)]
pub(super) struct EnergyGroup {
    pile_size_mm: f64,
    pile_count: usize,
    minimum_kj: f64,
    maximum_kj: f64,
    spread_kj: Option<f64>,
    status: CheckStatus,
}

#[derive(PartialEq, Eq, Hash)]
enum PileIdentity<'a> {
    Location(u32),
    Source([&'a str; 4]),
}

pub(super) fn energy_by_size<'a>(
    files: impl IntoIterator<Item = (&'a [String], &'a [PileDrivingRecord])>,
    limit: f64,
) -> Vec<EnergyGroup> {
    let mut sources = Vec::new();
    let mut aliases = HashMap::new();
    for (headings, records) in files {
        let columns = CheckColumns::new(headings);
        for record in records {
            let row = &record.rows[0];
            let source = [
                columns.cell(row, "projectnummer").unwrap_or_default(),
                columns.cell(row, "bloknummer").unwrap_or_default(),
                columns.cell(row, "kavelnummer").unwrap_or_default(),
                record.pile_number.as_str(),
            ];
            if let PileDrivingMatch::Matched { load_point_id } = record.matching {
                aliases
                    .entry(source)
                    .and_modify(|known| {
                        if *known != Some(load_point_id) {
                            *known = None;
                        }
                    })
                    .or_insert(Some(load_point_id));
            }
            sources.push((source, record));
        }
    }
    let mut piles = HashMap::<_, Vec<_>>::new();
    for (source, record) in sources {
        let size = record
            .checks
            .iter()
            .find(|check| check.kind == CheckKind::Size)
            .and_then(|check| check.actual);
        let Some(size) = size else { continue };
        let identity = match record.matching {
            PileDrivingMatch::Matched { load_point_id } => PileIdentity::Location(load_point_id),
            _ => match aliases.get(&source) {
                Some(Some(id)) => PileIdentity::Location(*id),
                Some(None) => continue,
                None => PileIdentity::Source(source),
            },
        };
        piles
            .entry(identity)
            .or_default()
            .push((size, record.energy_range));
    }
    let mut groups = BTreeMap::<u64, Vec<EnergyRange>>::new();
    for registrations in piles.into_values() {
        let size = registrations[0].0;
        if registrations.iter().any(|&(recorded, _)| recorded != size) {
            continue;
        }
        let range = registrations
            .into_iter()
            .filter_map(|(_, energy)| energy)
            .reduce(EnergyRange::merge);
        if let Some(range) = range {
            groups.entry(size.to_bits()).or_default().push(range);
        }
    }
    groups
        .into_iter()
        .map(|(size, ranges)| {
            let (minimum_index, lowest) = ranges
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| a.minimum_kj.total_cmp(&b.minimum_kj))
                .unwrap();
            let (maximum_index, highest) = ranges
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.maximum_kj.total_cmp(&b.maximum_kj))
                .unwrap();
            let spread_kj = if minimum_index != maximum_index {
                Some(highest.maximum_kj - lowest.minimum_kj)
            } else {
                // Both extrema came from one pile. Pair each one with a different pile.
                ranges
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| *index != minimum_index)
                    .map(|(_, other)| {
                        (highest.maximum_kj - other.minimum_kj)
                            .max(other.maximum_kj - lowest.minimum_kj)
                    })
                    .reduce(f64::max)
            };
            EnergyGroup {
                pile_size_mm: f64::from_bits(size),
                pile_count: ranges.len(),
                minimum_kj: lowest.minimum_kj,
                maximum_kj: highest.maximum_kj,
                spread_kj,
                status: match spread_kj {
                    Some(spread) if exceeds(spread, limit) => CheckStatus::Warning,
                    Some(_) => CheckStatus::Ok,
                    None => CheckStatus::Unavailable,
                },
            }
        })
        .collect()
}

pub(super) fn assess(
    columns: &CheckColumns,
    rows: &[Vec<String>],
    configuration: Option<&PileConfigurationKey>,
    head_m: Option<f64>,
    settings: &CheckSettings,
) -> Assessment {
    let size = consistent_dimension_mm(columns, rows, "diktecm");
    let length = consistent_dimension_mm(columns, rows, "lengtecm");
    let plan_level = configuration.map(PileConfigurationKey::pile_tip_level_m);
    let plan_length = head_m
        .zip(plan_level)
        .map(|(head, tip)| (head - tip).abs() * 1000.0)
        .filter(|value| value.is_finite() && *value > 0.0);
    let increments = ordered_increments(columns, rows);
    let increments = increments.as_deref().unwrap_or_default();
    let last = increments.last().copied();
    let comparable_datum = rows
        .iter()
        .filter_map(|row| columns.cell(row, "referentieniveau"))
        .all(|datum| datum.eq_ignore_ascii_case("NAP"));
    let measured_level = last
        .filter(|_| comparable_datum)
        .and_then(|increment| increment.level);
    let neighborhood_reading = size
        .zip(full_end_window(increments, neighborhood::WINDOW_SIZE))
        .and_then(|(size_mm, window)| {
            let total_blows = window
                .iter()
                .map(|increment| increment.blows.map(u64::from))
                .sum::<Option<u64>>()?;
            let mean_energy_kj = window
                .iter()
                .map(|increment| {
                    increment
                        .energy_kj
                        .map(|energy| energy / neighborhood::WINDOW_SIZE as f64)
                })
                .sum::<Option<f64>>()
                .filter(|energy| energy.is_finite());
            Some(neighborhood::Reading {
                size_mm,
                total_blows,
                final_ppn_m: measured_level,
                mean_energy_kj,
            })
        });
    let previous = increments
        .len()
        .checked_sub(2)
        .map(|index| increments[index]);
    let end_blows = last
        .filter(|last| full_increment(previous, *last))
        .and_then(|last| last.blows);
    let target_energy = size.and_then(|size| {
        settings
            .expected_energy
            .iter()
            .find(|target| !exceeds((f64::from(target.pile_size_mm) - size).abs(), 0.0))
            .map(|target| target.energy_kj)
    });
    let energies: Vec<_> = rows
        .iter()
        .filter_map(|row| energy_kj(columns, row))
        .collect();

    let mut checks = vec![
        Check::compare(
            CheckKind::Size,
            size,
            configuration.map(|pile| f64::from(pile.pile_size_mm)),
            0.0,
        ),
        Check::compare(
            CheckKind::Length,
            length,
            plan_length,
            settings.length_tolerance_mm,
        ),
        Check::compare(
            CheckKind::Level,
            measured_level,
            plan_level,
            settings.level_tolerance_mm / 1000.0,
        ),
        Check {
            kind: CheckKind::EndCalendar,
            status: match end_blows {
                Some(blows) if blows < settings.minimum_end_blows => CheckStatus::Warning,
                Some(_) => CheckStatus::Ok,
                None => CheckStatus::Unavailable,
            },
            actual: end_blows.map(f64::from),
            other: None,
            reference: Some(f64::from(settings.minimum_end_blows)),
            tolerance: None,
        },
        trend_check(increments, settings),
    ];
    let energy_range = if let Some(target) = target_energy {
        checks.push(energy_target_check(
            &energies,
            energies.len() == rows.len(),
            target,
            settings.target_energy_tolerance_kj,
        ));
        None
    } else {
        energies
            .iter()
            .copied()
            .reduce(f64::min)
            .zip(energies.iter().copied().reduce(f64::max))
            .map(|(minimum_kj, maximum_kj)| EnergyRange {
                minimum_kj,
                maximum_kj,
            })
    };
    Assessment {
        checks,
        energy_range,
        neighborhood_reading,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str = "dikte_cm,lengte_cm,referentieniveau,tochtnummer,ppn_nap,slagen,energie_per_slag_kj,mm_zakking_per_tocht";

    fn assess_source(source: &str, settings: &CheckSettings) -> Vec<Check> {
        let rows = source
            .lines()
            .map(|row| row.split(',').map(str::to_owned).collect())
            .collect::<Vec<_>>();
        let columns = HEADER.split(',').map(str::to_owned).collect::<Vec<_>>();
        let plan = PileConfigurationKey {
            pile_size_mm: 290,
            pile_tip_level_mm: -17500,
        };
        assess(
            &CheckColumns::new(&columns),
            &rows,
            Some(&plan),
            Some(-3.5),
            settings,
        )
        .checks
    }

    #[test]
    fn reports_all_six_warnings_and_uses_final_increment_number() {
        let checks = assess_source(
            "32,1425,NAP,6,-17.25,12,42\n32,1425,NAP,2,-16.25,20,35\n32,1425,NAP,3,-16.50,18,35\n32,1425,NAP,4,-16.75,17,35\n32,1425,NAP,5,-17.00,15,35\n32,1425,NAP,1,-16.00,22,35"
                .lines().map(|line| format!("{line},250")).collect::<Vec<_>>().join("\n").as_str(),
            &CheckSettings {
                expected_energy: vec![ExpectedEnergy { pile_size_mm: 320, energy_kj: 35.0 }],
                ..Default::default()
            },
        );
        assert_eq!(checks.len(), 6);
        assert!(checks
            .iter()
            .all(|check| check.status == CheckStatus::Warning));
        assert_eq!(checks[2].actual, Some(-17.25));
        assert_eq!(checks[3].actual, Some(12.0));
        assert_eq!(
            (checks[4].actual, checks[4].other),
            (Some(20.0), Some(44.0 / 3.0))
        );
        assert_eq!(
            (checks[5].actual, checks[5].other),
            (Some(35.0), Some(42.0))
        );
    }

    const TREND_SOURCE: &str = "29,1400,NAP,1,-16.25,20,35,250\n29,1400,NAP,2,-16.50,23,35,250\n29,1400,NAP,3,-16.75,23,35,250\n29,1400,NAP,4,-17.00,17,35,250\n29,1400,NAP,5,-17.25,17,35,250\n29,1400,NAP,6,-17.50,20,35,250";

    #[test]
    fn compares_both_half_averages_and_accepts_a_drop_equal_to_the_tolerance() {
        for (tolerance, expected) in [(3, CheckStatus::Warning), (4, CheckStatus::Ok)] {
            let checks = assess_source(
                TREND_SOURCE,
                &CheckSettings {
                    maximum_end_drop: tolerance,
                    ..Default::default()
                },
            );
            let trend = &checks[4];
            assert_eq!((trend.actual, trend.other), (Some(22.0), Some(18.0)));
            assert_eq!(trend.status, expected);
        }
    }

    #[test]
    fn uses_the_configured_number_of_final_increments() {
        let settings: CheckSettings =
            serde_json::from_str(r#"{"end_window_increments":4,"maximum_end_drop":2}"#).unwrap();
        let checks = assess_source(TREND_SOURCE, &settings);
        assert_eq!(
            (checks[4].actual, checks[4].other),
            (Some(20.0), Some(18.5))
        );
        assert_eq!(checks[4].status, CheckStatus::Ok);
        assert_eq!(checks[4].reference, Some(4.0));

        let settings: CheckSettings =
            serde_json::from_str(r#"{"end_window_increments":8}"#).unwrap();
        let checks = assess_source(TREND_SOURCE, &settings);
        assert_eq!(checks[4].status, CheckStatus::Unavailable);
        assert_eq!(checks[4].reference, Some(8.0));
    }

    #[test]
    fn requires_an_even_window_with_at_least_two_increments() {
        for window in [0, 1, 3] {
            let settings: CheckSettings =
                serde_json::from_value(serde_json::json!({"end_window_increments": window}))
                    .unwrap();
            assert!(!settings.valid());
        }
    }

    #[test]
    fn does_not_reuse_an_earlier_value_when_the_final_measurement_is_missing() {
        let checks = assess_source(
            "29,1400,NAP,1,-17.25,21,35,250\n29,1400,NAP,2,,,,250",
            &CheckSettings::default(),
        );
        assert_eq!(checks[0].status, CheckStatus::Ok);
        assert_eq!(checks[1].status, CheckStatus::Ok);
        assert!(checks[2..]
            .iter()
            .all(|check| check.status == CheckStatus::Unavailable));
    }

    #[test]
    fn constant_energy_can_still_differ_from_the_configured_target() {
        let checks = assess_source(
            "29,1400,NAP,1,-16.25,15,35,250\n29,1400,NAP,2,-16.50,15,35,250\n29,1400,NAP,3,-16.75,15,35,250\n29,1400,NAP,4,-17.00,15,35,250\n29,1400,NAP,5,-17.25,15,35,250\n29,1400,NAP,6,-17.50,15,35,250",
            &CheckSettings {
                expected_energy: vec![ExpectedEnergy { pile_size_mm: 290, energy_kj: 40.0 }],
                target_energy_tolerance_kj: 1.0,
                ..Default::default()
            },
        );
        assert!(checks[..5]
            .iter()
            .all(|check| check.status == CheckStatus::Ok));
        assert_eq!(checks[5].status, CheckStatus::Warning);
        assert_eq!(checks[5].reference, Some(40.0));
    }

    #[test]
    fn does_not_treat_a_partial_final_increment_as_a_full_calendar() {
        let checks = assess_source(
            "29,1400,NAP,1,-17.00,21,35,250\n29,1400,NAP,2,-17.10,10,35,250",
            &CheckSettings::default(),
        );
        assert_eq!(checks[2].status, CheckStatus::Warning);
        assert_eq!(checks[3].status, CheckStatus::Unavailable);
    }

    #[test]
    fn conflicting_dimensions_and_a_different_level_datum_are_unavailable() {
        let checks = assess_source(
            "29,1400,PEIL,1,-17.25,20,35,250\n32,1425,PEIL,2,-17.50,20,35,250",
            &CheckSettings::default(),
        );
        assert!(checks[..3]
            .iter()
            .all(|check| check.status == CheckStatus::Unavailable));
        assert_eq!(checks[3].status, CheckStatus::Ok);
    }
}
