use super::LoadPointTopology;
use crate::LoadPointGroup;
use std::collections::{BTreeSet, HashMap};

/// Contracts the original graph, without introducing edges across omitted locations.
pub(crate) fn contract_optimization_unit_graph(
    topology: &LoadPointTopology,
    groups: &[LoadPointGroup],
) -> Vec<(usize, usize)> {
    let membership: HashMap<_, _> = groups
        .iter()
        .enumerate()
        .flat_map(|(u, g)| g.load_point_ids.iter().map(move |id| (*id, u)))
        .collect();
    topology
        .edges
        .iter()
        .filter_map(|edge| {
            let a = *membership.get(&edge.from_load_point_id)?;
            let b = *membership.get(&edge.to_load_point_id)?;
            (a != b).then_some((a.min(b), a.max(b)))
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
