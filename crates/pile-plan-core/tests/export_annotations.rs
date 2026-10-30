use std::{collections::HashMap, io::Cursor};

use calamine::{Data, Reader, Xlsx};
use pile_plan_core::{
    preview_configured_pile_plan_export, write_configured_pile_plan_csv,
    write_configured_pile_plan_xlsx, ConfiguredPilePlanExportRequest,
};
use serde_json::{json, Value};

fn request(options: Value) -> ConfiguredPilePlanExportRequest {
    serde_json::from_value(json!({"plan":{
        "load_points": [
            {"id": 40, "name":"bottom right", "x_mm":4000.0,"y_mm":1000.0,"design_load_kn":100.0},
            {"id": 10, "name":"top right", "x_mm":4000.0,"y_mm":6000.0,"design_load_kn":100.0},
            {"id": 30, "name":"bottom left", "x_mm":1000.0,"y_mm":1000.0,"design_load_kn":100.0},
            {"id": 20, "name":"top left", "x_mm":1000.0,"y_mm":6000.0,"design_load_kn":100.0},
            {"id": 50, "name":"unassigned", "x_mm":0.0,"y_mm":9000.0,"design_load_kn":100.0}
        ],
        "selected_piles": {
            "10":{"pile_size_mm":290,"pile_tip_level_mm":-20000},
            "20":{"pile_size_mm":290,"pile_tip_level_mm":-17000},
            "30":{"pile_size_mm":290,"pile_tip_level_mm":-20000},
            "40":{"pile_size_mm":290,"pile_tip_level_mm":-21000}
        },
        "selected_cpts": {}, "pile_shapes":{"290":"square"},
        "pile_size_format":"dimensions"}, "export_options":options
    }))
    .unwrap()
}

fn table(req: &ConfiguredPilePlanExportRequest) -> Vec<Vec<Data>> {
    let mut book = Xlsx::new(Cursor::new(write_configured_pile_plan_xlsx(req).unwrap())).unwrap();
    book.worksheet_range("Pile Plan")
        .unwrap()
        .rows()
        .map(|r| r.to_vec())
        .collect()
}

#[test]
fn old_callers_keep_seven_columns_and_unassigned_blanks() {
    let values = table(&request(json!({})));
    assert_eq!(values[0].len(), 7);
    assert_eq!(values[0][0], Data::String("Load Point ID".into()));
    assert_eq!(values[1][4], Data::String("290x290".into()));
    assert_eq!(values[5][4], Data::Empty);
}

#[test]
fn configured_columns_select_order_rename_format_and_add_literal_values() {
    let req = request(json!({"columns":[
        {"key":"mark","field":"mark","header":"Paalnummer","enabled":true},
        {"key":"x","field":"x","header":"Oost [m]","unit":"m","enabled":true},
        {"key":"size","field":"pile_size","header":"Familie","size_format":"custom","template":"Paal {size}x{size}","enabled":true},
        {"key":"hidden","field":"design_load","header":"Verborgen","enabled":false},
        {"key":"note","field":"literal","header":"Fase","value":"Voorlopig","enabled":true}
    ]}));
    let preview = preview_configured_pile_plan_export(&req).unwrap();
    assert_eq!(
        preview.table.headers,
        ["Paalnummer", "Oost [m]", "Familie", "Fase"]
    );
    assert_eq!(
        preview.table.rows[0],
        vec![
            json!(2),
            json!(4.0),
            json!("Paal 290x290"),
            json!("Voorlopig")
        ]
    );
    assert_eq!(preview.table.rows[4][0], Value::Null);
    assert_eq!(preview.table.rows[4][2], Value::Null);
}

#[test]
fn empty_or_duplicate_enabled_column_names_are_rejected() {
    for headers in [["A", "A"], ["A", ""]] {
        let req = request(json!({"columns":[
            {"key":"a","field":"x","header":headers[0],"enabled":true},
            {"key":"b","field":"y","header":headers[1],"enabled":true}
        ]}));
        assert!(preview_configured_pile_plan_export(&req).is_err());
    }
}

#[test]
fn marks_follow_rows_without_changing_ids_or_numbering_empty_assignments() {
    let values = table(&request(json!({"mark":{"enabled":true,"start":7}})));
    assert_eq!(values[0][7], Data::String("Mark".into()));
    // Output remains in load point order; numbering follows geometry.
    assert_eq!(values[1][0], Data::Float(10.0));
    assert_eq!(values[1][7], Data::Float(8.0));
    assert_eq!(values[2][7], Data::Float(7.0));
    assert_eq!(values[3][7], Data::Float(9.0));
    assert_eq!(values[4][7], Data::Float(10.0));
    assert_eq!(values[5][7], Data::Empty);
}

