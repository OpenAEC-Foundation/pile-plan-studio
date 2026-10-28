use calamine::{Data, Reader, Xlsx};
use pile_plan_core::{preview_revit_revision, write_revit_revision_xlsx, RevitRevisionRequest};
use serde_json::{json, Value};
use std::io::Cursor;

fn request(decisions: Value) -> RevitRevisionRequest {
    let csv="Mark,Load Point ID,Type,X,Y,Afhakcode,Inheicode,Level tov NAP,Kopwapeningcode,Notitie\n1,5,290x290,0,0,a,B,-19.5,K1,behouden\n2,6,290x290,1000,0,a,B,-19.5,T1,anders\n9,77,290x290,2000,0,a,A,-17,,vervallen\n";
    serde_json::from_value(json!({
        "old_source":{"file_name":"old.csv","format":"csv","bytes":csv.as_bytes()},
        "new_plan":{
            "load_points":[
                {"id":77,"name":"a","x_mm":0,"y_mm":0,"design_load_kn":100},
                {"id":88,"name":"b","x_mm":1299,"y_mm":0,"design_load_kn":100},
                {"id":99,"name":"c","x_mm":5000,"y_mm":0,"design_load_kn":100}],
            "selected_piles":{"77":{"pile_size_mm":320,"pile_tip_level_mm":-19500},"88":{"pile_size_mm":290,"pile_tip_level_mm":-20000},"99":{"pile_size_mm":290,"pile_tip_level_mm":-21000}},
            "selected_cpts":{},"pile_shapes":{"290":"square","320":"square"}
        },"decisions":decisions
    })).unwrap()
}

fn choices() -> Value {
    json!({"links":[{"old_id":1,"new_id":77},{"old_id":2,"new_id":88}],"added":[99],"removed":[9]})
}

#[test]
fn a_default_pile_plan_export_without_marks_can_be_used_as_previous_table() {
    let mut req = request(
        json!({"links":[{"old_id":1,"new_id":77},{"old_id":2,"new_id":88}],"added":[99],"removed":[3]}),
    );
    req.old_source.bytes=b"Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n5,0,0,100,290,-19.5,61\n6,1000,0,100,290,-19.5,61\n77,2000,0,100,290,-17,61\n".to_vec();
    let preview = preview_revit_revision(&req).unwrap();
    let table = preview.table.unwrap();
    assert_eq!(table.headers.len(), 8);
    assert_eq!(table.rows[0][0], 77);
    assert_eq!(table.rows[0][7], "S");
    assert_eq!(table.rows[2][7], "R");
}

#[test]
fn renamed_source_columns_and_coordinate_units_can_be_mapped() {
    let mut value = serde_json::to_value(request(Value::Null)).unwrap();
    value["old_source"]["bytes"] =
        json!(b"Paalnr,Oost,Noord,Maat,Punt,Notitie\n7,1,2,290,-19.5,behouden\n".to_vec());
    value["old_mapping"] = json!({"columns":{"mark":0,"x":1,"y":2,"pile_size":3,"tip_level":4},"coordinate_unit":"m","tip_unit":"m"});
    value["new_plan"]["load_points"] =
        json!([{"id":77,"name":"a","x_mm":1000,"y_mm":2000,"design_load_kn":100}]);
    let preview = preview_revit_revision(&serde_json::from_value(value).unwrap()).unwrap();
    assert!(preview.matching.complete);
    let table = preview.table.unwrap();
    assert_eq!(table.rows[0][0], 7);
    assert_eq!(table.rows[0][1], 1.0);
    assert_eq!(table.rows[0][3], 320);
    assert_eq!(table.rows[0][5], "behouden");
}

#[test]
fn change_codes_and_the_output_column_are_configurable() {
    let mut value = serde_json::to_value(request(choices())).unwrap();
    value["change_codes"] = json!({"size":{"enabled":true,"text":"D"},"level":{"enabled":false,"text":"L"},"moved":{"enabled":true,"text":"P"},"separator":" / "});
    value["output_columns"] = json!([
        {"key":"id","field":"load_point_id","header":"Knoop","enabled":true},
        {"key":"change","field":"change_code","header":"Mutatie","enabled":true}
    ]);
    let preview = preview_revit_revision(&serde_json::from_value(value.clone()).unwrap()).unwrap();
    let table = preview.table.unwrap();
    assert_eq!(table.headers, ["Knoop", "Mutatie"]);
    assert_eq!(table.rows[0][1], "D");
    assert_eq!(table.rows[1][1], "P");
    value["output_columns"][1]["enabled"] = json!(false);
    let table = preview_revit_revision(&serde_json::from_value(value).unwrap())
        .unwrap()
        .table
        .unwrap();
    assert_eq!(table.headers, ["Knoop"]);
    assert_eq!(table.rows.len(), 4);
}

