use std::collections::{BTreeMap, BTreeSet};

use super::{GabrielGraph, GeometricSite, SiteFace};

pub(super) fn extract_bounded_faces(graph: &GabrielGraph) -> Vec<SiteFace> {
    let sites_by_id = graph
        .sites
        .iter()
        .map(|site| (site.site_id, site))
        .collect::<BTreeMap<_, _>>();
    let mut neighbors = graph
        .sites
        .iter()
        .map(|site| (site.site_id, Vec::new()))
        .collect::<BTreeMap<_, Vec<u32>>>();
    for edge in &graph.edges {
        neighbors
            .get_mut(&edge.from_site_id)
            .expect("edge start belongs to graph")
            .push(edge.to_site_id);
        neighbors
            .get_mut(&edge.to_site_id)
            .expect("edge end belongs to graph")
            .push(edge.from_site_id);
    }
    for (&site_id, site_neighbors) in &mut neighbors {
        let origin = sites_by_id[&site_id];
        site_neighbors.sort_by(|left_id, right_id| {
            let left = sites_by_id[left_id];
            let right = sites_by_id[right_id];
            let left_angle = (left.y_mm - origin.y_mm).atan2(left.x_mm - origin.x_mm);
            let right_angle = (right.y_mm - origin.y_mm).atan2(right.x_mm - origin.x_mm);
            left_angle
                .total_cmp(&right_angle)
                .then_with(|| left_id.cmp(right_id))
        });
    }

    let mut visited = BTreeSet::new();
    let mut faces = Vec::new();
    for (&from_site_id, site_neighbors) in &neighbors {
        for &to_site_id in site_neighbors {
            let start = (from_site_id, to_site_id);
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
                && translated_signed_area(&boundary, &sites_by_id) > 0.0
            {
                canonicalize_boundary(&mut boundary);
                faces.push(SiteFace {
                    boundary_site_ids: boundary,
                });
            }
        }
    }
    faces.sort_by(|left, right| left.boundary_site_ids.cmp(&right.boundary_site_ids));
    faces.dedup();
    faces
}

fn translated_signed_area(boundary: &[u32], sites_by_id: &BTreeMap<u32, &GeometricSite>) -> f64 {
    let origin = sites_by_id[&boundary[0]];
    boundary
        .iter()
        .zip(boundary.iter().cycle().skip(1))
        .map(|(from_id, to_id)| {
            let from = sites_by_id[from_id];
            let to = sites_by_id[to_id];
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
        .min_by_key(|(_, site_id)| *site_id)
        .map(|(index, _)| index)
        .expect("face boundary is non-empty");
    boundary.rotate_left(minimum_index);
}

#[cfg(test)]
mod tests {
    use super::super::{GabrielGraph, GeometricSite, SiteEdge, SiteFace};
    use super::extract_bounded_faces;

    fn site(site_id: u32, x_mm: f64, y_mm: f64) -> GeometricSite {
        GeometricSite {
            site_id,
            x_mm,
            y_mm,
            load_point_ids: vec![site_id],
        }
    }

    fn edge(from_site_id: u32, to_site_id: u32) -> SiteEdge {
        SiteEdge {
            from_site_id,
            to_site_id,
        }
    }

    #[test]
    fn extracts_two_elementary_faces_without_the_outer_face() {
        let graph = GabrielGraph {
            sites: vec![
                site(1, 0.0, 0.0),
                site(2, 2.0, 0.0),
                site(3, 2.0, 2.0),
                site(4, 0.0, 2.0),
            ],
            edges: vec![edge(1, 2), edge(1, 3), edge(1, 4), edge(2, 3), edge(3, 4)],
        };

        assert_eq!(
            extract_bounded_faces(&graph),
            vec![
                SiteFace {
                    boundary_site_ids: vec![1, 2, 3],
                },
                SiteFace {
                    boundary_site_ids: vec![1, 3, 4],
                },
            ]
        );
    }

    #[test]
    fn ignores_tree_bridges_and_collinear_cycles() {
        let tree = GabrielGraph {
            sites: vec![site(1, 0.0, 0.0), site(2, 1.0, 0.0), site(3, 2.0, 0.0)],
            edges: vec![edge(1, 2), edge(2, 3)],
        };
        let collinear_cycle = GabrielGraph {
            sites: vec![site(1, 0.0, 0.0), site(2, 1.0, 0.0), site(3, 2.0, 0.0)],
            edges: vec![edge(1, 2), edge(1, 3), edge(2, 3)],
        };

        assert!(extract_bounded_faces(&tree).is_empty());
        assert!(extract_bounded_faces(&collinear_cycle).is_empty());
    }

    #[test]
    fn translated_signed_area_preserves_a_large_coordinate_face() {
        let graph = GabrielGraph {
            sites: vec![
                site(1, 1_000_000_000.0, 1_000_000_000.0),
                site(2, 1_000_000_001.0, 1_000_000_000.0),
                site(3, 1_000_000_000.0, 1_000_000_001.0),
            ],
            edges: vec![edge(1, 2), edge(1, 3), edge(2, 3)],
        };

        assert_eq!(
            extract_bounded_faces(&graph),
            vec![SiteFace {
                boundary_site_ids: vec![1, 2, 3],
            }]
        );
    }
}
