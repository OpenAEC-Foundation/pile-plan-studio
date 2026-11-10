use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use super::{
    checks::{Check, CheckKind, CheckStatus},
    PileDrivingMatch, PileDrivingRecord, PileDrivingTarget,
};

pub(super) const WINDOW_SIZE: usize = 6;
const MINIMUM_PEERS: usize = 3;

#[derive(Clone, Copy, Debug)]
pub(super) struct Reading {
    pub size_mm: f64,
    pub total_blows: u64,
    pub final_ppn_m: Option<f64>,
    pub mean_energy_kj: Option<f64>,
}

impl Reading {
    fn merge_duplicate(mut self, other: Self) -> Option<Self> {
        if self.size_mm != other.size_mm || self.total_blows != other.total_blows {
            return None;
        }
        if self.final_ppn_m != other.final_ppn_m {
            self.final_ppn_m = None;
        }
        if self.mean_energy_kj != other.mean_energy_kj {
            self.mean_energy_kj = None;
        }
        Some(self)
    }
}

#[derive(Debug, Serialize)]
pub(super) struct Comparison {
    peer_count: usize,
    relaxed_selection: bool,
    final_ppn_m: Option<f64>,
    mean_energy_kj: Option<f64>,
    reference_piles: Vec<ReferencePile>,
}

#[derive(Debug, Serialize)]
struct ReferencePile {
    load_point_id: u32,
    mean_blows: f64,
    deviation_pct: f64,
    exceeds_tolerance: bool,
    final_ppn_m: Option<f64>,
    mean_energy_kj: Option<f64>,
}

struct Candidate<'a> {
    load_point_id: u32,
    reading: Reading,
    cpts: &'a [u32],
}

pub(super) fn apply(
    records: Vec<&mut PileDrivingRecord>,
    targets: &[PileDrivingTarget],
    tolerance_pct: f64,
) {
    let selections: HashMap<_, _> = targets
        .iter()
        .filter(|target| !target.selected_cpt_ids.is_empty())
        .map(|target| {
            let mut ids = target.selected_cpt_ids.clone();
            ids.sort_unstable();
            ids.dedup();
            (target.load_point_id, ids)
        })
        .collect();

    let mut by_location = BTreeMap::<_, Option<Reading>>::new();
    for record in &records {
        if let (PileDrivingMatch::Matched { load_point_id }, Some(reading)) =
            (&record.matching, record.neighborhood_reading)
        {
            by_location
                .entry(*load_point_id)
                .and_modify(|previous| {
                    *previous = previous.and_then(|value| value.merge_duplicate(reading));
                })
                .or_insert(Some(reading));
        }
    }
    let mut by_size = HashMap::<_, Vec<Candidate>>::new();
    for (id, reading) in by_location {
        if let (Some(reading), Some(cpts)) = (reading, selections.get(&id)) {
            by_size
                .entry(reading.size_mm.to_bits())
                .or_default()
                .push(Candidate {
                    load_point_id: id,
                    reading,
                    cpts,
                });
        }
    }

    for record in records {
        let mut check = Check {
            kind: CheckKind::Neighborhood,
            status: CheckStatus::Unavailable,
            actual: record
                .neighborhood_reading
                .map(|reading| mean(reading.total_blows as f64)),
            other: None,
            reference: None,
            tolerance: Some(tolerance_pct),
        };
        if let (PileDrivingMatch::Matched { load_point_id }, Some(reading)) =
            (&record.matching, record.neighborhood_reading)
        {
            if let Some(cpts) = selections.get(load_point_id) {
                let candidates = by_size
                    .get(&reading.size_mm.to_bits())
                    .map_or(&[][..], Vec::as_slice);
                record.neighborhood = Some(compare(
                    *load_point_id,
                    reading,
                    cpts,
                    candidates,
                    &mut check,
                ));
            }
        }
        record.checks.push(check);
    }
}

fn compare(
    load_point_id: u32,
    reading: Reading,
    cpts: &[u32],
    candidates: &[Candidate<'_>],
    check: &mut Check,
) -> Comparison {
    let others = candidates
        .iter()
        .filter(|candidate| candidate.load_point_id != load_point_id);
    let mut peers: Vec<_> = others
        .clone()
        .filter(|candidate| candidate.cpts == cpts)
        .collect();
    let exact_count = peers.len();
    if exact_count < MINIMUM_PEERS && cpts.len() > 1 {
        peers.extend(others.filter(|candidate| {
            candidate.cpts.len() == cpts.len()
                && cpts
                    .iter()
                    .filter(|id| candidate.cpts.binary_search(id).is_err())
                    .take(2)
                    .count()
                    == 1
        }));
    }
    let peer_count = peers.len();
    let mut result = Comparison {
        peer_count,
        relaxed_selection: peer_count > exact_count,
        final_ppn_m: reading.final_ppn_m,
        mean_energy_kj: reading.mean_energy_kj,
        reference_piles: Vec::new(),
    };
    if peer_count < MINIMUM_PEERS {
        return result;
    }

    let mut totals: Vec<_> = peers.iter().map(|peer| peer.reading.total_blows).collect();
    totals.sort_unstable();
    let median_total = (totals[(peer_count - 1) / 2] + totals[peer_count / 2]) as f64 / 2.0;
    check.reference = Some(mean(median_total));
    if median_total == 0.0 {
        return result;
    }
    let tolerance_pct = check.tolerance.unwrap_or_default();
    let (deviation_pct, exceeds_tolerance) =
        deviation(reading.total_blows, median_total, tolerance_pct);
    check.other = Some(deviation_pct);
    check.status = if exceeds_tolerance {
        CheckStatus::Warning
    } else {
        CheckStatus::Ok
    };
    peers.sort_unstable_by_key(|peer| peer.load_point_id);
    result.reference_piles = peers
        .into_iter()
        .map(|peer| {
            let (deviation_pct, exceeds_tolerance) =
                deviation(peer.reading.total_blows, median_total, tolerance_pct);
            ReferencePile {
                load_point_id: peer.load_point_id,
                mean_blows: mean(peer.reading.total_blows as f64),
                deviation_pct,
                exceeds_tolerance,
                final_ppn_m: peer.reading.final_ppn_m,
                mean_energy_kj: peer.reading.mean_energy_kj,
            }
        })
        .collect();
    result
}

fn deviation(total_blows: u64, median_total: f64, tolerance_pct: f64) -> (f64, bool) {
    let difference = (total_blows as f64 - median_total).abs() * 100.0;
    (
        difference / median_total,
        difference > median_total * tolerance_pct,
    )
}

fn mean(total: f64) -> f64 {
    total / WINDOW_SIZE as f64
}
