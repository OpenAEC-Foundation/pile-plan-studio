use std::collections::{BTreeMap, BTreeSet};

use crate::{
    LoadPointGroup, OptimizationPreparationDiagnostic, OptimizationPreparationDiagnosticKind,
};

pub(crate) fn select_target_groups(
    groups: &[LoadPointGroup],
    target_ids: &[u32],
) -> Result<Vec<LoadPointGroup>, OptimizationPreparationDiagnostic> {
    let target_ids = target_ids.iter().copied().collect::<BTreeSet<_>>();
    let mut normalized_groups = groups
        .iter()
        .map(|group| {
            let mut load_point_ids = group.load_point_ids.clone();
            load_point_ids.sort_unstable();
            load_point_ids.dedup();
            LoadPointGroup { load_point_ids }
        })
        .collect::<Vec<_>>();
    normalized_groups.sort_by(|left, right| left.load_point_ids.cmp(&right.load_point_ids));

    let membership_counts = normalized_groups
        .iter()
        .flat_map(|group| group.load_point_ids.iter().copied())
        .fold(
            BTreeMap::<u32, usize>::new(),
            |mut counts, load_point_id| {
                *counts.entry(load_point_id).or_default() += 1;
                counts
            },
        );
    let selected_groups = normalized_groups
        .into_iter()
        .filter(|group| {
            group
                .load_point_ids
                .iter()
                .any(|load_point_id| target_ids.contains(load_point_id))
        })
        .collect::<Vec<_>>();
    let invalid_ids = target_ids
        .iter()
        .copied()
        .chain(
            selected_groups
                .iter()
                .flat_map(|group| group.load_point_ids.iter().copied()),
        )
        .filter(|load_point_id| membership_counts.get(load_point_id).copied() != Some(1))
        .collect::<BTreeSet<_>>();

    if invalid_ids.is_empty() {
        Ok(selected_groups)
    } else {
        Err(OptimizationPreparationDiagnostic {
            kind: OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
            load_point_ids: invalid_ids.into_iter().collect(),
            configuration: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::{LoadPointGroup, OptimizationPreparationDiagnosticKind};

    use super::select_target_groups;

    fn group(load_point_ids: &[u32]) -> LoadPointGroup {
        LoadPointGroup {
            load_point_ids: load_point_ids.to_vec(),
        }
    }

    #[test]
    fn selected_member_expands_to_complete_group() {
        let groups = vec![group(&[1, 2]), group(&[3])];

        assert_eq!(
            select_target_groups(&groups, &[2]).expect("valid partition"),
            vec![group(&[1, 2])],
        );
    }

    #[test]
    fn duplicate_selected_membership_is_blocked() {
        let groups = vec![group(&[1, 2]), group(&[2, 3])];

        let diagnostic = select_target_groups(&groups, &[2]).expect_err("invalid partition");

        assert_eq!(
            diagnostic.kind,
            OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
        );
        assert_eq!(diagnostic.load_point_ids, vec![2]);
        assert_eq!(diagnostic.configuration, None);
    }

    #[test]
    fn missing_target_membership_is_blocked() {
        let diagnostic =
            select_target_groups(&[group(&[1])], &[2]).expect_err("missing target membership");

        assert_eq!(
            diagnostic.kind,
            OptimizationPreparationDiagnosticKind::InvalidGroupPartition,
        );
        assert_eq!(diagnostic.load_point_ids, vec![2]);
        assert_eq!(diagnostic.configuration, None);
    }
}
