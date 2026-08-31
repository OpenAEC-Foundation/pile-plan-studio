use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::analysis::{pile_tip_level_key, LoadPoint, PileConfigurationOption};

mod faces;
mod gabriel;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNode {
    pub load_point_id: u32,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct SpatialEdge {
    pub from_load_point_id: u32,
    pub to_load_point_id: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNeighborhood {
    pub nodes: Vec<SpatialNode>,
    pub edges: Vec<SpatialEdge>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialPileAssignment {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionComponent {
    pub load_point_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionGroup {
    pub pile_tip_level_m_key: i64,
    pub legend_value_m: f64,
    pub components: Vec<TipLevelRegionComponent>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TipLevelRegionTopology {
    pub groups: Vec<TipLevelRegionGroup>,
}

#[derive(Debug)]
struct GeometricSite {
    site_id: u32,
    x_mm: f64,
    y_mm: f64,
    load_point_ids: Vec<u32>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct SiteEdge {
    from_site_id: u32,
    to_site_id: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SiteFace {
    boundary_site_ids: Vec<u32>,
}

#[derive(Debug)]
struct GabrielGraph {
    sites: Vec<GeometricSite>,
    edges: Vec<SiteEdge>,
}

#[derive(Debug)]
struct GabrielEmbedding {
    graph: GabrielGraph,
    faces: Vec<SiteFace>,
}

fn build_gabriel_embedding(nodes: &[SpatialNode]) -> GabrielEmbedding {
    let graph = gabriel::build_gabriel_graph(nodes);
    let faces = faces::extract_bounded_faces(&graph);
    GabrielEmbedding { graph, faces }
}

pub fn build_spatial_neighborhood(load_points: &[LoadPoint]) -> SpatialNeighborhood {
    let mut nodes = load_points
        .iter()
        .map(|load_point| SpatialNode {
            load_point_id: load_point.id,
            x_mm: load_point.x_mm,
            y_mm: load_point.y_mm,
        })
        .collect::<Vec<_>>();
    nodes.sort_by_key(|node| node.load_point_id);

    let GabrielEmbedding {
        graph,
        faces: _faces,
    } = build_gabriel_embedding(&nodes);

    let mut edge_pairs = BTreeSet::new();
    for site in &graph.sites {
        for (index, &from_id) in site.load_point_ids.iter().enumerate() {
            for &to_id in &site.load_point_ids[index + 1..] {
                edge_pairs.insert(normalized_edge_pair(from_id, to_id));
            }
        }
    }

    let sites_by_id = graph
        .sites
        .iter()
        .map(|site| (site.site_id, site))
        .collect::<BTreeMap<_, _>>();
    for edge in &graph.edges {
        let first = sites_by_id[&edge.from_site_id];
        let second = sites_by_id[&edge.to_site_id];
        for &from_id in &first.load_point_ids {
            for &to_id in &second.load_point_ids {
                edge_pairs.insert(normalized_edge_pair(from_id, to_id));
            }
        }
    }

    SpatialNeighborhood {
        nodes,
        edges: edge_pairs
            .into_iter()
            .map(|(from_load_point_id, to_load_point_id)| SpatialEdge {
                from_load_point_id,
                to_load_point_id,
            })
            .collect(),
    }
}

fn normalized_edge_pair(first_id: u32, second_id: u32) -> (u32, u32) {
    (first_id.min(second_id), first_id.max(second_id))
}

pub fn build_tip_level_region_topology(
    neighborhood: &SpatialNeighborhood,
    selected_assignments: &HashMap<u32, SpatialPileAssignment>,
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> TipLevelRegionTopology {
    let mut valid_assignments = BTreeMap::new();
    for node in &neighborhood.nodes {
        let Some(assignment) = selected_assignments.get(&node.load_point_id) else {
            continue;
        };
        let assignment_key = pile_tip_level_key(assignment.pile_tip_level_m);
        let Some(matched_option) = options_by_load_point
            .get(&node.load_point_id)
            .into_iter()
            .flatten()
            .find(|option| {
                option.is_option
                    && option.pile_size_mm == assignment.pile_size_mm
                    && pile_tip_level_key(option.pile_tip_level_m) == assignment_key
            })
        else {
            continue;
        };
        valid_assignments.insert(
            node.load_point_id,
            (assignment_key, matched_option.pile_tip_level_m),
        );
    }

    let mut ids_by_key: BTreeMap<i64, Vec<u32>> = BTreeMap::new();
    for (&load_point_id, &(key, _)) in &valid_assignments {
        ids_by_key.entry(key).or_default().push(load_point_id);
    }

    let mut groups = Vec::with_capacity(ids_by_key.len());
    for (key, load_point_ids) in ids_by_key.into_iter().rev() {
        let same_key_edges = neighborhood
            .edges
            .iter()
            .filter(|edge| {
                valid_assignments
                    .get(&edge.from_load_point_id)
                    .is_some_and(|(from_key, _)| *from_key == key)
                    && valid_assignments
                        .get(&edge.to_load_point_id)
                        .is_some_and(|(to_key, _)| *to_key == key)
            })
            .cloned()
            .collect::<Vec<_>>();
        let components = connected_components(&load_point_ids, &same_key_edges);
        let legend_value_m = load_point_ids
            .iter()
            .find_map(|load_point_id| {
                valid_assignments
                    .get(load_point_id)
                    .map(|(_, raw_value)| *raw_value)
            })
            .expect("PPN group contains at least one valid load point");
        groups.push(TipLevelRegionGroup {
            pile_tip_level_m_key: key,
            legend_value_m,
            components,
        });
    }

    TipLevelRegionTopology { groups }
}

fn connected_components(
    load_point_ids: &[u32],
    edges: &[SpatialEdge],
) -> Vec<TipLevelRegionComponent> {
    let mut neighbors: BTreeMap<u32, Vec<u32>> = load_point_ids
        .iter()
        .map(|&load_point_id| (load_point_id, Vec::new()))
        .collect();
    for edge in edges {
        neighbors
            .get_mut(&edge.from_load_point_id)
            .expect("edge start belongs to PPN group")
            .push(edge.to_load_point_id);
        neighbors
            .get_mut(&edge.to_load_point_id)
            .expect("edge end belongs to PPN group")
            .push(edge.from_load_point_id);
    }

    let mut visited = BTreeSet::new();
    let mut components = Vec::new();
    for &start_id in load_point_ids {
        if visited.contains(&start_id) {
            continue;
        }
        let mut component_ids = Vec::new();
        let mut frontier = vec![start_id];
        visited.insert(start_id);
        while let Some(load_point_id) = frontier.pop() {
            component_ids.push(load_point_id);
            for &neighbor in neighbors
                .get(&load_point_id)
                .expect("PPN group node has an adjacency entry")
            {
                if visited.insert(neighbor) {
                    frontier.push(neighbor);
                }
            }
        }
        component_ids.sort_unstable();
        let component_id_set = component_ids.iter().copied().collect::<BTreeSet<_>>();
        let component_edges = edges
            .iter()
            .filter(|edge| {
                component_id_set.contains(&edge.from_load_point_id)
                    && component_id_set.contains(&edge.to_load_point_id)
            })
            .cloned()
            .collect();
        components.push(TipLevelRegionComponent {
            load_point_ids: component_ids,
            edges: component_edges,
        });
    }
    components
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

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
        let Some(first) = graph.nodes.first() else {
            return true;
        };
        let mut reached = BTreeSet::from([first.load_point_id]);
        let mut frontier = vec![first.load_point_id];
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
        reached.len() == graph.nodes.len()
    }

    #[test]
    fn empty_and_single_node_graphs_have_no_edges() {
        assert!(build_spatial_neighborhood(&[]).edges.is_empty());

        let graph = build_spatial_neighborhood(&[point(4, 1.25, -2.5)]);
        assert_eq!(graph.nodes[0].load_point_id, 4);
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
    fn boundary_point_blocks_an_edge() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 2.0, 1.0),
            point(3, 1.0, 0.0),
        ]);

        assert!(!pairs(&graph).contains(&(1, 2)));
    }

    #[test]
    fn coincident_sites_stay_connected_to_each_other_and_other_sites() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 0.0, 0.0),
            point(3, 1.0, 0.0),
        ]);

        assert_eq!(pairs(&graph), vec![(1, 2), (1, 3), (2, 3)]);
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
                pile_size_mm,
                pile_tip_level_m,
                is_option,
                governing_cpt_id: Some(1),
                governing_frd_kn: Some(500.0),
                utilization: Some(0.5),
                missing_cpt_ids: Vec::new(),
            }
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
                        pile_tip_level_m: -18.0004,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 400,
                        pile_tip_level_m: -18.0001,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -19.0,
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
            assert_eq!(topology.groups[0].pile_tip_level_m_key, -18_000);
            assert_eq!(topology.groups[0].legend_value_m, -18.00049);
            assert_eq!(topology.groups[0].components[0].load_point_ids, vec![1, 2]);
            assert_eq!(topology.groups[0].components[0].edges.len(), 1);
            assert_eq!(topology.groups[1].pile_tip_level_m_key, -19_000);
            assert_eq!(topology.groups[1].components[0].load_point_ids, vec![3]);
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
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    4,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    5,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
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
            assert_eq!(topology.groups[0].components[0].load_point_ids, vec![5]);
            assert!(topology.groups[0].components[0].edges.is_empty());
        }

        #[test]
        fn equal_ppn_nodes_split_into_components_when_no_equal_ppn_edge_connects_them() {
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
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -19.0,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
                    },
                ),
            ]);
            let options = HashMap::from([
                (1, vec![option(320, -18.0, true)]),
                (2, vec![option(320, -19.0, true)]),
                (3, vec![option(320, -18.0, true)]),
            ]);

            let topology = build_tip_level_region_topology(&neighborhood, &assignments, &options);

            assert_eq!(topology.groups[0].components.len(), 2);
            assert_eq!(topology.groups[0].components[0].load_point_ids, vec![1]);
            assert_eq!(topology.groups[0].components[1].load_point_ids, vec![3]);
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
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    2,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
                    },
                ),
                (
                    3,
                    SpatialPileAssignment {
                        pile_size_mm: 320,
                        pile_tip_level_m: -18.0,
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
                        pile_tip_level_m: -18.0,
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
            assert_eq!(
                forward.groups[0].components[0].load_point_ids,
                vec![1, 2, 3]
            );
            assert_eq!(forward.groups[0].components[0].edges.len(), 2);
        }
    }
}
