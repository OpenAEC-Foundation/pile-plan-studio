use std::collections::{BTreeMap, BTreeSet};

use super::{GabrielGraph, GeometricNode, LoadPointFace};

pub(super) fn extract_bounded_faces(graph: &GabrielGraph) -> Vec<LoadPointFace> {
    let nodes_by_id = graph
        .nodes
        .iter()
        .map(|node| (node.load_point_id, node))
        .collect::<BTreeMap<_, _>>();
    let mut neighbors = graph
        .nodes
        .iter()
        .map(|node| (node.load_point_id, Vec::new()))
        .collect::<BTreeMap<_, Vec<u32>>>();
    for edge in &graph.edges {
        neighbors
            .get_mut(&edge.from_load_point_id)
            .expect("edge start belongs to graph")
            .push(edge.to_load_point_id);
        neighbors
            .get_mut(&edge.to_load_point_id)
            .expect("edge end belongs to graph")
            .push(edge.from_load_point_id);
    }
    for (&load_point_id, node_neighbors) in &mut neighbors {
        let origin = nodes_by_id[&load_point_id];
        node_neighbors.sort_by(|left_id, right_id| {
            let left = nodes_by_id[left_id];
            let right = nodes_by_id[right_id];
            let left_angle = (left.y_mm - origin.y_mm).atan2(left.x_mm - origin.x_mm);
            let right_angle = (right.y_mm - origin.y_mm).atan2(right.x_mm - origin.x_mm);
            left_angle
                .total_cmp(&right_angle)
                .then_with(|| left_id.cmp(right_id))
        });
    }

    let mut visited = BTreeSet::new();
    let mut faces = Vec::new();
    for (&from_load_point_id, node_neighbors) in &neighbors {
        for &to_load_point_id in node_neighbors {
            let start = (from_load_point_id, to_load_point_id);
            if visited.contains(&start) {
                continue;
            }

            let mut current = start;
            let mut boundary = Vec::new();
            let mut local = BTreeSet::new();
            let completed = loop {
                if !local.insert(current) {
                    break false;
                }
                visited.insert(current);
                boundary.push(current.0);

                let next_neighbors = &neighbors[&current.1];
                let incoming_index = next_neighbors
                    .iter()
                    .position(|&neighbor| neighbor == current.0)
                    .expect("undirected edge has a reverse adjacency");
                let clockwise_index =
                    (incoming_index + next_neighbors.len() - 1) % next_neighbors.len();
                current = (current.1, next_neighbors[clockwise_index]);
                if current == start {
                    break true;
                }
            };

            if completed
                && boundary.len() >= 3
                && translated_signed_area(&boundary, &nodes_by_id) > 0.0
            {
                canonicalize_boundary(&mut boundary);
                faces.push(LoadPointFace {
                    boundary_load_point_ids: boundary,
                });
            }
        }
    }
    faces.sort_by(|left, right| {
        left.boundary_load_point_ids
            .cmp(&right.boundary_load_point_ids)
    });
    faces.dedup();
    faces
}

fn translated_signed_area(boundary: &[u32], nodes_by_id: &BTreeMap<u32, &GeometricNode>) -> f64 {
    let origin = nodes_by_id[&boundary[0]];
    boundary
        .iter()
        .zip(boundary.iter().cycle().skip(1))
        .map(|(from_id, to_id)| {
            let from = nodes_by_id[from_id];
            let to = nodes_by_id[to_id];
            let from_x = from.x_mm - origin.x_mm;
            let from_y = from.y_mm - origin.y_mm;
            let to_x = to.x_mm - origin.x_mm;
            let to_y = to.y_mm - origin.y_mm;
            from_x * to_y - to_x * from_y
        })
        .sum::<f64>()
        / 2.0
}

fn canonicalize_boundary(boundary: &mut Vec<u32>) {
    let minimum_index = boundary
        .iter()
        .enumerate()
        .min_by_key(|(_, load_point_id)| *load_point_id)
        .map(|(index, _)| index)
        .expect("face boundary is non-empty");
    boundary.rotate_left(minimum_index);
}

#[cfg(test)]
mod tests {
    use super::super::{GabrielGraph, GeometricNode, LoadPointEdge, LoadPointFace};
    use super::extract_bounded_faces;

    fn node(load_point_id: u32, x_mm: f64, y_mm: f64) -> GeometricNode {
        GeometricNode {
            load_point_id,
            x_mm,
            y_mm,
        }
    }

    fn edge(from_load_point_id: u32, to_load_point_id: u32) -> LoadPointEdge {
        LoadPointEdge {
            from_load_point_id,
            to_load_point_id,
        }
    }

    #[test]
    fn extracts_two_elementary_faces_without_the_outer_face() {
        let graph = GabrielGraph {
            nodes: vec![
                node(1, 0.0, 0.0),
                node(2, 2.0, 0.0),
                node(3, 2.0, 2.0),
                node(4, 0.0, 2.0),
            ],
            edges: vec![edge(1, 2), edge(1, 3), edge(1, 4), edge(2, 3), edge(3, 4)],
        };

        assert_eq!(
            extract_bounded_faces(&graph),
            vec![
                LoadPointFace {
                    boundary_load_point_ids: vec![1, 2, 3],
                },
                LoadPointFace {
                    boundary_load_point_ids: vec![1, 3, 4],
                },
            ]
        );
    }

    #[test]
    fn ignores_tree_bridges_and_collinear_cycles() {
        let tree = GabrielGraph {
            nodes: vec![node(1, 0.0, 0.0), node(2, 1.0, 0.0), node(3, 2.0, 0.0)],
            edges: vec![edge(1, 2), edge(2, 3)],
        };
        let collinear_cycle = GabrielGraph {
            nodes: vec![node(1, 0.0, 0.0), node(2, 1.0, 0.0), node(3, 2.0, 0.0)],
            edges: vec![edge(1, 2), edge(1, 3), edge(2, 3)],
        };

        assert!(extract_bounded_faces(&tree).is_empty());
        assert!(extract_bounded_faces(&collinear_cycle).is_empty());
    }

    #[test]
    fn translated_signed_area_preserves_a_large_coordinate_face() {
        let graph = GabrielGraph {
            nodes: vec![
                node(1, 1_000_000_000.0, 1_000_000_000.0),
                node(2, 1_000_000_001.0, 1_000_000_000.0),
                node(3, 1_000_000_000.0, 1_000_000_001.0),
            ],
            edges: vec![edge(1, 2), edge(1, 3), edge(2, 3)],
        };

        assert_eq!(
            extract_bounded_faces(&graph),
            vec![LoadPointFace {
                boundary_load_point_ids: vec![1, 2, 3],
            }]
        );
    }
}
