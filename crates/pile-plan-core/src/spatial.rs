use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::analysis::LoadPoint;

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

#[derive(Debug)]
struct GeometricSite {
    x_mm: f64,
    y_mm: f64,
    load_point_ids: Vec<u32>,
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

    let mut sites: Vec<GeometricSite> = Vec::new();
    for node in &nodes {
        if let Some(site) = sites
            .iter_mut()
            .find(|site| site.x_mm == node.x_mm && site.y_mm == node.y_mm)
        {
            site.load_point_ids.push(node.load_point_id);
        } else {
            sites.push(GeometricSite {
                x_mm: node.x_mm,
                y_mm: node.y_mm,
                load_point_ids: vec![node.load_point_id],
            });
        }
    }

    let mut edge_pairs = BTreeSet::new();
    for site in &sites {
        for (index, &from_id) in site.load_point_ids.iter().enumerate() {
            for &to_id in &site.load_point_ids[index + 1..] {
                edge_pairs.insert(normalized_edge_pair(from_id, to_id));
            }
        }
    }

    for first_index in 0..sites.len() {
        for second_index in first_index + 1..sites.len() {
            let first = &sites[first_index];
            let second = &sites[second_index];
            let min_x = first.x_mm.min(second.x_mm);
            let max_x = first.x_mm.max(second.x_mm);
            let min_y = first.y_mm.min(second.y_mm);
            let max_y = first.y_mm.max(second.y_mm);
            let blocked = sites.iter().enumerate().any(|(site_index, site)| {
                site_index != first_index
                    && site_index != second_index
                    && site.x_mm >= min_x
                    && site.x_mm <= max_x
                    && site.y_mm >= min_y
                    && site.y_mm <= max_y
            });
            if blocked {
                continue;
            }

            for &from_id in &first.load_point_ids {
                for &to_id in &second.load_point_ids {
                    edge_pairs.insert(normalized_edge_pair(from_id, to_id));
                }
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn plus_shape_keeps_both_crossing_axis_edges() {
        let graph = build_spatial_neighborhood(&[
            point(1, 0.0, 1.0),
            point(2, 0.0, -1.0),
            point(3, 1.0, 0.0),
            point(4, -1.0, 0.0),
        ]);

        assert!(pairs(&graph).contains(&(1, 2)));
        assert!(pairs(&graph).contains(&(3, 4)));
        assert!(is_connected(&graph));
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
}
