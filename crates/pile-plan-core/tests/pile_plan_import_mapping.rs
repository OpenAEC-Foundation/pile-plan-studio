use pile_plan_core::*;
use serde_json::{json, Value};

#[test]
fn applying_import_tolerance_matches_remaining_rows_and_keeps_explicit_skips() {
    let request:PilePlanImportRequest=serde_json::from_value(json!({
        "file_name":"plan.csv","format":"csv","bytes":b"ID,X,Y,Pile Size,Pile Tip Level\n99,20,0,320,-18\n98,1000,0,320,-18\n".to_vec(),
        "options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":50.,"bulk_action":"automatic","location_decisions":{"links":[],"added":[3],"removed":[]}},
        "load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.},{"id":2,"name":"B","x_mm":1000.,"y_mm":0.,"design_load_kn":1.}],
        "cpts":[],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]
    })).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(
        p["matching"]["links"],
        json!([{"old_id":1,"new_id":2,"distance_mm":20.}])
    );
    assert_eq!(p["matching"]["added"], json!([3]));
    assert_eq!(p["matching"]["new_order"], json!([2, 3]));
    assert_eq!(p["can_apply"], true);
}

#[test]
fn nearest_import_links_outside_automatic_tolerance_and_preserves_reviewed_choices() {
    let request: PilePlanImportRequest = serde_json::from_value(json!({
        "file_name":"plan.csv", "format":"csv",
        "bytes":b"ID,X,Y,Pile Size,Pile Tip Level\n99,10,0,320,-18\n98,19,0,320,-18\n97,300,0,320,-18\n96,400,0,320,-18\n".to_vec(),
        "options":{"coordinate_tolerance_mm":1.,"import_pile_assignments":true,"import_cpt_selections":false,
            "location_decisions":{"links":[{"old_id":3,"new_id":4}],"added":[5],"removed":[]},"bulk_action":"nearest"},
        "load_points":[
            {"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.},
            {"id":2,"name":"B","x_mm":11.,"y_mm":0.,"design_load_kn":1.},
            {"id":3,"name":"C","x_mm":300.,"y_mm":0.,"design_load_kn":1.}],
        "cpts":[],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]
    })).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(p["matching"]["unmatched_new"], json!([]));
    assert_eq!(p["matching"]["added"], json!([5]));
    for (row, target, distance) in [(2, 2, 1.), (3, 1, 19.), (4, 3, 0.)] {
        let link = p["matching"]["links"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["new_id"] == row)
            .unwrap();
        assert_eq!(link["old_id"], target);
        assert_eq!(link["distance_mm"], distance);
    }
    assert_eq!(p["can_apply"], true);
}

#[test]
fn nearest_import_leaves_unlocated_rows_pending_without_inventing_positions() {
    let request:PilePlanImportRequest=serde_json::from_value(json!({
        "file_name":"plan.csv","format":"csv","bytes":b"ID,Pile Size,Pile Tip Level\n99,320,-18\n".to_vec(),
        "options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":1.,"bulk_action":"nearest"},
        "load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.}],"cpts":[]
    })).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(p["matching"]["unmatched_new"], json!([2]));
    assert_eq!(p["matching"]["links"], json!([]));
    assert_eq!(p["can_apply"], false);
}

