use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::analysis::{LoadPoint, PileConfigurationOption};
use crate::pile_configuration::pile_tip_level_mm;
#[cfg(test)]
use crate::pile_configuration::PileConfigurationKey;

mod faces;
mod gabriel;

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct SpatialEdge {
    pub from_load_point_id: u32,
    pub to_load_point_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpatialFace {
    pub boundary_load_point_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNeighborhood {
    pub load_point_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
    pub faces: Vec<SpatialFace>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialPileAssignment {
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionGroup {
    pub pile_tip_level_mm: i64,
    pub legend_value_m: f64,
    pub load_point_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
    pub faces: Vec<SpatialFace>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionTopology {
    pub groups: Vec<TipLevelRegionGroup>,
}

#[derive(Debug)]
struct GeometricNode {
    load_point_id: u32,
    x_mm: f64,
    y_mm: f64,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct LoadPointEdge {
    from_load_point_id: u32,
    to_load_point_id: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct LoadPointFace {
    boundary_load_point_ids: Vec<u32>,
}

#[derive(Debug)]
struct GabrielGraph {
    nodes: Vec<GeometricNode>,
    edges: Vec<LoadPointEdge>,
}

#[derive(Debug)]
struct GabrielEmbedding {
    graph: GabrielGraph,
    faces: Vec<LoadPointFace>,
}

fn build_gabriel_embedding(load_points: &[LoadPoint]) -> GabrielEmbedding {
    let graph = gabriel::build_gabriel_graph(load_points);
    let faces = faces::extract_bounded_faces(&graph);
    GabrielEmbedding { graph, faces }
}

pub fn build_spatial_neighborhood(load_points: &[LoadPoint]) -> SpatialNeighborhood {
    let GabrielEmbedding { graph, faces } = build_gabriel_embedding(load_points);

    SpatialNeighborhood {
        load_point_ids: graph
            .nodes
            .into_iter()
            .map(|node| node.load_point_id)
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .map(|edge| SpatialEdge {
                from_load_point_id: edge.from_load_point_id,
                to_load_point_id: edge.to_load_point_id,
            })
            .collect(),
        faces: faces
            .into_iter()
            .map(|face| SpatialFace {
                boundary_load_point_ids: face.boundary_load_point_ids,
            })
            .collect(),
    }
}

pub fn build_tip_level_region_topology(
    neighborhood: &SpatialNeighborhood,
    selected_assignments: &HashMap<u32, SpatialPileAssignment>,
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> TipLevelRegionTopology {
    let valid_assignments = neighborhood
        .load_point_ids
        .iter()
        .filter_map(|load_point_id| {
            let Some(assignment) = selected_assignments.get(load_point_id) else {
                return None;
            };
            let assignment_key = assignment.pile_tip_level_mm;
            let Some(matched_option) = options_by_load_point
                .get(load_point_id)
                .into_iter()
                .flatten()
                .find(|option| {
                    option.is_option
                        && option.pile_size_mm == assignment.pile_size_mm
                        && pile_tip_level_mm(option.pile_tip_level_m) == assignment_key
                })
            else {
                return None;
            };
            Some((
                *load_point_id,
                (assignment_key, matched_option.pile_tip_level_m),
            ))
        })
        .collect::<BTreeMap<_, _>>();

    let mut load_point_ids_by_key: BTreeMap<i64, Vec<u32>> = BTreeMap::new();
    for (&load_point_id, &(key, _)) in &valid_assignments {
        load_point_ids_by_key
            .entry(key)
            .or_default()
            .push(load_point_id);
    }

    let mut groups = Vec::with_capacity(load_point_ids_by_key.len());
    for (key, load_point_ids) in load_point_ids_by_key.into_iter().rev() {
        let edges = neighborhood
            .edges
            .iter()
            .filter(|edge| {
                valid_assignments
                    .get(&edge.from_load_point_id)
                    .is_some_and(|(load_point_key, _)| *load_point_key == key)
                    && valid_assignments
                        .get(&edge.to_load_point_id)
                        .is_some_and(|(load_point_key, _)| *load_point_key == key)
            })
            .cloned()
            .collect::<Vec<_>>();
        let faces = neighborhood
            .faces
            .iter()
            .filter(|face| {
                face.boundary_load_point_ids.iter().all(|load_point_id| {
                    valid_assignments
                        .get(load_point_id)
                        .is_some_and(|(load_point_key, _)| *load_point_key == key)
                })
            })
            .cloned()
            .collect::<Vec<_>>();
        let legend_value_m = load_point_ids
            .iter()
            .find_map(|load_point_id| {
                valid_assignments
                    .get(load_point_id)
                    .map(|(_, raw_value)| *raw_value)
            })
            .expect("PPN group contains at least one valid load point");
        groups.push(TipLevelRegionGroup {
            pile_tip_level_mm: key,
            legend_value_m,
            load_point_ids,
            edges,
            faces,
        });
    }

    TipLevelRegionTopology { groups }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeSet, HashMap};

    fn point(id: u32, x_mm: f64, y_mm: f64) -> LoadPoint {
        LoadPoint {
            id,
            name: format!("LP {id}"),
            x_mm,
            y_mm,
            design_load_kn: 100.0,
        }
    }

    fn pairs(graph: &SpatialNeighborhood) -> Vec<(u32, u32)> {
        graph
            .edges
            .iter()
            .map(|edge| (edge.from_load_point_id, edge.to_load_point_id))
            .collect()
    }

    fn is_connected(graph: &SpatialNeighborhood) -> bool {
        let Some(&first) = graph.load_point_ids.first() else {
            return true;
        };
        let mut reached = BTreeSet::from([first]);
        let mut frontier = vec![first];
        while let Some(load_point_id) = frontier.pop() {
            for edge in &graph.edges {
                let neighbor = if edge.from_load_point_id == load_point_id {
                    Some(edge.to_load_point_id)
                } else if edge.to_load_point_id == load_point_id {
                    Some(edge.from_load_point_id)
                } else {
                    None
                };
                if let Some(neighbor) = neighbor {
                    if reached.insert(neighbor) {
                        frontier.push(neighbor);
                    }
                }
            }
        }
        reached.len() == graph.load_point_ids.len()
    }

    #[test]
    fn empty_and_single_node_graphs_have_no_edges() {
        assert!(build_spatial_neighborhood(&[]).edges.is_empty());

        let graph = build_spatial_neighborhood(&[point(4, 1.25, -2.5)]);
        assert_eq!(graph.load_point_ids, vec![4]);
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn two_distinct_nodes_are_neighbors() {
        let graph =
            build_spatial_neighborhood(&[point(9, 1000.0, -2000.0), point(2, -500.0, 3000.0)]);

        assert_eq!(pairs(&graph), vec![(2, 9)]);
    }

    #[test]
    fn middle_collinear_point_blocks_the_long_edge() {
        let graph = build_spatial_neighborhood(&[
            point(3, 2.0, 0.0),
            point(1, 0.0, 0.0),
            point(2, 1.0, 0.0),
        ]);

        assert_eq!(pairs(&graph), vec![(1, 2), (2, 3)]);
    }

    #[test]
    fn closed_rectangle_grid_has_perimeter_edges_without_diagonals() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 1.0, 0.0),
            point(3, 1.0, 1.0),
            point(4, 0.0, 1.0),
        ]);

        assert_eq!(pairs(&graph), vec![(1, 2), (1, 4), (2, 3), (3, 4)]);
    }

    #[test]
    fn neighborhood_exposes_load_point_ids_edges_and_bounded_faces() {
        let graph = build_spatial_neighborhood(&[
            point(2, 0.0, 0.0),
            point(3, 2.0, 0.0),
            point(4, 1.0, 2.0),
        ]);

        assert_eq!(graph.load_point_ids, vec![2, 3, 4]);
        assert_eq!(graph.faces.len(), 1);
        assert_eq!(graph.faces[0].boundary_load_point_ids, vec![2, 3, 4]);
    }

    #[test]
    fn neighborhood_serializes_without_coordinates_or_site_membership() {
        let graph = build_spatial_neighborhood(&[point(7, 0.0, 0.0)]);

        assert_eq!(
            serde_json::to_value(graph).expect("neighborhood serializes"),
            serde_json::json!({
                "load_point_ids": [7],
                "edges": [],
                "faces": [],
            })
        );
    }

    #[test]
    fn boundary_point_blocks_an_edge() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 2.0, 1.0),
            point(3, 1.0, 0.0),
        ]);

        assert!(!pairs(&graph).contains(&(1, 2)));
    }

    #[test]
    fn plus_shape_uses_four_non_crossing_gabriel_edges() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 1.0),
            point(2, 0.0, -1.0),
            point(3, 1.0, 0.0),
            point(4, -1.0, 0.0),
        ]);

        assert_eq!(pairs(&graph), vec![(1, 3), (1, 4), (2, 3), (2, 4)]);
    }

    #[test]
    fn point_outside_axis_aligned_rectangle_but_inside_diameter_circle_blocks() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 4.0, 2.0),
            point(3, 2.0, -1.0),
        ]);

        assert!(!pairs(&graph).contains(&(1, 2)));
    }

    #[test]
    fn output_is_independent_of_input_order() {
        let ordered = build_spatial_neighborhood(&[
            point(1, -2.0, 1.0),
            point(2, 0.0, 0.0),
            point(3, 2.0, 1.0),
            point(4, 0.0, 3.0),
        ]);
        let permuted = build_spatial_neighborhood(&[
            point(4, 0.0, 3.0),
            point(2, 0.0, 0.0),
            point(1, -2.0, 1.0),
            point(3, 2.0, 1.0),
        ]);

        assert_eq!(ordered, permuted);
    }

    #[test]
    fn neighborhood_is_connected_for_a_nontrivial_fixture() {
        let graph = build_spatial_neighborhood(&[
            point(1, -4.0, 0.0),
            point(2, -1.0, 3.0),
            point(3, 0.0, -2.0),
            point(4, 2.0, 1.0),
            point(5, 5.0, 4.0),
            point(6, 6.0, -3.0),
        ]);

        assert!(is_connected(&graph));
    }

    mod tip_level {
        use super::*;

        fn option(
            pile_size_mm: u32,
            pile_tip_level_m: f64,
            is_option: bool,
        ) -> PileConfigurationOption {
            PileConfigurationOption {
                configuration: PileConfigurationKey::from_metres(pile_size_mm, pile_tip_level_m),
                pile_size_mm,
                pile_tip_level_m,
                is_option,
                governing_cpt_id: Some(1),
                governing_frd_kn: Some(500.0),
                utilization: Some(0.5),
                missing_cpt_ids: Vec::new(),
                technical_status: crate::pile_option_technical_status(is_option, Some(0.5), &[]),
            }
        }

        fn assignment(pile_tip_level_m: f64) -> SpatialPileAssignment {
            SpatialPileAssignment {
                pile_size_mm: 320,
                pile_tip_level_mm: pile_tip_level_mm(pile_tip_level_m),
            }
        }

        #[test]
        fn colors_a_face_only_when_every_boundary_load_point_has_one_ppn_key() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(2, 2.0, 0.0),
                point(3, 2.0, 2.0),
                point(4, 0.0, 2.0),
            ]);
            let all_same_assignments = [1, 2, 3, 4]
                .into_iter()
                .map(|id| (id, assignment(-18.0)))
                .collect::<HashMap<_, _>>();
            let all_same_options = [1, 2, 3, 4]
                .into_iter()
                .map(|id| (id, vec![option(320, -18.0, true)]))
                .collect::<HashMap<_, _>>();

            let all_same = build_tip_level_region_topology(
                &neighborhood,
                &all_same_assignments,
                &all_same_options,
            );

            assert_eq!(all_same.groups[0].faces, neighborhood.faces);

            let mixed_assignments = HashMap::from([
                (1, assignment(-18.0)),
                (2, assignment(-18.0)),
                (3, assignment(-19.0)),
                (4, assignment(-18.0)),
            ]);
            let mixed_options = HashMap::from([
                (1, vec![option(320, -18.0, true)]),
                (2, vec![option(320, -18.0, true)]),
                (3, vec![option(320, -19.0, true)]),
                (4, vec![option(320, -18.0, true)]),
            ]);

            let mixed =
                build_tip_level_region_topology(&neighborhood, &mixed_assignments, &mixed_options);

            assert!(mixed.groups.iter().all(|group| group.faces.is_empty()));
        }

        #[test]
        fn groups_valid_neighbors_by_millimeter_ppn_and_ignores_size() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(2, 1.0, 0.0),
                point(3, 2.0, 0.0),
            ]);
            let assignments = HashMap::from([
                (
                    1,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 400,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -19_000,
                    },
                ),
            ]);
            let options = HashMap::from([
                (1, vec![option(320, -18.00049, true)]),
                (2, vec![option(400, -18.0001, true)]),
                (3, vec![option(320, -19.0, true)]),
            ]);

            let topology = build_tip_level_region_topology(&neighborhood, &assignments, &options);

            assert_eq!(topology.groups.len(), 2);
            assert_eq!(topology.groups[0].pile_tip_level_mm, -18_000);
            assert_eq!(topology.groups[0].legend_value_m, -18.00049);
            assert_eq!(topology.groups[0].load_point_ids, vec![1, 2]);
            assert_eq!(topology.groups[0].edges.len(), 1);
            assert_eq!(topology.groups[1].pile_tip_level_mm, -19_000);
            assert_eq!(topology.groups[1].load_point_ids, vec![3]);
        }

        #[test]
        fn excludes_unassigned_missing_invalid_and_size_mismatched_options() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(2, 1.0, 0.0),
                point(3, 2.0, 0.0),
                point(4, 3.0, 0.0),
                point(5, 4.0, 0.0),
            ]);
            let assignments = HashMap::from([
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    4,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    5,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
            ]);
            let options = HashMap::from([
                (2, vec![option(320, -18.0, false)]),
                (3, vec![option(320, -19.0, true)]),
                (4, vec![option(400, -18.0, true)]),
                (5, vec![option(320, -18.0, true)]),
            ]);

            let topology = build_tip_level_region_topology(&neighborhood, &assignments, &options);

            assert_eq!(topology.groups.len(), 1);
            assert_eq!(topology.groups[0].load_point_ids, vec![5]);
            assert!(topology.groups[0].edges.is_empty());
        }

        #[test]
        fn equal_ppn_load_points_keep_only_edges_whose_endpoints_share_the_ppn() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(2, 1.0, 0.0),
                point(3, 2.0, 0.0),
            ]);
            let assignments = HashMap::from([
                (
                    1,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -19_000,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
            ]);
            let options = HashMap::from([
                (1, vec![option(320, -18.0, true)]),
                (2, vec![option(320, -19.0, true)]),
                (3, vec![option(320, -18.0, true)]),
            ]);

            let topology = build_tip_level_region_topology(&neighborhood, &assignments, &options);

            assert_eq!(topology.groups[0].load_point_ids, vec![1, 3]);
            assert!(topology.groups[0].edges.is_empty());
        }

        #[test]
        fn output_is_stable_for_permuted_assignment_and_option_maps() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(2, 1.0, 0.0),
                point(3, 2.0, 0.0),
            ]);
            let forward_assignments = HashMap::from([
                (
                    1,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                ),
            ]);
            let forward_options = HashMap::from([
                (1, vec![option(320, -18.0, true)]),
                (2, vec![option(320, -18.0, true)]),
                (3, vec![option(320, -18.0, true)]),
            ]);
            let mut reverse_assignments = HashMap::new();
            let mut reverse_options = HashMap::new();
            for load_point_id in [3, 2, 1] {
                reverse_assignments.insert(
                    load_point_id,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_mm: -18_000,
                    },
                );
                reverse_options.insert(load_point_id, vec![option(320, -18.0, true)]);
            }

            let forward = build_tip_level_region_topology(
                &neighborhood,
                &forward_assignments,
                &forward_options,
            );
            let reverse = build_tip_level_region_topology(
                &neighborhood,
                &reverse_assignments,
                &reverse_options,
            );

            assert_eq!(forward, reverse);
            assert_eq!(forward.groups[0].load_point_ids, vec![1, 2, 3]);
            assert_eq!(forward.groups[0].edges.len(), 2);
        }
    }
}
