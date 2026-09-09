use std::collections::BTreeSet;

use crate::analysis::LoadPoint;

use super::{GabrielGraph, GeometricNode, LoadPointEdge};

pub(super) fn build_gabriel_graph(load_points: &[LoadPoint]) -> GabrielGraph {
    let mut nodes = load_points
        .iter()
        .map(|load_point| GeometricNode {
            load_point_id: load_point.id,
            x_mm: load_point.x_mm,
            y_mm: load_point.y_mm,
        })
        .collect::<Vec<_>>();
    nodes.sort_by_key(|node| node.load_point_id);

    let mut edge_pairs = BTreeSet::new();
    for first_index in 0..nodes.len() {
        for second_index in first_index + 1..nodes.len() {
            let first = &nodes[first_index];
            let second = &nodes[second_index];
            let blocked = nodes.iter().enumerate().any(|(node_index, node)| {
                node_index != first_index
                    && node_index != second_index
                    && (node.x_mm - first.x_mm) * (node.x_mm - second.x_mm)
                        + (node.y_mm - first.y_mm) * (node.y_mm - second.y_mm)
                        <= 0.0
            });
            if !blocked {
                edge_pairs.insert((first.load_point_id, second.load_point_id));
            }
        }
    }

    GabrielGraph {
        nodes,
        edges: edge_pairs
            .into_iter()
            .map(|(from_load_point_id, to_load_point_id)| LoadPointEdge {
                from_load_point_id,
                to_load_point_id,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::build_gabriel_graph;
    use crate::analysis::LoadPoint;

    fn node(load_point_id: u32, x_mm: f64, y_mm: f64) -> LoadPoint {
        LoadPoint {
            id: load_point_id,
            name: format!("LP {load_point_id}"),
            x_mm,
            y_mm,
            design_load_kn: 100.0,
        }
    }

    fn edge_pairs(load_points: &[LoadPoint]) -> Vec<(u32, u32)> {
        build_gabriel_graph(load_points)
            .edges
            .into_iter()
            .map(|edge| (edge.from_load_point_id, edge.to_load_point_id))
            .collect()
    }

    #[test]
    fn square_has_perimeter_edges_and_no_diagonals() {
        assert_eq!(
            edge_pairs(&[
                node(1, 0.0, 0.0),
                node(2, 1.0, 0.0),
                node(3, 1.0, 1.0),
                node(4, 0.0, 1.0),
            ]),
            vec![(1, 2), (1, 4), (2, 3), (3, 4)]
        );
    }

    #[test]
    fn point_on_diameter_circle_blocks_the_edge() {
        assert!(
            !edge_pairs(&[node(1, 0.0, 0.0), node(2, 4.0, 0.0), node(3, 2.0, 2.0),])
                .contains(&(1, 2))
        );
    }

    #[test]
    fn point_just_outside_diameter_circle_does_not_block_the_edge() {
        assert!(
            edge_pairs(&[node(1, 0.0, 0.0), node(2, 4.0, 0.0), node(3, 2.0, 2.01),])
                .contains(&(1, 2))
        );
    }

    #[test]
    fn graph_is_stable_for_permuted_input() {
        let forward = build_gabriel_graph(&[
            node(1, -2.0, 1.0),
            node(2, 0.0, 0.0),
            node(3, 2.0, 1.0),
            node(4, 0.0, 3.0),
        ]);
        let reverse = build_gabriel_graph(&[
            node(4, 0.0, 3.0),
            node(3, 2.0, 1.0),
            node(2, 0.0, 0.0),
            node(1, -2.0, 1.0),
        ]);

        assert_eq!(
            forward
                .nodes
                .iter()
                .map(|node| node.load_point_id)
                .collect::<Vec<_>>(),
            reverse
                .nodes
                .iter()
                .map(|node| node.load_point_id)
                .collect::<Vec<_>>()
        );
        assert_eq!(forward.edges, reverse.edges);
    }
}
