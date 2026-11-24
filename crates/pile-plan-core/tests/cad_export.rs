use opencaddocument::{Dwg, Dxf, EntityType, Format, Ifcx, Vector3};
use pile_plan_core::cad_export::{
    build_document, export_drawing, CadDrawing, CadExportOptions, CadFormat, CadLegend,
    CadNumbering, CadPile, CadPoint, CadRegion, CadShape, CadSymbols, CadViewerSymbol,
};

#[test]
fn tip_level_label_moves_away_from_piles_and_stays_out_of_holes() {
    let drawing = CadDrawing {
        project: "Palenplan".into(),
        plan: "Variant".into(),
        piles: [4500., 6500., 8500.]
            .into_iter()
            .enumerate()
            .map(|(id, x)| CadPile {
                id: id as u32 + 1,
                mark: None,
                position: [x, 7700.],
                size_mm: Some(290),
                shape: CadShape::Square,
            })
            .collect(),
        cpts: vec![CadPoint {
            name: "CPT 1".into(),
            position: [6000., 5400.],
        }],
        regions: vec![CadRegion {
            label: "-18,25 m".into(),
            color: [220, 200, 200],
            areas: vec![
                vec![
                    vec![[0., 0.], [12000., 0.], [12000., 8000.], [0., 8000.]],
                    vec![
                        [1000., 3850.],
                        [1000., 6700.],
                        [11000., 6700.],
                        [11000., 3850.],
                    ],
                ],
                vec![vec![
                    [13000., 2000.],
                    [13160., 2000.],
                    [13160., 2800.],
                    [13000., 2800.],
                ]],
            ],
        }],
        piles_label: "Palen".into(),
        regions_label: "Paalpuntniveaus".into(),
        unassigned_label: "Niet toegewezen".into(),
        legend: CadLegend::default(),
        numbering: Default::default(),
        options: Default::default(),
        viewer_symbols: vec![],
    };
    let document = build_document(&drawing).unwrap();
    let labels: Vec<_> = document
        .model_space_entities()
        .filter_map(|entity| match entity {
            EntityType::Text(text) if text.common.layer == "Tip-level labels" => Some(text),
            _ => None,
        })
        .collect();
    assert_eq!(labels.len(), 2, "each connected area should have a label");
    let label = labels[0];
    assert_eq!(label.value, "-18,25 m");
    assert!(
        (1000. ..3500.).contains(&label.insertion_point.y),
        "label should use the open lower half, got {:?}",
        label.insertion_point
    );
    assert_eq!(labels[1].value, "Z1");
    assert!((13000. ..13160.).contains(&labels[1].insertion_point.x));
}

#[test]
fn pdf_plots_the_same_plan_as_a_landscape_vector_drawing() {
    let drawing = drawing_with_region_hole();
    let pdf = export_drawing(&drawing, CadFormat::Pdf).unwrap();
    assert!(pdf.starts_with(b"%PDF-"));
    let structure = String::from_utf8_lossy(&pdf);
    assert!(structure.contains("/MediaBox [0 0 3370"));
    assert!(structure.contains("/ToUnicode"));
    assert!(structure.contains("/Count 1"));
    assert!(!structure.contains("/Subtype /Image"));
}

#[test]
fn ifccad_export_matches_the_profile_in_open_cad_studio_2026_47() {
    let drawing = drawing_with_region_hole();
    let encoded = export_drawing(&drawing, CadFormat::Ifccad).unwrap();
    let json: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
    assert!(json["imports"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| { entry["uri"] == "urn:example:ifccad:0.12.0" }));
}

