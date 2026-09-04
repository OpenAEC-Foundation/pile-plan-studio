use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::analysis::LoadPoint;

pub const DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM: f64 = 1_200.0;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPointGroupingSettings {
    pub max_edge_distance_mm: f64,
}

impl Default for LoadPointGroupingSettings {
    fn default() -> Self {
        Self {
            max_edge_distance_mm: DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LoadPointGroup {
    pub load_point_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ApplyLoadPointGroupAssignmentInput {
    pub selected_load_point_ids: Vec<u32>,
    pub groups: Vec<LoadPointGroup>,
    pub requested_configuration: Option<crate::PileConfigurationKey>,
    pub current_assignments: HashMap<u32, crate::PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPointGroupAssignmentChange {
    pub load_point_id: u32,
    pub configuration: Option<crate::PileConfigurationKey>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BlockingLockedLoadPoint {
    pub load_point_id: u32,
    pub assigned_configuration: Option<crate::PileConfigurationKey>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ApplyLoadPointGroupAssignmentResult {
    Applied {
        changes: Vec<LoadPointGroupAssignmentChange>,
    },
    Blocked {
        involved_load_point_ids: Vec<u32>,
        blocking_locked_load_points: Vec<BlockingLockedLoadPoint>,
    },
}

pub fn derive_load_point_groups(
    load_points: &[LoadPoint],
    settings: &LoadPointGroupingSettings,
) -> Vec<LoadPointGroup> {
    let mut components = UnionFind::new(load_points.len());
    let max_distance_mm = if settings.max_edge_distance_mm.is_finite() {
        settings.max_edge_distance_mm.max(0.0)
    } else {
        0.0
    };
    let max_distance_squared = max_distance_mm * max_distance_mm;

    for left_index in 0..load_points.len() {
        for right_index in (left_index + 1)..load_points.len() {
            let left = &load_points[left_index];
            let right = &load_points[right_index];
            let delta_x = left.x_mm - right.x_mm;
            let delta_y = left.y_mm - right.y_mm;
            let distance_squared = delta_x * delta_x + delta_y * delta_y;

            if distance_squared < max_distance_squared {
                components.union(left_index, right_index);
            }
        }
    }

    let mut ids_by_root = BTreeMap::<usize, Vec<u32>>::new();
    for (index, load_point) in load_points.iter().enumerate() {
        ids_by_root
            .entry(components.find(index))
            .or_default()
            .push(load_point.id);
    }

    let mut groups = ids_by_root
        .into_values()
        .map(|mut load_point_ids| {
            load_point_ids.sort_unstable();
            LoadPointGroup { load_point_ids }
        })
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| left.load_point_ids.cmp(&right.load_point_ids));
    groups
}

pub fn apply_load_point_group_assignment(
    input: &ApplyLoadPointGroupAssignmentInput,
) -> ApplyLoadPointGroupAssignmentResult {
    let selected = input
        .selected_load_point_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    let involved = input
        .groups
        .iter()
        .filter(|group| {
            group
                .load_point_ids
                .iter()
                .any(|load_point_id| selected.contains(load_point_id))
        })
        .flat_map(|group| group.load_point_ids.iter().copied())
        .collect::<BTreeSet<_>>();
    let locked = input
        .locked_load_point_ids
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    let blocking_locked_load_points = involved
        .iter()
        .filter(|load_point_id| locked.contains(load_point_id))
        .filter_map(|load_point_id| {
            let assigned_configuration = input.current_assignments.get(load_point_id);
            (assigned_configuration != input.requested_configuration.as_ref()).then(|| {
                BlockingLockedLoadPoint {
                    load_point_id: *load_point_id,
                    assigned_configuration: assigned_configuration.cloned(),
                }
            })
        })
        .collect::<Vec<_>>();

    if !blocking_locked_load_points.is_empty() {
        return ApplyLoadPointGroupAssignmentResult::Blocked {
            involved_load_point_ids: involved.into_iter().collect(),
            blocking_locked_load_points,
        };
    }

    let changes = involved
        .into_iter()
        .filter(|load_point_id| !locked.contains(load_point_id))
        .filter(|load_point_id| {
            input.current_assignments.get(load_point_id) != input.requested_configuration.as_ref()
        })
        .map(|load_point_id| LoadPointGroupAssignmentChange {
            load_point_id,
            configuration: input.requested_configuration.clone(),
        })
        .collect();

    ApplyLoadPointGroupAssignmentResult::Applied { changes }
}

struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<u8>,
}

impl UnionFind {
    fn new(len: usize) -> Self {
        Self {
            parent: (0..len).collect(),
            rank: vec![0; len],
        }
    }

    fn find(&mut self, index: usize) -> usize {
        if self.parent[index] != index {
            self.parent[index] = self.find(self.parent[index]);
        }
        self.parent[index]
    }

    fn union(&mut self, left: usize, right: usize) {
        let left_root = self.find(left);
        let right_root = self.find(right);
        if left_root == right_root {
            return;
        }

        match self.rank[left_root].cmp(&self.rank[right_root]) {
            std::cmp::Ordering::Less => self.parent[left_root] = right_root,
            std::cmp::Ordering::Greater => self.parent[right_root] = left_root,
            std::cmp::Ordering::Equal => {
                self.parent[right_root] = left_root;
                self.rank[left_root] += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::analysis::LoadPoint;
    use crate::PileConfigurationKey;

    use super::{
        apply_load_point_group_assignment, derive_load_point_groups,
        ApplyLoadPointGroupAssignmentInput, ApplyLoadPointGroupAssignmentResult,
        BlockingLockedLoadPoint, LoadPointGroup, LoadPointGroupAssignmentChange,
        LoadPointGroupingSettings, DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM,
    };

    fn point(id: u32, x_mm: f64, y_mm: f64) -> LoadPoint {
        LoadPoint {
            id,
            name: format!("Load point {id}"),
            x_mm,
            y_mm,
            design_load_kn: 100.0,
        }
    }

    fn group(load_point_ids: &[u32]) -> LoadPointGroup {
        LoadPointGroup {
            load_point_ids: load_point_ids.to_vec(),
        }
    }

    fn derive(load_points: &[LoadPoint]) -> Vec<LoadPointGroup> {
        derive_load_point_groups(load_points, &LoadPointGroupingSettings::default())
    }

    fn configuration(pile_size_mm: u32, pile_tip_level_mm: i64) -> PileConfigurationKey {
        PileConfigurationKey {
            pile_size_mm,
            pile_tip_level_mm,
        }
    }

    fn assignment_input(
        selected_load_point_ids: Vec<u32>,
        groups: Vec<LoadPointGroup>,
        current_assignments: &[(u32, PileConfigurationKey)],
        locked_load_point_ids: Vec<u32>,
        requested_configuration: PileConfigurationKey,
    ) -> ApplyLoadPointGroupAssignmentInput {
        ApplyLoadPointGroupAssignmentInput {
            selected_load_point_ids,
            groups,
            requested_configuration: Some(requested_configuration),
            current_assignments: current_assignments.iter().cloned().collect(),
            locked_load_point_ids,
        }
    }

    fn unassignment_input(
        selected_load_point_ids: Vec<u32>,
        groups: Vec<LoadPointGroup>,
        current_assignments: &[(u32, PileConfigurationKey)],
        locked_load_point_ids: Vec<u32>,
    ) -> ApplyLoadPointGroupAssignmentInput {
        ApplyLoadPointGroupAssignmentInput {
            selected_load_point_ids,
            groups,
            requested_configuration: None,
            current_assignments: current_assignments.iter().cloned().collect(),
            locked_load_point_ids,
        }
    }

    #[test]
    fn empty_project_has_no_groups() {
        assert!(derive(&[]).is_empty());
    }

    #[test]
    fn isolated_load_point_forms_a_singleton_group() {
        assert_eq!(derive(&[point(7, 10.0, 20.0)]), vec![group(&[7])]);
    }

    #[test]
    fn coincident_load_points_are_grouped() {
        assert_eq!(
            derive(&[point(8, 10.0, 20.0), point(3, 10.0, 20.0)]),
            vec![group(&[3, 8])],
        );
    }

    #[test]
    fn distance_threshold_is_strict() {
        let groups = derive(&[
            point(1, 0.0, 0.0),
            point(2, DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM - 0.001, 0.0),
            point(3, 10_000.0, 0.0),
            point(4, 10_000.0 + DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM, 0.0),
            point(5, 20_000.0, 0.0),
            point(
                6,
                20_000.0 + DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM + 0.001,
                0.0,
            ),
        ]);

        assert_eq!(
            groups,
            vec![
                group(&[1, 2]),
                group(&[3]),
                group(&[4]),
                group(&[5]),
                group(&[6])
            ],
        );
    }

    #[test]
    fn transitive_edges_form_one_group() {
        let groups = derive(&[
            point(8, 0.0, 0.0),
            point(2, 1_000.0, 0.0),
            point(5, 2_000.0, 0.0),
        ]);

        assert_eq!(groups, vec![group(&[2, 5, 8])]);
    }

    #[test]
    fn invalid_distance_settings_do_not_connect_load_points() {
        let load_points = [point(1, 0.0, 0.0), point(2, 500.0, 0.0)];

        for max_edge_distance_mm in [-1_200.0, f64::INFINITY, f64::NAN] {
            assert_eq!(
                derive_load_point_groups(
                    &load_points,
                    &LoadPointGroupingSettings {
                        max_edge_distance_mm,
                    },
                ),
                vec![group(&[1]), group(&[2])],
            );
        }
    }

    #[test]
    fn disconnected_clusters_and_singletons_form_a_complete_partition() {
        let groups = derive(&[
            point(9, 5_000.0, 5_000.0),
            point(6, 500.0, 0.0),
            point(1, 0.0, 0.0),
            point(8, 5_500.0, 5_000.0),
            point(4, 20_000.0, 20_000.0),
        ]);

        assert_eq!(groups, vec![group(&[1, 6]), group(&[4]), group(&[8, 9])]);
    }

    #[test]
    fn result_is_stable_for_shuffled_input() {
        let forward = derive(&[
            point(9, 5_000.0, 5_000.0),
            point(6, 500.0, 0.0),
            point(1, 0.0, 0.0),
            point(8, 5_500.0, 5_000.0),
        ]);
        let reverse = derive(&[
            point(8, 5_500.0, 5_000.0),
            point(1, 0.0, 0.0),
            point(6, 500.0, 0.0),
            point(9, 5_000.0, 5_000.0),
        ]);

        assert_eq!(forward, reverse);
    }

    #[test]
    fn group_assignment_updates_every_unlocked_member() {
        let requested = configuration(320, -18_000);
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![2],
            vec![group(&[1, 2, 3])],
            &[(1, configuration(290, -17_500))],
            vec![],
            requested.clone(),
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![
                    LoadPointGroupAssignmentChange {
                        load_point_id: 1,
                        configuration: Some(requested.clone()),
                    },
                    LoadPointGroupAssignmentChange {
                        load_point_id: 2,
                        configuration: Some(requested.clone()),
                    },
                    LoadPointGroupAssignmentChange {
                        load_point_id: 3,
                        configuration: Some(requested),
                    },
                ],
            },
        );
    }

    #[test]
    fn multiselection_updates_the_union_of_involved_groups_once() {
        let requested = configuration(320, -18_000);
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![2, 1, 10],
            vec![group(&[1, 2]), group(&[10, 11]), group(&[20])],
            &[],
            vec![],
            requested.clone(),
        ));

        let ApplyLoadPointGroupAssignmentResult::Applied { changes } = result else {
            panic!("assignment should be applied");
        };
        assert_eq!(
            changes
                .iter()
                .map(|change| change.load_point_id)
                .collect::<Vec<_>>(),
            vec![1, 2, 10, 11],
        );
        assert!(changes
            .iter()
            .all(|change| change.configuration == Some(requested.clone())));
    }

    #[test]
    fn matching_locked_member_is_unchanged_while_unlocked_members_update() {
        let requested = configuration(320, -18_000);
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![1],
            vec![group(&[1, 2])],
            &[(1, requested.clone()), (2, configuration(290, -17_500))],
            vec![1],
            requested.clone(),
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![LoadPointGroupAssignmentChange {
                    load_point_id: 2,
                    configuration: Some(requested),
                }],
            },
        );
    }

    #[test]
    fn mismatching_lock_blocks_every_involved_group() {
        let requested = configuration(320, -18_000);
        let locked = configuration(290, -17_500);
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![1, 10],
            vec![group(&[1, 2]), group(&[10, 11])],
            &[(11, locked.clone())],
            vec![11],
            requested,
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Blocked {
                involved_load_point_ids: vec![1, 2, 10, 11],
                blocking_locked_load_points: vec![BlockingLockedLoadPoint {
                    load_point_id: 11,
                    assigned_configuration: Some(locked),
                }],
            },
        );
    }

    #[test]
    fn unassigned_lock_blocks_without_a_partial_patch() {
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![1],
            vec![group(&[1, 2])],
            &[],
            vec![2],
            configuration(320, -18_000),
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Blocked {
                involved_load_point_ids: vec![1, 2],
                blocking_locked_load_points: vec![BlockingLockedLoadPoint {
                    load_point_id: 2,
                    assigned_configuration: None,
                }],
            },
        );
    }

