use super::*;

fn cells(values: &[&str]) -> Vec<TableCell> {
    values
        .iter()
        .map(|v| TableCell::Text((*v).into()))
        .collect()
}
fn source(sheets: &[(&str, Vec<Vec<TableCell>>)]) -> ImportSource {
    let mut book = rust_xlsxwriter::Workbook::new();
    for (name, rows) in sheets {
        let sheet = book.add_worksheet();
        sheet.set_name(*name).unwrap();
        for (r, row) in rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                match cell {
                    TableCell::Text(v) => {
                        sheet.write_string(r as u32, c as u16, v).unwrap();
                    }
                    TableCell::Number(v) => {
                        sheet.write_number(r as u32, c as u16, *v).unwrap();
                    }
                    _ => {}
                }
            }
        }
    }
    ImportSource {
        source_id: Some("a".into()),
        advice_operation: None,
        role: ImportRole::BearingCapacities,
        profile: ImportProfile::Auto,
        profile_options: Default::default(),
        file_name: "advies.xlsx".into(),
        format: SourceFormat::Xlsx,
        bytes: book.save_to_buffer().unwrap(),
    }
}
fn matrix() -> Vec<Vec<TableCell>> {
    vec![
        cells(&["Kolom1", "Kolom2", "250", "290", "320", "350"]),
        cells(&["1", "-15", "10", "20", "30", "40"]),
    ]
}
fn select(s: &mut ImportSource, sheets: &[(&str, ImportProfile)]) {
    s.profile_options.advice_sheets = Some(
        sheets
            .iter()
            .map(|(n, p)| AdviceSheetSelection {
                sheet_name: (*n).into(),
                profile: *p,
            })
            .collect(),
    );
}
#[test]
fn generic_matrix_requires_explicit_profile_and_never_becomes_standard() {
    for numeric in [false, true] {
        let mut rows = matrix();
        if numeric {
            for cell in &mut rows[0][2..] {
                *cell = TableCell::Number(cell.as_text().parse().unwrap());
            }
        }
        let mut s = source(&[("Blad1", rows)]);
        let p = preview_advice_source(&s);
        assert_eq!(p.sheets[0].status, AdviceSheetStatus::NeedsProfile);
        assert_eq!(
            p.sheets[0].detected_profile,
            Some(ImportProfile::CapacityColumns)
        );
        assert!(p.suggested_selection.is_empty());
        select(&mut s, &[("Blad1", ImportProfile::CapacityColumns)]);
        assert_eq!(
            preview_advice_source(&s).sheets[0].status,
            AdviceSheetStatus::Ready
        );
        let a = advice::analyze_advice_sources(&[s.clone()]).unwrap();
        assert_eq!(a.values.len(), 4);
        assert_eq!(
            a.values
                .iter()
                .map(|v| v.pile_size_mm)
                .collect::<std::collections::BTreeSet<_>>(),
            [250, 290, 320, 350].into()
        );
        assert_eq!(a.values[0].frd_kn, 10.);
        select(&mut s, &[("Blad1", ImportProfile::StandardTable)]);
        let d = advice::analyze_advice_sources(&[s])
            .unwrap_err()
            .to_source_import_failure()
            .diagnostics
            .remove(0);
        assert_eq!(d.code, ImportDiagnosticCode::AdviceProfileMismatch);
    }
}
#[test]
fn matrix_and_standard_merge_without_false_conflicts() {
    let standard = vec![
        cells(&["Kolom1", "Kolom2", "Kenmerk", "Waarde"]),
        cells(&["1", "-15", "250", "10"]),
        cells(&["1", "-15", "290", "20"]),
        cells(&["1", "-15", "320", "30"]),
        cells(&["1", "-15", "350", "40"]),
    ];
    let mut s = source(&[("Draagvermogens", standard.clone()), ("Blad1", matrix())]);
    select(
        &mut s,
        &[
            ("Draagvermogens", ImportProfile::StandardTable),
            ("Blad1", ImportProfile::CapacityColumns),
        ],
    );
    let a = advice::analyze_advice_sources(&[s.clone()]).unwrap();
    assert_eq!(a.values.len(), 4);
    assert_eq!(a.exact_duplicate_count, 4);
    let mut changed = matrix();
    changed[1][2] = TableCell::Number(11.);
    s.bytes = source(&[("Draagvermogens", standard), ("Blad1", changed)]).bytes;
    let f = advice::analyze_advice_sources(&[s])
        .unwrap_err()
        .to_source_import_failure();
    assert_eq!(f.conflicts.len(), 1);
    assert_eq!(f.conflicts[0].pile_size_mm, 250);
    assert!(f.conflicts[0]
        .values
        .iter()
        .all(|v| v.locations[0].row == Some(2)));
}
#[test]
fn bare_headers_with_semantic_roles_resolve_automatically_and_two_sizes_are_a_matrix() {
    let s = source(&[(
        "data",
        vec![
            cells(&["Sondering", "PPN", "250", "290"]),
            cells(&["1", "-15", "10", "20"]),
        ],
    )]);
    let p = preview_advice_source(&s);
    assert_eq!(p.sheets[0].status, AdviceSheetStatus::Ready);
    assert_eq!(
        p.sheets[0].resolved_profile,
        Some(ImportProfile::CapacityColumns)
    );
    assert_eq!(p.sheets[0].summary.item_count, 2);
}
#[test]
fn headerless_numeric_rows_remain_standard_and_spaces_do_not_erase_the_first_row() {
    let mut s = source(&[(
        "data",
        vec![
            cells(&[" 1 ", " -15 ", " 250 ", " 500 "]),
            cells(&["2", "-16", "290", "600"]),
        ],
    )]);
    let p = preview_advice_source(&s);
    assert_eq!(p.sheets[0].summary.item_count, 2);
    s.bytes = source(&[(
        "data",
        vec![
            cells(&["", "-15", "250", "500"]),
            cells(&["2", "-16", "290", "600"]),
        ],
    )])
    .bytes;
    let p = preview_advice_source(&s);
    assert_eq!(p.sheets[0].status, AdviceSheetStatus::Invalid);
    assert_eq!(
        p.sheets[0].diagnostics[0].code,
        ImportDiagnosticCode::MissingAdviceValue
    );
    assert_eq!(
        p.sheets[0].diagnostics[0].location.as_ref().unwrap().row,
        Some(1)
    );
}
#[test]
fn extra_standard_columns_require_semantic_headers_but_empty_columns_do_not() {
    for (header, expected) in [
        (vec!["a", "b", "c", "d", "notes"], false),
        (vec!["ID", "Tip", "Size", "FRD", "notes"], true),
        (vec!["Kolom1", "Kolom2", "Kenmerk", "Waarde", ""], true),
    ] {
        let extra = if header[4].is_empty() { "" } else { "note" };
        let s = source(&[(
            "data",
            vec![cells(&header), cells(&["1", "-15", "250", "500", extra])],
        )]);
        assert_eq!(
            preview_advice_source(&s).sheets[0].status == AdviceSheetStatus::Ready,
            expected
        );
    }
}
#[test]
fn matrix_value_errors_never_fall_back_and_keep_raw_location() {
    for (raw, code, column) in [
        ("320 mm", ImportDiagnosticCode::InvalidAdviceValue, 3),
        ("", ImportDiagnosticCode::MissingAdviceValue, 1),
    ] {
        let mut rows = matrix();
        rows[1][column - 1] = TableCell::Text(raw.into());
        let mut s = source(&[("Blad1", rows)]);
        select(&mut s, &[("Blad1", ImportProfile::CapacityColumns)]);
        let p = preview_advice_source(&s);
        assert_eq!(p.sheets[0].status, AdviceSheetStatus::Invalid);
        let d = &p.sheets[0].diagnostics[0];
        assert_eq!(d.code, code);
        assert_eq!(d.location.as_ref().unwrap().column, Some(column));
        assert_eq!(d.advice.as_ref().unwrap().value.as_deref(), Some(raw));
        assert!(advice::analyze_advice_sources(&[s]).is_err());
    }
}
#[test]
fn excluded_matrix_needs_profile_does_not_block_valid_sheet() {
    let mut s = source(&[
        ("ok", vec![cells(&["1", "-15", "250", "10"])]),
        ("Blad1", matrix()),
    ]);
    select(&mut s, &[("ok", ImportProfile::StandardTable)]);
    assert_eq!(
        advice::analyze_advice_sources(&[s]).unwrap().values.len(),
        1
    );
}
#[test]
fn invalid_headers_do_not_disappear_from_positional_matrix() {
    for header in [
        vec!["Kolom1", "Kolom2", "250", "250"],
        vec!["Kolom1", "Kolom2", "250", "290", "unknown"],
        vec!["Kolom1", "PPN [ft]", "250", "290"],
    ] {
        let mut s = source(&[(
            "data",
            vec![cells(&header), cells(&["1", "-15", "10", "20", "30"])],
        )]);
        s.profile = ImportProfile::CapacityColumns;
        assert_ne!(
            preview_advice_source(&s).sheets[0].status,
            AdviceSheetStatus::Ready
        );
        assert!(advice::analyze_advice_sources(&[s]).is_err());
    }
}