#[test]
fn nearest_import_uses_global_distance_order_instead_of_file_row_order() {
    let request:PilePlanImportRequest=serde_json::from_value(json!({
        "file_name":"plan.csv","format":"csv","bytes":b"ID,X,Y,Pile Size,Pile Tip Level\n99,6,0,320,-18\n98,9,0,320,-18\n".to_vec(),
        "options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":0.,"bulk_action":"nearest"},
        "load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.},{"id":2,"name":"B","x_mm":10.,"y_mm":0.,"design_load_kn":1.}],
        "cpts":[],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]
    })).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    let links = p["matching"]["links"].as_array().unwrap();
    assert!(links.iter().any(|l| l["new_id"] == 2 && l["old_id"] == 1));
    assert!(links.iter().any(|l| l["new_id"] == 3 && l["old_id"] == 2));
}
fn preview(text: &str, table: Value, decisions: Value) -> Value {
    let request:PilePlanImportRequest=serde_json::from_value(json!({"file_name":"plan.csv","format":"csv","bytes":text.as_bytes(),"profile":"automatic","options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":1.,"table":table,"location_decisions":decisions},"load_points":[{"id":1,"name":"A","x_mm":1000.,"y_mm":2000.,"design_load_kn":100.},{"id":2,"name":"B","x_mm":1001.,"y_mm":2000.,"design_load_kn":100.}],"cpts":[],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]})).unwrap();
    serde_json::to_value(preview_pile_plan_import(&request)).unwrap()
}
#[test]
fn id_only_and_optional_missing_columns() {
    let p = preview(
        "ID,Afmeting,Puntniveau\n1,320,-18\n",
        Value::Null,
        Value::Null,
    );
    assert_eq!(p["can_apply"], true);
    assert_eq!(p["patch"]["changes"][0]["load_point_id"], 1);
    assert_eq!(
        p["patch"]["changes"][0]["manual_cpt_ids"]["action"],
        "preserve"
    );
    assert!(p["source_locations"][0]["x_mm"].is_null());
    assert!(p["matching"]["links"][0]["distance_mm"].is_null());
}
#[test]
fn coordinates_units_delimiter_and_manual_ambiguity() {
    let settings = json!({"delimiter":";","has_headers":true,"header_row":1,"first_data_row":2,"columns":[{"column":1,"field":"x","unit":"m"},{"column":2,"field":"y","unit":"m"},{"column":3,"field":"pile-size"},{"column":4,"field":"tip-level","unit":"mm"}]});
    let text = "East;North;Size;Tip\n1;2;320;-18000\n";
    let p = preview(text, settings.clone(), Value::Null);
    assert_eq!(p["matching"]["unmatched_new"], json!([2]));
    assert_eq!(p["can_apply"], false);
    let p = preview(
        text,
        settings,
        json!({"links":[{"old_id":2,"new_id":2}],"added":[],"removed":[]}),
    );
    assert_eq!(p["patch"]["changes"][0]["load_point_id"], 2);
    assert_eq!(
        p["patch"]["changes"][0]["pile"]["value"]["pile_tip_level_mm"],
        -18000
    );
}
#[test]
fn skip_is_not_a_new_project_location() {
    let p = preview(
        "ID,Pile Size,Pile Tip Level\n99,320,-18\n",
        Value::Null,
        json!({"links":[],"added":[2],"removed":[]}),
    );
    assert_eq!(p["matching"]["complete"], true);
    assert_eq!(p["summary"]["skipped_rows"], 1);
    assert_eq!(p["patch"]["changes"], json!([]));
}
#[test]
fn headerless_explicit_mapping_and_empty_action_cells() {
    let p = preview(
        "-18,320,1\n",
        json!({"has_headers":false,"first_data_row":1,"columns":[{"column":1,"field":"tip-level"},{"column":2,"field":"pile-size"},{"column":3,"field":"id"}]}),
        Value::Null,
    );
    assert_eq!(p["can_apply"], true);
    let p = preview(
        "ID,Pile Size,Pile Tip Level\n1,,\n",
        Value::Null,
        Value::Null,
    );
    assert_eq!(p["patch"]["changes"][0]["pile"]["action"], "clear");
}
#[test]
fn import_bulk_skip_resolves_only_source_rows() {
    let request:PilePlanImportRequest=serde_json::from_value(json!({"file_name":"plan.csv","format":"csv","bytes":b"ID,Pile Size,Pile Tip Level\n99,320,-18\n".to_vec(),"options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":1.,"location_decisions":{"links":[],"added":[],"removed":[]},"bulk_action":"separate"},"load_points":[],"cpts":[],"available_pile_configurations":[]})).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(p["matching"]["complete"], true);
    assert_eq!(p["matching"]["added"], json!([2]));
    assert_eq!(p["matching"]["removed"], json!([]));
}
#[test]
fn invalid_mapping_and_manual_links_are_rejected_without_clearing_data() {
    let bad = preview(
        "ID,Pile Size,Pile Tip Level\n1,320,-18\n",
        json!({"columns":[{"column":1,"field":"id"},{"column":2,"field":"id"}]}),
        Value::Null,
    );
    assert_eq!(bad["diagnostics"][0]["code"], "invalid-column-mapping");
    assert_eq!(bad["can_apply"], false);
    assert_eq!(bad["patch"]["changes"], json!([]));
    let bad = preview(
        "ID,Pile Size,Pile Tip Level\n1,320,-18\n",
        Value::Null,
        json!({"links":[{"old_id":999,"new_id":2}],"added":[],"removed":[]}),
    );
    assert_eq!(bad["can_apply"], false);
    assert_eq!(bad["diagnostics"][0]["code"], "invalid-location-mapping");
}
#[test]
fn invalid_row_beyond_preview_remains_available_for_error_navigation() {
    let text = format!(
        "ID,Pile Size,Pile Tip Level\n{}1,320,broken\n",
        (1..=30)
            .map(|i| format!("{i},320,-18\n"))
            .collect::<String>()
    );
    let p = preview(&text, Value::Null, Value::Null);
    assert_eq!(p["diagnostics"][0]["location"]["row"], 32);
    assert!(p["table"]["rows"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["number"] == 32));
}
#[test]
fn empty_trailing_xlsx_cells_clear_mapped_actions() {
    use rust_xlsxwriter::Workbook;
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    for (col, label) in ["ID", "Pile Size", "Pile Tip Level"].iter().enumerate() {
        sheet.write_string(0, col as u16, *label).unwrap();
    }
    sheet.write_number(1, 0, 1.).unwrap();
    let request:PilePlanImportRequest=serde_json::from_value(json!({"file_name":"plan.xlsx","format":"xlsx","bytes":workbook.save_to_buffer().unwrap(),"options":{"import_pile_assignments":true,"import_cpt_selections":false,"coordinate_tolerance_mm":1.},"load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.}],"cpts":[]})).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(p["patch"]["changes"][0]["pile"]["action"], "clear");
}
#[test]
fn legacy_sheet_is_detected_among_unrelated_worksheets() {
    use rust_xlsxwriter::Workbook;
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Vergrendeld").unwrap();
    for (column, value) in [1., 1., -18., 320., 0., 0., 0.].into_iter().enumerate() {
        sheet.write_number(0, column as u16, value).unwrap();
    }
    workbook
        .add_worksheet()
        .set_name("Notes")
        .unwrap()
        .write_string(0, 0, "metadata")
        .unwrap();
    let request:PilePlanImportRequest=serde_json::from_value(json!({"file_name":"plan.xlsx","format":"xlsx","bytes":workbook.save_to_buffer().unwrap(),"load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.}],"cpts":[],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]})).unwrap();
    let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
    assert_eq!(p["detected_profile"], "legacy");
    assert_eq!(p["can_apply"], true);
}
#[test]
fn unit_conversion_rejects_overflow_before_manual_matching() {
    let p = preview(
        "ID,X,Y,Pile Size,Pile Tip Level\n1,1e308,0,320,-18\n",
        json!({"has_headers":true,"header_row":1,"first_data_row":2,"columns":[{"column":1,"field":"id"},{"column":2,"field":"x","unit":"m"},{"column":3,"field":"y","unit":"m"},{"column":4,"field":"pile-size"},{"column":5,"field":"tip-level"}]}),
        json!({"links":[{"old_id":1,"new_id":2}],"added":[],"removed":[]}),
    );
    assert_eq!(p["can_apply"], false);
    assert_eq!(p["diagnostics"][0]["location"]["column"], 2);
}
#[test]
fn disabled_categories_do_not_validate_or_clear_their_cells() {
    for (text, piles, cpts) in [
        ("ID,Afmeting,Selected CPTs\n1,bad,61\n", false, true),
        (
            "ID,Pile Size,Pile Tip Level,Selected CPTs\n1,320,-18,bad\n",
            true,
            false,
        ),
    ] {
        let request:PilePlanImportRequest=serde_json::from_value(json!({"file_name":"plan.csv","format":"csv","bytes":text.as_bytes(),"options":{"import_pile_assignments":piles,"import_cpt_selections":cpts,"coordinate_tolerance_mm":1.},"load_points":[{"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":1.}],"cpts":[{"id":61,"name":"S61","x_mm":0.,"y_mm":0.}],"available_pile_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}]})).unwrap();
        let p = serde_json::to_value(preview_pile_plan_import(&request)).unwrap();
        assert_eq!(p["can_apply"], true, "{p}");
        assert_eq!(
            p["patch"]["changes"][0][if piles { "manual_cpt_ids" } else { "pile" }]["action"],
            "preserve"
        );
    }
}