    #[test]
    fn blockers_are_complete_sorted_and_deduplicated() {
        let result = apply_load_point_group_assignment(&assignment_input(
            vec![1, 1],
            vec![group(&[1, 2, 3])],
            &[(3, configuration(290, -17_500))],
            vec![3, 2, 3],
            configuration(320, -18_000),
        ));

        let ApplyLoadPointGroupAssignmentResult::Blocked {
            blocking_locked_load_points,
            ..
        } = result
        else {
            panic!("assignment should be blocked");
        };
        assert_eq!(
            blocking_locked_load_points,
            vec![
                BlockingLockedLoadPoint {
                    load_point_id: 2,
                    assigned_configuration: None,
                },
                BlockingLockedLoadPoint {
                    load_point_id: 3,
                    assigned_configuration: Some(configuration(290, -17_500)),
                },
            ],
        );
    }

    #[test]
    fn group_unassignment_clears_every_assigned_member() {
        let result = apply_load_point_group_assignment(&unassignment_input(
            vec![2],
            vec![group(&[1, 2, 3])],
            &[
                (1, configuration(290, -17_500)),
                (2, configuration(320, -18_000)),
            ],
            vec![],
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![
                    LoadPointGroupAssignmentChange {
                        load_point_id: 1,
                        configuration: None,
                    },
                    LoadPointGroupAssignmentChange {
                        load_point_id: 2,
                        configuration: None,
                    },
                ],
            },
        );
    }

    #[test]
    fn assigned_locked_member_blocks_group_unassignment() {
        let assigned = configuration(320, -18_000);
        let result = apply_load_point_group_assignment(&unassignment_input(
            vec![1],
            vec![group(&[1, 2])],
            &[(1, assigned.clone()), (2, assigned.clone())],
            vec![2],
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Blocked {
                involved_load_point_ids: vec![1, 2],
                blocking_locked_load_points: vec![BlockingLockedLoadPoint {
                    load_point_id: 2,
                    assigned_configuration: Some(assigned),
                }],
            },
        );
    }

    #[test]
    fn already_unassigned_locked_member_does_not_block_group_unassignment() {
        let result = apply_load_point_group_assignment(&unassignment_input(
            vec![1],
            vec![group(&[1, 2])],
            &[(1, configuration(320, -18_000))],
            vec![2],
        ));

        assert_eq!(
            result,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![LoadPointGroupAssignmentChange {
                    load_point_id: 1,
                    configuration: None,
                }],
            },
        );
    }
}
