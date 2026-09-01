use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::analysis::{LoadPoint, PileConfigurationOption};
use crate::pile_configuration::pile_tip_level_mm;
#[cfg(test)]
use crate::pile_configuration::PileConfigurationKey;

mod faces;
mod gabriel;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialSite {
    pub site_id: u32,
    pub load_point_ids: Vec<u32>,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct SpatialEdge {
    pub from_site_id: u32,
    pub to_site_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpatialFace {
    pub boundary_site_ids: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpatialNeighborhood {
    pub sites: Vec<SpatialSite>,
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
    pub site_ids: Vec<u32>,
    pub edges: Vec<SpatialEdge>,
    pub faces: Vec<SpatialFace>,
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

fn build_gabriel_embedding(load_points: &[LoadPoint]) -> GabrielEmbedding {
    let graph = gabriel::build_gabriel_graph(load_points);
    let faces = faces::extract_bounded_faces(&graph);
    GabrielEmbedding { graph, faces }
}

pub fn build_spatial_neighborhood(load_points: &[LoadPoint]) -> SpatialNeighborhood {
    let GabrielEmbedding { graph, faces } = build_gabriel_embedding(load_points);

    SpatialNeighborhood {
        sites: graph
            .sites
            .into_iter()
            .map(|site| SpatialSite {
                site_id: site.site_id,
                load_point_ids: site.load_point_ids,
                x_mm: site.x_mm,
                y_mm: site.y_mm,
            })
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .map(|edge| SpatialEdge {
                from_site_id: edge.from_site_id,
                to_site_id: edge.to_site_id,
            })
            .collect(),
        faces: faces
            .into_iter()
            .map(|face| SpatialFace {
                boundary_site_ids: face.boundary_site_ids,
            })
            .collect(),
    }
}

pub fn build_tip_level_region_topology(
    neighborhood: &SpatialNeighborhood,
    selected_assignments: &HashMap<u32, SpatialPileAssignment>,
    options_by_load_point: &HashMap<u32, Vec<PileConfigurationOption>>,
) -> TipLevelRegionTopology {
    let mut valid_assignments = BTreeMap::new();
    for site in &neighborhood.sites {
        for &load_point_id in &site.load_point_ids {
            let Some(assignment) = selected_assignments.get(&load_point_id) else {
                continue;
            };
            let assignment_key = assignment.pile_tip_level_mm;
            let Some(matched_option) = options_by_load_point
                .get(&load_point_id)
                .into_iter()
                .flatten()
                .find(|option| {
                    option.is_option
                        && option.pile_size_mm == assignment.pile_size_mm
                        && pile_tip_level_mm(option.pile_tip_level_m) == assignment_key
                })
            else {
                continue;
            };
            valid_assignments.insert(
                load_point_id,
                (assignment_key, matched_option.pile_tip_level_m),
            );
        }
    }

    let mut site_keys: BTreeMap<u32, BTreeSet<i64>> = BTreeMap::new();
    let mut load_point_ids_by_key: BTreeMap<i64, Vec<u32>> = BTreeMap::new();
    for site in &neighborhood.sites {
        let keys = site_keys.entry(site.site_id).or_default();
        for &load_point_id in &site.load_point_ids {
            if let Some(&(key, _)) = valid_assignments.get(&load_point_id) {
                keys.insert(key);
                load_point_ids_by_key
                    .entry(key)
                    .or_default()
                    .push(load_point_id);
            }
        }
    }

    let mut groups = Vec::with_capacity(load_point_ids_by_key.len());
    for (key, load_point_ids) in load_point_ids_by_key.into_iter().rev() {
        let site_ids = neighborhood
            .sites
            .iter()
            .filter(|site| site_keys[&site.site_id].contains(&key))
            .map(|site| site.site_id)
            .collect::<Vec<_>>();
        let edges = neighborhood
            .edges
            .iter()
            .filter(|edge| {
                site_keys[&edge.from_site_id].contains(&key)
                    && site_keys[&edge.to_site_id].contains(&key)
            })
            .cloned()
            .collect::<Vec<_>>();
        let faces = neighborhood
            .faces
            .iter()
            .filter(|face| {
                face.boundary_site_ids.iter().all(|site_id| {
                    neighborhood
                        .sites
                        .iter()
                        .find(|site| site.site_id == *site_id)
                        .expect("face site belongs to neighborhood")
                        .load_point_ids
                        .iter()
                        .all(|load_point_id| {
                            valid_assignments
                                .get(load_point_id)
                                .is_some_and(|(load_point_key, _)| *load_point_key == key)
                        })
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
            site_ids,
            edges,
            faces,
        });
    }

    TipLevelRegionTopology { groups }
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
            .map(|edge| (edge.from_site_id, edge.to_site_id))
            .collect()
    }

    fn is_connected(graph: &SpatialNeighborhood) -> bool {
        let Some(first) = graph.sites.first() else {
            return true;
        };
        let mut reached = BTreeSet::from([first.site_id]);
        let mut frontier = vec![first.site_id];
        while let Some(site_id) = frontier.pop() {
            for edge in &graph.edges {
                let neighbor = if edge.from_site_id == site_id {
                    Some(edge.to_site_id)
                } else if edge.to_site_id == site_id {
                    Some(edge.from_site_id)
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
        reached.len() == graph.sites.len()
    }

    #[test]
    fn empty_and_single_node_graphs_have_no_edges() {
        assert!(build_spatial_neighborhood(&[]).edges.is_empty());

        let graph = build_spatial_neighborhood(&[point(4, 1.25, -2.5)]);
        assert_eq!(graph.sites[0].site_id, 4);
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
    fn neighborhood_exposes_geometric_sites_and_bounded_faces() {
        let graph = build_spatial_neighborhood(&[
            point(7, 0.0, 0.0),
            point(2, 0.0, 0.0),
            point(3, 2.0, 0.0),
            point(4, 1.0, 2.0),
        ]);

        assert_eq!(graph.sites[0].site_id, 2);
        assert_eq!(graph.sites[0].load_point_ids, vec![2, 7]);
        assert_eq!(graph.faces.len(), 1);
        assert_eq!(graph.faces[0].boundary_site_ids, vec![2, 3, 4]);
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
    fn coincident_load_points_share_one_site_connected_to_other_sites() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 0.0),
            point(2, 0.0, 0.0),
            point(3, 1.0, 0.0),
        ]);

        assert_eq!(graph.sites.len(), 2);
        assert_eq!(graph.sites[0].load_point_ids, vec![1, 2]);
        assert_eq!(pairs(&graph), vec![(1, 3)]);
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
        fn coincident_mixed_ppn_load_points_make_the_shared_face_unresolved() {
            let neighborhood = build_spatial_neighborhood(&[
                point(1, 0.0, 0.0),
                point(5, 0.0, 0.0),
                point(2, 2.0, 0.0),
                point(3, 1.0, 2.0),
            ]);
            let assignments = HashMap::from([
                (1, assignment(-18.0)),
                (5, assignment(-19.0)),
                (2, assignment(-18.0)),
                (3, assignment(-18.0)),
            ]);
            let options = HashMap::from([
                (1, vec![option(320, -18.0, true)]),
                (5, vec![option(320, -19.0, true)]),
                (2, vec![option(320, -18.0, true)]),
                (3, vec![option(320, -18.0, true)]),
            ]);

            let topology = build_tip_level_region_topology(&neighborhood, &assignments, &options);

            assert!(topology.groups.iter().all(|group| group.faces.is_empty()));
            assert_eq!(topology.groups[0].site_ids, vec![1, 2, 3]);
            assert_eq!(topology.groups[0].edges.len(), 3);
            assert_eq!(topology.groups[1].site_ids, vec![1]);
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
            assert_eq!(topology.groups[0].site_ids, vec![1, 2]);
            assert_eq!(topology.groups[0].edges.len(), 1);
            assert_eq!(topology.groups[1].pile_tip_level_mm, -19_000);
            assert_eq!(topology.groups[1].site_ids, vec![3]);
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
            assert_eq!(topology.groups[0].site_ids, vec![5]);
            assert!(topology.groups[0].edges.is_empty());
        }

        #[test]
        fn equal_ppn_sites_keep_only_edges_whose_endpoints_share_the_ppn() {
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

            assert_eq!(topology.groups[0].site_ids, vec![1, 3]);
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
            assert_eq!(forward.groups[0].site_ids, vec![1, 2, 3]);
            assert_eq!(forward.groups[0].edges.len(), 2);
        }
    }
}