#[test]
fn revision_preserves_marks_extra_columns_and_old_removed_row_with_overlapping_id() {
    let preview = preview_revit_revision(&request(choices())).unwrap();
    assert!(preview.matching.complete);
    assert_eq!(preview.first_new_mark, 10);
    let table = preview.table.unwrap();
    assert_eq!(table.headers.len(), 11);
    assert_eq!(table.headers[10], "Wijzigingscode");
    assert_eq!(table.rows[0][0], 1);
    assert_eq!(table.rows[0][1], 77);
    assert_eq!(table.rows[0][2], "320x320");
    assert_eq!(table.rows[0][8], "K1");
    assert_eq!(table.rows[0][9], "behouden");
    assert_eq!(table.rows[0][10], "S");
    assert_eq!(table.rows[1][10], "M,L");
    assert_eq!(table.rows[2][0], 9);
    assert_eq!(table.rows[2][1], 77);
    assert_eq!(table.rows[2][6], "A");
    assert_eq!(table.rows[2][7], -17.0);
    assert_eq!(table.rows[2][10], "R");
    assert_eq!(table.rows[3][0], 10);
    assert_eq!(table.rows[3][1], 99);
    assert_eq!(table.rows[3][8], Value::Null);
    assert_eq!(table.rows[3][10], "A");
}

#[test]
fn incomplete_mapping_has_no_export_table_and_cannot_be_written() {
    let req = request(Value::Null);
    let preview = preview_revit_revision(&req).unwrap();
    assert_eq!(preview.matching.links.len(), 1);
    assert!(preview.table.is_none());
    assert!(write_revit_revision_xlsx(&req).is_err());
}

#[test]
fn code_style_and_direction_do_not_create_false_level_changes() {
    let mut value = serde_json::to_value(request(choices())).unwrap();
    value["export_options"] =
        json!({"tip_code":{"enabled":true,"sequence":"numbers","direction":"ascending"}});
    let preview = preview_revit_revision(&serde_json::from_value(value).unwrap()).unwrap();
    let rows = preview.table.unwrap().rows;
    assert_eq!(rows[0][6], "3");
    assert_eq!(rows[0][10], "S");
    assert_eq!(rows[1][6], "2");
    assert_eq!(rows[2][6], "A");
    assert_eq!(rows[3][6], "1");
}

#[test]
fn movement_threshold_is_strict_and_xy_distance_is_euclidean() {
    let mut req = request(choices());
    req.new_plan.load_points[1].x_mm = 1099.0;
    assert_eq!(
        preview_revit_revision(&req).unwrap().table.unwrap().rows[1][10],
        "L"
    );
    req.new_plan.load_points[1].x_mm = 1090.0;
    req.new_plan.load_points[1].y_mm = 90.0;
    assert_eq!(
        preview_revit_revision(&req).unwrap().table.unwrap().rows[1][10],
        "M,L"
    );
}

#[test]
fn missing_new_assignment_and_duplicate_marks_are_not_removed_piles() {
    let mut req = request(choices());
    req.new_plan.selected_piles.remove(&99);
    assert!(preview_revit_revision(&req).is_err());
    let mut req = request(choices());
    let text = String::from_utf8(req.old_source.bytes.clone())
        .unwrap()
        .replace("9,77,", "1,77,");
    req.old_source.bytes = text.into_bytes();
    assert!(preview_revit_revision(&req).is_err());
}

#[test]
fn xlsx_contains_typed_values_and_exactly_one_change_column() {
    let req = request(choices());
    let mut book = Xlsx::new(Cursor::new(write_revit_revision_xlsx(&req).unwrap())).unwrap();
    let range = book.worksheet_range("Change table").unwrap();
    assert_eq!(range.get_value((1, 0)), Some(&Data::Float(1.0)));
    assert_eq!(range.get_value((1, 1)), Some(&Data::Float(77.0)));
    assert_eq!(range.get_value((2, 10)), Some(&Data::String("M,L".into())));
    assert_eq!(range.get_size(), (5, 11));
}