#[test]
fn drawing_options_change_numbering_symbols_and_sonderingen() {
    let mut drawing = drawing_with_region_hole();
    drawing.piles[1].position = [4000., 3500.];
    drawing.piles.push(CadPile {
        id: 166,
        mark: None,
        position: [4200., 2200.],
        size_mm: None,
        shape: CadShape::Unassigned,
    });
    drawing.cpts.push(CadPoint {
        name: "CPT distant".into(),
        position: [100000., 18000.],
    });
    drawing.options = CadExportOptions {
        numbering: CadNumbering::LocationNumber,
        include_cpts: false,
        symbols: CadSymbols::Viewer,
        ..Default::default()
    };
    drawing.viewer_symbols = vec![
        CadViewerSymbol {
            size_mm: 450,
            outline: vec![[0., 1.], [-1., -1.], [1., -1.]],
            fill: vec![[0., 1.], [-0.5, 0.], [0.5, 0.]],
        },
        CadViewerSymbol {
            size_mm: 500,
            outline: vec![[0., 1.], [-1., 0.], [0., -1.], [1., 0.]],
            fill: vec![[0., 1.], [-1., 0.], [0., -1.], [1., 0.]],
        },
    ];
    let document = build_document(&drawing).unwrap();
    let labels: Vec<_> = document
        .model_space_entities()
        .filter_map(|entity| match entity {
            EntityType::Text(text) if text.common.layer == "Labels" => Some(text.value.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(labels, ["101", "102", "166"]);
    assert!(!document.model_space_entities().any(|entity| match entity {
        EntityType::Text(text) => text.value.contains("CPT distant") || text.value == "Sondering",
        EntityType::Insert(symbol) => symbol.block_name == "CPT",
        _ => false,
    }));
    for (block, count) in [("PILE_ROUND_450", 3), ("PILE_ROUND_500", 4)] {
        let shapes: Vec<_> = document.entities_in_block(block).collect();
        assert!(
            matches!(shapes.as_slice(), [EntityType::Hatch(_), EntityType::LwPolyline(polyline)]
            if polyline.is_closed && polyline.vertices.len() == count)
        );
        assert!(document.model_space_entities().any(|entity|
            matches!(entity, EntityType::Insert(insert) if insert.block_name == block && insert.common.layer == "Legend")));
    }
}

#[test]
fn quadrant_overrides_apply_to_the_same_blocks_in_the_plan_and_legend() {
    let mut drawing = drawing_with_region_hole();
    drawing.options = serde_json::from_str(
        r#"{
        "quadrant_symbols": [
            {"size_mm":450,"shape":"round","quadrants":15},
            {"size_mm":500,"shape":"round","quadrants":0}
        ]
    }"#,
    )
    .unwrap();
    let document = build_document(&drawing).unwrap();
    for (block, filled_quadrants) in [("PILE_ROUND_450", 4), ("PILE_ROUND_500", 0)] {
        assert_eq!(
            document
                .entities_in_block(block)
                .filter(|entity| matches!(entity, EntityType::Hatch(_)))
                .count(),
            filled_quadrants
        );
        for layer in ["Piles", "Legend"] {
            assert!(document.model_space_entities().any(|entity| matches!(entity,
                EntityType::Insert(insert) if insert.block_name == block && insert.common.layer == layer
            )));
        }
    }
}

#[test]
fn compact_numbers_use_smaller_text_without_changing_other_labels() {
    let mut drawing = drawing_with_region_hole();
    let standard = build_document(&drawing).unwrap();
    drawing.options.number_size = pile_plan_core::cad_export::CadNumberSize::Compact;
    let compact = build_document(&drawing).unwrap();
    let heights = |doc: &opencaddocument::Document, layer: &str| {
        doc.model_space_entities()
            .filter_map(|entity| match entity {
                EntityType::Text(text) if text.common.layer == layer => Some(text.height),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(heights(&standard, "Labels"), vec![25.; 2]);
    assert_eq!(heights(&compact, "Labels"), vec![21.; 2]);
    assert_eq!(
        heights(&standard, "Tip-level labels"),
        heights(&compact, "Tip-level labels")
    );
}

#[test]
fn outlines_keep_region_contours_and_levels_without_color_fills() {
    let mut drawing = drawing_with_region_hole();
    drawing.options.region_display = pile_plan_core::cad_export::CadRegionDisplay::Outlines;
    let document = build_document(&drawing).unwrap();
    let count = |layer| {
        document.model_space_entities().filter(|entity| {
            matches!(entity, EntityType::LwPolyline(line) if line.common.layer == layer)
        }).count()
    };
    assert_eq!(count("Tip-level outlines"), 2);
    assert!(document.model_space_entities().any(|entity| {
        matches!(entity, EntityType::Text(text) if text.common.layer == "Tip-level labels" && text.value == "-17,5 m")
    }));
    assert!(!document
        .model_space_entities()
        .any(|entity| matches!(entity, EntityType::Hatch(_))));
}

#[test]
fn hiding_numbers_and_regions_keeps_pile_symbols_and_removes_the_region_legend() {
    let mut drawing = drawing_with_region_hole();
    drawing.options =
        serde_json::from_str(r#"{"numbering":"none","region_display":"hidden"}"#).unwrap();
    let document = build_document(&drawing).unwrap();
    let entities: Vec<_> = document.model_space_entities().collect();
    assert_eq!(
        entities
            .iter()
            .filter(|entity| {
                matches!(entity, EntityType::Insert(insert) if insert.common.layer == "Piles")
            })
            .count(),
        2
    );
    assert!(!entities.iter().any(|entity| match entity {
        EntityType::Hatch(_) => true,
        EntityType::LwPolyline(line) => line.common.layer == "Tip-level outlines",
        EntityType::Text(text) =>
            ["Labels", "Tip-level labels"].contains(&text.common.layer.as_str())
                || text.value == drawing.regions_label,
        _ => false,
    }));
}

#[test]
fn unplaceable_numbers_are_omitted_from_the_legend() {
    let mut drawing = drawing_with_region_hole();
    drawing.piles[0].position = drawing.piles[1].position;
    let document = build_document(&drawing).unwrap();
    assert!(!document.model_space_entities().any(|entity| {
        matches!(entity, EntityType::Text(text) if text.value.starts_with("X ") || text.value == "Posities op coördinaat")
    }));
}

fn drawing_with_region_hole() -> CadDrawing {
    CadDrawing {
        project: "Palenplan".into(),
        plan: "Variant".into(),
        piles: vec![
            CadPile {
                id: 101,
                mark: Some("P-101".into()),
                position: [2400., 3500.],
                size_mm: Some(450),
                shape: CadShape::Round,
            },
            CadPile {
                id: 102,
                mark: Some("P-102".into()),
                position: [4000., 3500.],
                size_mm: Some(500),
                shape: CadShape::Round,
            },
        ],
        cpts: vec![],
        regions: vec![CadRegion {
            label: "-17,5 m".into(),
            color: [212, 230, 242],
            areas: vec![vec![
                vec![[0., 0.], [5000., 0.], [5000., 5000.], [0., 5000.]],
                vec![
                    [1000., 1000.],
                    [1000., 2000.],
                    [2000., 2000.],
                    [2000., 1000.],
                ],
            ]],
        }],
        piles_label: "Palen".into(),
        regions_label: "Paalpuntniveaus".into(),
        unassigned_label: "Niet toegewezen".into(),
        legend: CadLegend {
            title: "Renvooi".into(),
            mark: "Merk".into(),
            size: "Afmeting".into(),
            count: "Aantal".into(),
            cpts: "Sondering".into(),
        },
        numbering: Default::default(),
        options: Default::default(),
        viewer_symbols: vec![],
    }
}

#[test]
fn editable_piles_and_region_holes_survive_conversion() {
    let drawing = drawing_with_region_hole();
    let document = build_document(&drawing).unwrap();
    let labels = document
        .model_space_entities()
        .filter_map(|entity| match entity {
            EntityType::Text(text) if text.common.layer == "Labels" => Some(text),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert!(!labels.is_empty());
    assert!(labels.iter().all(|label| label.style == "Pile Plan Text"));
    for format in [&Dwg as &dyn Format, &Dxf, &Ifcx] {
        let (bytes, losses) = format.write(&document).unwrap();
        assert!(losses.is_empty(), "{}: {losses:?}", format.name());
        let (decoded, _) = format.read(&bytes).unwrap();
        assert_eq!(decoded.header.insertion_units, 4);
        let quadrant_count = |block| {
            decoded
                .entities_in_block(block)
                .filter(|entity| matches!(entity, EntityType::Hatch(_)))
                .count()
        };
        assert_eq!(quadrant_count("PILE_ROUND_450"), 1);
        assert_eq!(quadrant_count("PILE_ROUND_500"), 2);
        assert!(decoded.model_space_entities().any(|entity|
            matches!(entity, EntityType::Insert(pile) if pile.insert_point == Vector3::new(2400., 3500., 0.))));
        assert!(decoded
            .model_space_entities()
            .any(|entity| matches!(entity, EntityType::Hatch(fill) if fill.paths.len() == 2)));
        assert!(decoded
            .model_space_entities()
            .any(|entity| matches!(entity, EntityType::Text(text) if text.value == "P-101")));
    }
}

#[test]
fn spacious_plans_keep_full_size_numbers_even_with_many_piles() {
    let mut drawing = drawing_with_region_hole();
    drawing.regions[0].areas = vec![vec![vec![
        [0., 0.],
        [200000., 0.],
        [200000., 100000.],
        [0., 100000.],
    ]]];
    drawing.piles = (0..1200)
        .map(|i| CadPile {
            id: i + 1,
            mark: None,
            position: [
                3000. + 4800. * f64::from(i % 40),
                3000. + 3100. * f64::from(i / 40),
            ],
            size_mm: Some(290),
            shape: CadShape::Square,
        })
        .collect();
    let text_heights = |drawing: &CadDrawing| {
        let document = build_document(drawing).unwrap();
        let height = |layer| {
            document
                .model_space_entities()
                .find_map(|entity| match entity {
                    EntityType::Text(text) if text.common.layer == layer => Some(text.height),
                    _ => None,
                })
                .unwrap()
        };
        (height("Labels"), height("Tip-level labels"))
    };
    let (large_numbers, large_levels) = text_heights(&drawing);
    drawing.piles.truncate(328);
    let (small_numbers, small_levels) = text_heights(&drawing);
    assert_eq!(large_numbers, small_numbers);
    assert_eq!(small_numbers, 2.5 * (200000. / 950.));
    assert_eq!(small_levels, large_levels);
}

#[test]
fn dense_wall_runs_use_aligned_numbering_on_rows_and_columns() {
    let mut drawing = drawing_with_region_hole();
    drawing.regions[0].areas = vec![vec![vec![
        [0., 0.],
        [131350., 0.],
        [131350., 85000.],
        [0., 85000.],
    ]]];
    drawing.regions[0].areas[0].push(vec![
        [9000., 15600.],
        [9000., 18700.],
        [18700., 18700.],
        [18700., 15600.],
    ]);
    drawing.piles = (0..8)
        .map(|index| (1001 + index, [10000. + f64::from(index) * 1100., 15000.]))
        .chain((0..7).map(|index| (2001 + index, [52700., 40000. + f64::from(index) * 1000.])))
        .map(|(id, position)| CadPile {
            id,
            mark: Some(id.to_string()),
            position,
            size_mm: Some(290),
            shape: CadShape::Square,
        })
        .collect();
    let document = build_document(&drawing).unwrap();
    let mut row_tracks = [None, None];
    let mut column_edge = None;
    for entity in document.model_space_entities() {
        let EntityType::Text(text) = entity else {
            continue;
        };
        if text.common.layer != "Labels" {
            continue;
        }
        let id = text.value.parse::<u32>().unwrap();
        if id < 2000 {
            let at = text.alignment_point.expect("number centered over pile");
            let source_x = 10000. + f64::from(id - 1001) * 1100.;
            assert!((at.x - source_x).abs() < 0.01);
            assert!(
                at.y + 1.23 * text.height <= 15600. || at.y - 0.32 * text.height >= 15600.,
                "pile number {id} crosses the area boundary"
            );
            let track = row_tracks[(id - 1001) as usize % 2].get_or_insert(at.y);
            assert!((at.y - *track).abs() < 0.01);
        } else {
            let at = text.insertion_point;
            let edge = column_edge.get_or_insert(at.x);
            assert!((at.x - *edge).abs() < 0.01);
            let source_y = 40000. + f64::from(id - 2001) * 1000.;
            assert!((at.y - source_y).abs() < 250.);
        }
    }
    assert!((row_tracks[0].unwrap() - 15000.) * (row_tracks[1].unwrap() - 15000.) < 0.);
    assert!(column_edge.is_some());
    assert_eq!(
        document
            .model_space_entities()
            .filter(|entity| {
                matches!(entity, EntityType::Text(text) if text.common.layer == "Labels")
            })
            .count(),
        drawing.piles.len()
    );
}

#[test]
fn close_parallel_pile_rows_use_aligned_external_labels() {
    let cluster = [
        (448, "5", [91500., 13550.]),
        (449, "3", [91500., 14650.]),
        (466, "7", [93700., 13550.]),
        (467, "4", [93700., 14650.]),
        (642, "6", [92600., 13550.]),
        (681, "002", [92600., 14650.]),
    ];
    let drawing = CadDrawing {
        project: "Palenplan".into(),
        plan: "Variant".into(),
        piles: cluster
            .iter()
            .map(|&(id, _, position)| CadPile {
                id,
                mark: (id == 681).then(|| "002".into()),
                position,
                size_mm: Some(290),
                shape: CadShape::Square,
            })
            .chain([CadPile {
                id: 900,
                mark: None,
                position: [91000., 21000.],
                size_mm: None,
                shape: CadShape::Unassigned,
            }])
            .collect(),
        cpts: vec![],
        regions: vec![CadRegion {
            label: "-17,5 m".into(),
            color: [212, 230, 242],
            areas: vec![vec![vec![
                [9450., 0.],
                [140800., 0.],
                [140800., 25000.],
                [9450., 25000.],
            ]]],
        }],
        piles_label: "Palen".into(),
        regions_label: "Paalpuntniveaus".into(),
        unassigned_label: "Niet toegewezen".into(),
        legend: CadLegend::default(),
        numbering: pile_plan_core::PileMarkOptions {
            start: 2,
            ..Default::default()
        },
        options: Default::default(),
        viewer_symbols: vec![],
    };
    let document = build_document(&drawing).unwrap();
    for format in [&Dwg as &dyn Format, &Dxf, &Ifcx] {
        let (bytes, losses) = format.write(&document).unwrap();
        assert!(losses.is_empty());
        let (decoded, _) = format.read(&bytes).unwrap();
        assert_eq!(
            decoded
                .model_space_entities()
                .filter(|entity| {
                    matches!(entity, EntityType::Text(text) if text.common.layer == "Labels")
                })
                .count(),
            cluster.len()
        );
        let mut baselines = [None, None];
        for (_, number, [x, y]) in cluster {
            let label = decoded
                .model_space_entities()
                .find_map(|entity| match entity {
                    EntityType::Text(text)
                        if text.common.layer == "Labels" && text.value == number =>
                    {
                        Some(text)
                    }
                    _ => None,
                })
                .unwrap_or_else(|| panic!("{}: missing pile number {number}", format.name()));
            let alignment = label.alignment_point.unwrap();
            assert!((alignment.x - x).abs() < 0.01);
            let upper = y == 14650.;
            assert_eq!(alignment.y > y, upper, "{number} is inside the cluster");
            let baseline = baselines[usize::from(upper)].get_or_insert(alignment.y);
            assert!((*baseline - alignment.y).abs() < 0.01);
            assert!(
                decoded.model_space_entities().any(|entity| {
                    matches!(entity, EntityType::Line(line) if line.common.layer == "Label leaders"
                    && (line.start.x - x).abs() < 0.01 && (line.end.x - x).abs() < 0.01
                    && (line.start.y - y).abs() < 250.
                    && (line.end.y - line.start.y).abs() < 500.
                    && (line.end.y > line.start.y) == upper)
                }),
                "missing short leader for pile {number}"
            );
        }
    }
}
