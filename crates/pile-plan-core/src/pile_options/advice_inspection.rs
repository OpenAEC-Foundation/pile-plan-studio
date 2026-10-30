use super::{CptBearingCapacityRow, FoundationAdviceIndex};
use crate::{
    InvalidPileTipLevels, LoadPointGroupingSettings, PileCapProposal, PileConfigurationKey,
    ProjectBearingCapacity, ProjectLoadPoint, ResistanceDirection,
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
#[derive(Debug, Deserialize)]
pub struct FoundationAdviceInspectionRequest {
    pub load_points: Vec<ProjectLoadPoint>,
    pub grouping_settings: LoadPointGroupingSettings,
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub selected_piles: HashMap<u32, PileConfigurationKey>,
    pub cpt_id: u32,
    #[serde(default)]
    pub proposals: Vec<PileCapProposal>,
}
/// Read-only source-row inspection; uses the same scope lookup as engineering checks.
pub fn inspect_foundation_advice(
    request: &FoundationAdviceInspectionRequest,
) -> Result<Vec<CptBearingCapacityRow>, InvalidPileTipLevels> {
    let groups =
        crate::derive_load_point_groups(&request.load_points, &request.grouping_settings).groups;
    let counts = groups
        .iter()
        .flat_map(|g| {
            g.load_point_ids
                .iter()
                .map(move |id| (*id, g.load_point_ids.len() as u32))
        })
        .collect::<HashMap<_, _>>();
    let advice = FoundationAdviceIndex::new(&request.bearing_capacities)?;
    let mut seen = HashSet::new();
    let mut rows = Vec::new();
    for (id, assigned) in &request.selected_piles {
        let proposal = request
            .proposals
            .iter()
            .find(|p| p.load_point_ids.contains(id));
        let key = proposal
            .and_then(|p| p.configuration.as_ref())
            .unwrap_or(assigned);
        let count = proposal
            .map(|p| u32::from(p.pile_count))
            .unwrap_or_else(|| counts.get(id).copied().unwrap_or(1));
        for direction in [
            ResistanceDirection::Compression,
            ResistanceDirection::Tension,
        ] {
            if let Some(row) = advice.capacity_record(request.cpt_id, direction, key, count) {
                if seen.insert((key.clone(), direction, row.pile_count)) {
                    rows.push(CptBearingCapacityRow {
                        pile_count: row.pile_count,
                        missing: row.missing,
                        direction,
                        pile_size_mm: row.pile_size_mm,
                        pile_tip_level_m: row.pile_tip_level_m,
                        frd_kn: row.frd_kn,
                    });
                }
            }
        }
    }
    rows.sort_by(|a, b| {
        a.pile_size_mm
            .cmp(&b.pile_size_mm)
            .then_with(|| b.pile_tip_level_m.total_cmp(&a.pile_tip_level_m))
            .then_with(|| a.pile_count.cmp(&b.pile_count))
            .then_with(|| {
                (a.direction == ResistanceDirection::Tension)
                    .cmp(&(b.direction == ResistanceDirection::Tension))
            })
    });
    Ok(rows)
}