#[test]
fn appending_s1419_keeps_the_two_stored_value_conflicts_blocking() {
    let csv = |role, name: &str, text: &str| ImportSource {
        source_id: None,
        advice_operation: None,
        role,
        profile: ImportProfile::StandardTable,
        profile_options: Default::default(),
        file_name: name.into(),
        format: SourceFormat::Csv,
        bytes: text.as_bytes().to_vec(),
    };
    let current = import_project_from_sources(
        "Test",
        &[
            csv(ImportRole::LoadPoints, "loads.csv", "1,0,0,100"),
            csv(ImportRole::Cpts, "cpts.csv", "9,0,0\n107,10,0"),
            csv(
                ImportRole::BearingCapacities,
                "bestaand.xlsx",
                "9,-17.5,320,401\n107,-18.5,350,418",
            ),
        ],
        Some(0.),
        "EUR",
    )
    .unwrap();
    let before = serde_json::to_value(&current).unwrap();
    let mut rows = vec![vec![]; 1209];
    rows[0] = cells(&["Kolom1", "Kolom2", "Kenmerk", "Waarde"]);
    rows[471] = cells(&["9", "-17.5", "320", "466"]);
    rows[1208] = cells(&["107", "-18.5", "350", "557"]);
    let mut s = source(&[("Draagvermogens", rows)]);
    s.advice_operation = Some(AdviceImportOperation::Append);
    select(&mut s, &[("Draagvermogens", ImportProfile::StandardTable)]);
    let p = preview_project_import(&crate::PreviewProjectImportRequest {
        current_project: Some(current.clone()),
        sources: vec![s.clone()],
    });
    assert!(!p.can_apply);
    assert!(!p.counts_available);
    assert_eq!(p.conflicts.len(), 2);
    for (cpt, size, level, old, new, row) in [
        (9, 320, -17500, 401., 466., 472),
        (107, 350, -18500, 418., 557., 1209),
    ] {
        let conflict = p.conflicts.iter().find(|c| c.cpt_id == cpt).unwrap();
        assert_eq!(
            (conflict.pile_size_mm, conflict.pile_tip_level_mm),
            (size, level)
        );
        assert!(conflict.values.iter().any(|v| v.frd_kn == old));
        assert!(conflict.values.iter().any(|v| v.frd_kn == new
            && v.locations
                .iter()
                .any(|l| l.row == Some(row) && l.column == Some(4))));
    }
    assert!(refresh_project_from_profiled_sources(&current, &[s]).is_err());
    assert_eq!(serde_json::to_value(&current).unwrap(), before);
}

