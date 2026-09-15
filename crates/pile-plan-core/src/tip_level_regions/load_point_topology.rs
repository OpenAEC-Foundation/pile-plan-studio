use crate::source_data::LoadPoint;

use super::{faces, gabriel, GabrielEmbedding, LoadPointEdge, LoadPointFace, LoadPointTopology};

fn build_gabriel_embedding(load_points: &[LoadPoint]) -> GabrielEmbedding {
    let graph = gabriel::build_gabriel_graph(load_points);
    let faces = faces::extract_bounded_faces(&graph);
    GabrielEmbedding { graph, faces }
}

pub fn build_load_point_topology(load_points: &[LoadPoint]) -> LoadPointTopology {
    let GabrielEmbedding { graph, faces } = build_gabriel_embedding(load_points);

    LoadPointTopology {
        load_point_ids: graph
            .nodes
            .into_iter()
            .map(|node| node.load_point_id)
            .collect(),
        edges: graph
            .edges
            .into_iter()
            .map(|edge| LoadPointEdge {
                from_load_point_id: edge.from_load_point_id,
                to_load_point_id: edge.to_load_point_id,
            })
            .collect(),
        faces: faces
            .into_iter()
            .map(|face| LoadPointFace {
                boundary_load_point_ids: face.boundary_load_point_ids,
            })
            .collect(),
    }
}
