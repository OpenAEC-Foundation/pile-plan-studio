use std::collections::BTreeMap;

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

    use super::{
        derive_load_point_groups, LoadPointGroup, LoadPointGroupingSettings,
        DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM,
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
}
