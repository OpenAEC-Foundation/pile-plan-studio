use std::collections::BTreeSet;

use crate::analysis::LoadPoint;

use super::{GabrielGraph, GeometricSite, SiteEdge};

pub(super) fn build_gabriel_graph(load_points: &[LoadPoint]) -> GabrielGraph {
    let mut ordered_load_points = load_points.to_vec();
    ordered_load_points.sort_by_key(|load_point| load_point.id);

    let mut sites: Vec<GeometricSite> = Vec::new();
    for load_point in ordered_load_points {
        if let Some(site) = sites
            .iter_mut()
            .find(|site| site.x_mm == load_point.x_mm && site.y_mm == load_point.y_mm)
        {
            site.load_point_ids.push(load_point.id);
        } else {
            sites.push(GeometricSite {
                site_id: load_point.id,
                x_mm: load_point.x_mm,
                y_mm: load_point.y_mm,
                load_point_ids: vec![load_point.id],
            });
        }
    }
    sites.sort_by_key(|site| site.site_id);

    let mut edge_pairs = BTreeSet::new();
    for first_index in 0..sites.len() {
        for second_index in first_index + 1..sites.len() {
            let first = &sites[first_index];
            let second = &sites[second_index];
            let blocked = sites.iter().enumerate().any(|(site_index, site)| {
                site_index != first_index
                    && site_index != second_index
                    && (site.x_mm - first.x_mm) * (site.x_mm - second.x_mm)
                        + (site.y_mm - first.y_mm) * (site.y_mm - second.y_mm)
                        <= 0.0
            });
            if !blocked {
                edge_pairs.insert((first.site_id, second.site_id));
            }
        }
    }

    GabrielGraph {
        sites,
        edges: edge_pairs
            .into_iter()
            .map(|(from_site_id, to_site_id)| SiteEdge {
                from_site_id,
                to_site_id,
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
            .map(|edge| (edge.from_site_id, edge.to_site_id))
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
    fn coincident_load_points_share_one_stable_site() {
        let graph = build_gabriel_graph(&[node(8, 0.0, 0.0), node(3, 1.0, 0.0), node(2, 0.0, 0.0)]);

        assert_eq!(graph.sites.len(), 2);
        assert_eq!(graph.sites[0].site_id, 2);
        assert_eq!(graph.sites[0].load_point_ids, vec![2, 8]);
        assert_eq!(
            graph.edges,
            vec![super::super::SiteEdge {
                from_site_id: 2,
                to_site_id: 3,
            }]
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
                .sites
                .iter()
                .map(|site| (site.site_id, site.load_point_ids.clone()))
                .collect::<Vec<_>>(),
            reverse
                .sites
                .iter()
                .map(|site| (site.site_id, site.load_point_ids.clone()))
                .collect::<Vec<_>>()
        );
        assert_eq!(forward.edges, reverse.edges);
    }
}
