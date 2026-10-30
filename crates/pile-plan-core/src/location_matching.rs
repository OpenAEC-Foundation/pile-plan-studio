use crate::{
    order_numbering_locations, ExportError, NumberingAxis, NumberingDirection, NumberingPoint,
    PileNumberingRule,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocationLink {
    pub old_id: u32,
    pub new_id: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct LocationDecisions {
    pub links: Vec<LocationLink>,
    pub added: Vec<u32>,
    pub removed: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocationBulkAction {
    Automatic,
    Nearest,
    Separate,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocationMatchingRequest {
    pub old_locations: Vec<NumberingPoint>,
    pub new_locations: Vec<NumberingPoint>,
    pub tolerance_mm: f64,
    #[serde(default)]
    pub decisions: Option<LocationDecisions>,
    #[serde(default)]
    pub bulk_action: Option<LocationBulkAction>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MatchedLocation {
    pub old_id: u32,
    pub new_id: u32,
    pub distance_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LocationCandidate {
    pub old_id: u32,
    pub distance_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LocationProposal {
    pub new_id: u32,
    pub candidates: Vec<LocationCandidate>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LocationMatchingResult {
    pub old_order: Vec<u32>,
    pub new_order: Vec<u32>,
    pub links: Vec<MatchedLocation>,
    pub added: Vec<u32>,
    pub removed: Vec<u32>,
    pub unmatched_old: Vec<u32>,
    pub unmatched_new: Vec<u32>,
    pub proposals: Vec<LocationProposal>,
    pub complete: bool,
}

impl LocationMatchingResult {
    pub fn decisions(&self) -> LocationDecisions {
        LocationDecisions {
            links: self
                .links
                .iter()
                .map(|l| LocationLink {
                    old_id: l.old_id,
                    new_id: l.new_id,
                })
                .collect(),
            added: self.added.clone(),
            removed: self.removed.clone(),
        }
    }
}

fn distance(a: &NumberingPoint, b: &NumberingPoint) -> f64 {
    (a.x_mm - b.x_mm).hypot(a.y_mm - b.y_mm)
}
fn invalid() -> ExportError {
    ExportError("invalid_location_mapping".into())
}

pub(crate) fn review_location_order(points: &[NumberingPoint]) -> Result<Vec<u32>, ExportError> {
    Ok(
        order_numbering_locations(points, &PileNumberingRule::default())?
            .into_iter()
            .map(|index| points[index].id)
            .collect(),
    )
}

pub fn reconcile_locations(
    request: &LocationMatchingRequest,
) -> Result<LocationMatchingResult, ExportError> {
    if !request.tolerance_mm.is_finite() || request.tolerance_mm < 0.0 {
        return Err(invalid());
    }
    let validate = |points: &[NumberingPoint]| -> Result<(), ExportError> {
        let mut ids = HashSet::new();
        for p in points {
            if !p.x_mm.is_finite() || !p.y_mm.is_finite() || !ids.insert(p.id) {
                return Err(invalid());
            }
        }
        Ok(())
    };
    validate(&request.old_locations)?;
    validate(&request.new_locations)?;
    let old: HashMap<_, _> = request.old_locations.iter().map(|p| (p.id, p)).collect();
    let new: HashMap<_, _> = request.new_locations.iter().map(|p| (p.id, p)).collect();
    let mut decisions = if let Some(decisions) = &request.decisions {
        decisions.clone()
    } else {
        let mut candidates: HashMap<u32, Vec<u32>> = HashMap::new();
        let mut old_counts: HashMap<u32, usize> = HashMap::new();
        for p in &request.new_locations {
            let ids: Vec<_> = request
                .old_locations
                .iter()
                .filter(|o| distance(o, p) <= request.tolerance_mm)
                .map(|o| o.id)
                .collect();
            for id in &ids {
                *old_counts.entry(*id).or_default() += 1;
            }
            candidates.insert(p.id, ids);
        }
        LocationDecisions {
            links: candidates
                .into_iter()
                .filter_map(|(new_id, ids)| {
                    (ids.len() == 1 && old_counts.get(&ids[0]) == Some(&1)).then(|| LocationLink {
                        old_id: ids[0],
                        new_id,
                    })
                })
                .collect(),
            ..Default::default()
        }
    };
    let mut used_old = HashSet::new();
    let mut used_new = HashSet::new();
    for link in &decisions.links {
        if !old.contains_key(&link.old_id)
            || !new.contains_key(&link.new_id)
            || !used_old.insert(link.old_id)
            || !used_new.insert(link.new_id)
        {
            return Err(invalid());
        }
    }
    for id in &decisions.added {
        if !new.contains_key(id) || !used_new.insert(*id) {
            return Err(invalid());
        }
    }
    for id in &decisions.removed {
        if !old.contains_key(id) || !used_old.insert(*id) {
            return Err(invalid());
        }
    }
    match request.bulk_action {
        Some(LocationBulkAction::Automatic) => {
            let automatic = reconcile_locations(&LocationMatchingRequest {
                old_locations: request
                    .old_locations
                    .iter()
                    .filter(|p| !used_old.contains(&p.id))
                    .cloned()
                    .collect(),
                new_locations: request
                    .new_locations
                    .iter()
                    .filter(|p| !used_new.contains(&p.id))
                    .cloned()
                    .collect(),
                tolerance_mm: request.tolerance_mm,
                decisions: None,
                bulk_action: None,
            })?;
            for link in automatic.links {
                used_old.insert(link.old_id);
                used_new.insert(link.new_id);
                decisions.links.push(LocationLink {
                    old_id: link.old_id,
                    new_id: link.new_id,
                });
            }
        }
        Some(LocationBulkAction::Nearest) => {
            let mut pairs = Vec::new();
            for n in &request.new_locations {
                if !used_new.contains(&n.id) {
                    for o in &request.old_locations {
                        if !used_old.contains(&o.id) {
                            pairs.push((distance(o, n), o.id, n.id));
                        }
                    }
                }
            }
            pairs.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
            for (_, old_id, new_id) in pairs {
                if !used_old.contains(&old_id) && !used_new.contains(&new_id) {
                    decisions.links.push(LocationLink { old_id, new_id });
                    used_old.insert(old_id);
                    used_new.insert(new_id);
                }
            }
        }
        Some(LocationBulkAction::Separate) => {
            for p in &request.new_locations {
                if used_new.insert(p.id) {
                    decisions.added.push(p.id);
                }
            }
            for p in &request.old_locations {
                if used_old.insert(p.id) {
                    decisions.removed.push(p.id);
                }
            }
        }
        None => {}
    }
    let mut links: Vec<_> = decisions
        .links
        .iter()
        .map(|link| MatchedLocation {
            old_id: link.old_id,
            new_id: link.new_id,
            distance_mm: distance(old[&link.old_id], new[&link.new_id]),
        })
        .collect();
    links.sort_by_key(|link| link.new_id);
    decisions.added.sort_unstable();
    decisions.removed.sort_unstable();
    let mut unmatched_old: Vec<_> = old
        .keys()
        .filter(|id| !used_old.contains(id))
        .copied()
        .collect();
    unmatched_old.sort_unstable();
    let mut unmatched_new: Vec<_> = new
        .keys()
        .filter(|id| !used_new.contains(id))
        .copied()
        .collect();
    unmatched_new.sort_unstable();
    let proposals = unmatched_new
        .iter()
        .map(|id| {
            let mut candidates: Vec<_> = unmatched_old
                .iter()
                .map(|old_id| LocationCandidate {
                    old_id: *old_id,
                    distance_mm: distance(old[old_id], new[id]),
                })
                .collect();
            candidates.sort_by(|a, b| {
                a.distance_mm
                    .total_cmp(&b.distance_mm)
                    .then(a.old_id.cmp(&b.old_id))
            });
            LocationProposal {
                new_id: *id,
                candidates,
            }
        })
        .collect();
    Ok(LocationMatchingResult {
        old_order: review_location_order(&request.old_locations)?,
        new_order: review_location_order(&request.new_locations)?,
        complete: unmatched_old.is_empty() && unmatched_new.is_empty(),
        links,
        added: decisions.added,
        removed: decisions.removed,
        unmatched_old,
        unmatched_new,
        proposals,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NumberingRuleDetection {
    pub rule: PileNumberingRule,
    pub matching_positions: usize,
    pub total_positions: usize,
    pub equally_matching_rules: usize,
}

pub fn detect_numbering_rule(
    points: &[NumberingPoint],
    tolerance_mm: f64,
) -> Result<NumberingRuleDetection, ExportError> {
    let mut by_mark: Vec<_> = (0..points.len()).collect();
    by_mark.sort_by_key(|i| points[*i].id);
    let mut best = None;
    for axis in [NumberingAxis::Y, NumberingAxis::X] {
        for y_direction in [
            NumberingDirection::Descending,
            NumberingDirection::Ascending,
        ] {
            for x_direction in [
                NumberingDirection::Ascending,
                NumberingDirection::Descending,
            ] {
                let rule = PileNumberingRule {
                    axis,
                    x_direction,
                    y_direction,
                    tolerance_mm,
                };
                let ordered = order_numbering_locations(points, &rule)?;
                let count = ordered.iter().zip(&by_mark).filter(|(a, b)| a == b).count();
                let best: &mut Option<NumberingRuleDetection> = &mut best;
                match best {
                    Some(current) if count == current.matching_positions => {
                        current.equally_matching_rules += 1
                    }
                    Some(current) if count < current.matching_positions => {}
                    _ => {
                        *best = Some(NumberingRuleDetection {
                            rule,
                            matching_positions: count,
                            total_positions: points.len(),
                            equally_matching_rules: 1,
                        })
                    }
                }
            }
        }
    }
    Ok(best.unwrap())
}