#[test]
fn columns_and_each_axis_direction_are_independent() {
    let req = request(json!({"mark":{"enabled":true,"rule":{
        "axis":"x","x_direction":"descending","y_direction":"ascending","tolerance_mm":1.0
    }}}));
    let preview = preview_configured_pile_plan_export(&req).unwrap();
    let marks: HashMap<_, _> = preview
        .annotations
        .iter()
        .map(|r| (r.load_point_id, r.mark))
        .collect();
    assert_eq!(marks[&40], Some(1));
    assert_eq!(marks[&10], Some(2));
    assert_eq!(marks[&30], Some(3));
    assert_eq!(marks[&20], Some(4));
}

#[test]
fn row_tolerance_limits_whole_group_instead_of_chaining() {
    let mut req = request(json!({"mark":{"enabled":true,"rule":{"tolerance_mm":1.0}}}));
    let coords = [
        (10, 3000.0, 100.0),
        (20, 2000.0, 99.4),
        (30, 1000.0, 98.8),
        (40, 4000.0, 90.0),
    ];
    for (id, x, y) in coords {
        let p = req
            .plan
            .load_points
            .iter_mut()
            .find(|p| p.id == id)
            .unwrap();
        p.x_mm = x;
        p.y_mm = y;
    }
    let preview = preview_configured_pile_plan_export(&req).unwrap();
    let marks: HashMap<_, _> = preview
        .annotations
        .iter()
        .map(|r| (r.load_point_id, r.mark))
        .collect();
    assert_eq!(marks[&20], Some(1));
    assert_eq!(marks[&10], Some(2));
    assert_eq!(marks[&30], Some(3));
}

#[test]
fn tip_codes_support_both_sequences_and_directions_and_share_levels() {
    for (sequence, direction, expected) in [
        ("letters", "descending", ["B", "A", "B", "C"]),
        ("letters", "ascending", ["B", "C", "B", "A"]),
        ("numbers", "descending", ["2", "1", "2", "3"]),
        ("numbers", "ascending", ["2", "3", "2", "1"]),
    ] {
        let req =
            request(json!({"tip_code":{"enabled":true,"sequence":sequence,"direction":direction}}));
        let rows = preview_configured_pile_plan_export(&req)
            .unwrap()
            .annotations;
        let codes: Vec<_> = rows.iter().filter_map(|r| r.tip_code.as_deref()).collect();
        assert_eq!(codes, expected);
        assert_eq!(rows[4].tip_code, None);
    }
}

#[test]
fn invalid_tolerance_start_and_duplicate_ids_are_rejected() {
    for options in [
        json!({"mark":{"enabled":true,"start":0}}),
        json!({"mark":{"enabled":true,"rule":{"tolerance_mm":-1.0}}}),
    ] {
        assert!(preview_configured_pile_plan_export(&request(options)).is_err());
    }
    let mut req = request(json!({}));
    req.plan.load_points[1].id = 40;
    assert!(preview_configured_pile_plan_export(&req).is_err());
}

#[test]
fn csv_and_xlsx_export_the_same_annotations() {
    let req = request(json!({"mark":{"enabled":true},"tip_code":{"enabled":true}}));
    let csv = String::from_utf8(write_configured_pile_plan_csv(&req).unwrap()).unwrap();
    assert!(csv.lines().next().unwrap().ends_with("Mark,Inheicode"));
    assert!(csv.lines().nth(1).unwrap().ends_with(",2,B"));
    let values = table(&req);
    assert_eq!(values[1][7], Data::Float(2.0));
    assert_eq!(values[1][8], Data::String("B".into()));
}

#[test]
fn calculated_columns_without_context_are_empty_not_zero() {
    let req = request(json!({"columns":[
        {"key":"r","field":"compression_resistance","header":"R"},
        {"key":"u","field":"compression_utilization","header":"U"},
        {"key":"c","field":"pile_cost","header":"Cost"},
        {"key":"l","field":"pile_length","header":"Length"},
        {"key":"s","field":"technical_status","header":"Status"},
        {"key":"id","field":"export_id","header":"Export ID"},
        {"key":"origin","field":"original_locations","header":"Origin"}
    ]}));
    let result = preview_configured_pile_plan_export(&req).unwrap();
    assert_eq!(&result.table.rows[0][..4], &vec![Value::Null; 4]);
    assert_eq!(result.table.rows[0][5], json!(10));
    assert_eq!(result.table.rows[0][6], json!("10"));
}