#[test]
fn duplicate_matrix_headers_have_a_layout_diagnostic_not_a_selection_error() {
    let mut s = source(&[(
        "data",
        vec![
            cells(&["Sondering", "PPN", "250", "250"]),
            cells(&["1", "-15", "10", "20"]),
        ],
    )]);
    s.profile = ImportProfile::StandardTable;
    let p = preview_advice_source(&s);
    assert_eq!(
        p.sheets[0].diagnostics[0].code,
        ImportDiagnosticCode::AmbiguousAdviceLayout
    );
}
#[test]
fn physical_header_window_and_formula_columns_are_preserved() {
    use super::advice_layout::*;
    let table = |number| SourceTable {
        file_name: "offset.xlsx".into(),
        sheet_name: Some("Blad1".into()),
        formula_cells: Default::default(),
        rows: vec![
            SourceRow {
                number,
                cells: cells(&["Kolom1", "Kolom2", "250", "290"]),
            },
            SourceRow {
                number: number + 2,
                cells: cells(&["1", "-15", "10", "20"]),
            },
        ],
    };
    let t = table(20);
    assert!(matches!(
        classify_advice_table(&t).unwrap(),
        AdviceLayout::CapacityColumns { .. }
    ));
    assert!(classify_advice_table(&table(21)).is_err());
    let mut t = table(20);
    t.formula_cells.insert((22, 5));
    assert!(classify_advice_table(&t).is_err());
}
#[test]
fn cached_zero_and_blank_resistance_are_distinct_from_missing_formula_cache() {
    let mut t = SourceTable {
        file_name: "formula.xlsx".into(),
        sheet_name: Some("data".into()),
        formula_cells: Default::default(),
        rows: vec![
            SourceRow {
                number: 7,
                cells: cells(&["Sondering", "PPN", "250", "290"]),
            },
            SourceRow {
                number: 9,
                cells: cells(&["1", "-15", "", "0"]),
            },
        ],
    };
    let layout = capacity_columns::detect_capacity_columns(&t)
        .unwrap()
        .unwrap();
    let p = capacity_columns::parse_capacity_columns(&t, &layout).unwrap();
    assert_eq!(p.missing_cells, vec![(9, 3)]);
    assert_eq!(p.values[0].capacity.frd_kn, 0.);
    t.formula_cells.insert((9, 3));
    let f = capacity_columns::parse_capacity_columns(&t, &layout)
        .unwrap_err()
        .to_source_import_failure();
    assert_eq!(
        f.diagnostics[0].code,
        ImportDiagnosticCode::MissingAdviceFormulaResult
    );
    assert_eq!(f.diagnostics[0].location.as_ref().unwrap().row, Some(9));
}