#[test]
fn optional_old_fields_stay_missing_and_do_not_create_false_changes() {
    let mut req = request(Value::Null);
    req.old_source.bytes = b"Load Point ID,X,Y,Notitie\n5,0,0,behouden\n".to_vec();
    req.new_plan.load_points.truncate(1);
    let preview = preview_revit_revision(&req).unwrap();
    assert_eq!(
        preview.missing_comparisons,
        vec![
            pile_plan_core::ExportField::PileSize,
            pile_plan_core::ExportField::TipLevel
        ]
    );
    let table = preview.table.unwrap();
    assert_eq!(
        table.rows[0],
        vec![
            json!(77),
            json!(0.0),
            json!(0.0),
            json!("behouden"),
            json!("")
        ]
    );
}

#[test]
fn inspection_ignores_empty_sheets_and_exposes_columns_without_requiring_valid_rows() {
    use pile_plan_core::{inspect_pile_table, ExportField, InspectPileTableRequest};
    let mut workbook = rust_xlsxwriter::Workbook::new();
    workbook.add_worksheet().set_name("Empty").unwrap();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Piles").unwrap();
    sheet.write_string(0, 0, "Project heading").unwrap();
    for (index, header) in ["X [m]", "Y [m]", "Pile Tip Level [mm]", "Custom"]
        .iter()
        .enumerate()
    {
        sheet.write_string(2, index as u16, *header).unwrap();
    }
    let mut source = request(Value::Null).old_source;
    source.format = pile_plan_core::SourceFormat::Xlsx;
    source.file_name = "old.xlsx".into();
    source.bytes = workbook.save_to_buffer().unwrap();
    let inspection = inspect_pile_table(&InspectPileTableRequest { source }).unwrap();
    assert_eq!(inspection.sheet_name.as_deref(), Some("Piles"));
    assert_eq!(inspection.header_row, 3);
    assert!(!inspection.ambiguous_sheet);
    assert_eq!(
        inspection.mapping.coordinate_unit,
        pile_plan_core::ExportLengthUnit::M
    );
    assert_eq!(
        inspection.mapping.tip_unit,
        pile_plan_core::ExportLengthUnit::Mm
    );
    assert_eq!(
        inspection.source_columns.last().unwrap().field,
        ExportField::ChangeCode
    );
    assert_eq!(inspection.source_columns[3].field, ExportField::Source);
}

#[test]
fn custom_source_notation_and_shape_hint_round_trip_without_losing_metadata() {
    let mut value = serde_json::to_value(request(Value::Null)).unwrap();
    value["old_source"]["bytes"] =
        json!(b"Nr,Oost,Noord,Maat,Punt,Extra\n7,0,0,Paal 320 mm,-19.5,behouden\n".to_vec());
    value["old_mapping"] = json!({"columns":{"mark":0,"x":1,"y":2,"pile_size":3,"tip_level":4},"size_template":"Paal {size} mm","size_shape":"round"});
    value["new_plan"]["load_points"] =
        json!([{"id":77,"name":"a","x_mm":0,"y_mm":0,"design_load_kn":100}]);
    let preview = preview_revit_revision(&serde_json::from_value(value).unwrap()).unwrap();
    let table = preview.table.unwrap();
    assert_eq!(table.rows[0][3], "Paal 320 mm");
    assert_eq!(table.rows[0][5], "behouden");
    assert_eq!(table.rows[0][6], "S");
}

#[test]
fn renumber_mode_numbers_the_new_plan_and_keeps_removed_old_marks() {
    let mut value=serde_json::to_value(request(choices())).unwrap();
    value["export_options"]["mark"]["revision_mode"]=json!("renumber");
    value["export_options"]["mark"]["start"]=json!(9);
    value["export_options"]["mark"]["rule"]["x_direction"]=json!("descending");
    value["use_detected_numbering"]=json!(false);
    let preview=preview_revit_revision(&serde_json::from_value(value).unwrap()).unwrap();
    assert_eq!(preview.first_new_mark,9);
    let table=preview.table.unwrap();
    assert_eq!(table.rows.iter().map(|row|row[0].clone()).collect::<Vec<_>>(),vec![json!(11),json!(10),json!(9),json!(9)]);
    assert_eq!(table.rows[2][1],77);assert_eq!(table.rows[2][10],"R");
    assert_eq!(table.rows[0][9],"behouden");assert_eq!(table.rows[0][10],"S");
}
