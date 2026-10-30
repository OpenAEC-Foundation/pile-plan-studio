use pile_plan_core::*;
use serde_json::{json, Value};
fn source(role: &str, text: &str, settings: Value) -> ImportSource {
    serde_json::from_value(json!({"role":role,"file_name":"input.csv","profile":"standard-table","format":"csv","bytes":text.as_bytes(),"profile_options":{"table":settings}})).unwrap()
}
fn preview(source: &ImportSource) -> Value {
    serde_json::to_value(preview_import_source(source)).unwrap()
}
#[test]
fn shuffled_columns_are_inferred_and_preview_keeps_source_rows() {
    let p = preview(&source(
        "load-points",
        "Trekbelasting,Y,Nummer,FEd,X\n0,2,1,50,3\n12,4,2,60,5\n",
        Value::Null,
    ));
    assert_eq!(p["item_count"], 2);
    assert_eq!(p["table"]["rows"][0]["number"], 1);
    assert_eq!(
        p["resolved_options"]["table"]["columns"][0]["field"],
        "tension"
    );
    assert_eq!(p["resolved_options"]["table"]["columns"][2]["field"], "id");
}
#[test]
fn mapped_units_headers_and_semicolon_are_used_by_actual_import() {
    let mut loads = source(
        "load-points",
        "Metadata\nNorth;Number;East;Pull;Push\n2;1;3;0;50\n",
        json!({"has_headers":true,"header_row":2,"first_data_row":3,"delimiter":";","columns":[{"column":1,"field":"y","unit":"m"},{"column":2,"field":"id"},{"column":3,"field":"x","unit":"m"},{"column":4,"field":"tension"},{"column":5,"field":"compression"}]}),
    );
    let p = preview_import_source(&loads);
    loads.profile_options = p.resolved_options;
    let cpts = source("cpts", "1,3000,2000\n", Value::Null);
    let advice = source("bearing-capacities", "1,-18,320,100\n", Value::Null);
    let project =
        import_project_from_sources("test", &[loads, cpts, advice], Some(0.), "EUR").unwrap();
    assert_eq!(project.inputs.load_points[0].x_mm, 3000.);
    assert_eq!(project.inputs.load_points[0].y_mm, 2000.);
    assert_eq!(project.inputs.load_points[0].design_load_kn, 50.);
    assert!(matches!(
        project.inputs.load_points[0].tension,
        TensionDemand::Known { value_kn: 0. }
    ));
}
#[test]
fn empty_column_is_invalid_but_value_beyond_preview_is_not_empty() {
    let settings = json!({"has_headers":false,"first_data_row":1,"columns":[{"column":1,"field":"id"},{"column":2,"field":"x"},{"column":3,"field":"y"},{"column":4,"field":"compression"},{"column":5,"field":"tension"}]});
    assert!(
        preview_import_source(&source("load-points", "1,0,0,10,\n", settings.clone())).has_errors()
    );
    let text = (1..=50)
        .map(|i| format!("{i},{i},0,10,{}\n", if i == 50 { "0" } else { "" }))
        .collect::<String>();
    let p = preview(&source("load-points", &text, settings));
    assert_eq!(p["item_count"], 50);
    assert_eq!(p["table"]["columns"][4]["numeric_count"], 1);
    assert!(p["table"]["rows"].as_array().unwrap().len() <= 25);
}
#[test]
fn duplicate_mapping_is_rejected_and_optional_blank_is_not_zero() {
    let settings = json!({"has_headers":false,"first_data_row":1,"columns":[{"column":1,"field":"id"},{"column":2,"field":"x"},{"column":3,"field":"y"},{"column":4,"field":"compression"},{"column":5,"field":"x"}]});
    assert!(preview_import_source(&source("load-points", "1,0,0,10,20\n", settings)).has_errors());
    let p = preview(&source(
        "load-points",
        "ID,X,Y,FEd,Trek\n1,0,0,10,\n2,1,0,20,0\n",
        Value::Null,
    ));
    assert_eq!(p["item_count"], 2);
    assert!(p["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "missing-tension-demand"));
}
#[test]
fn advice_combined_mapping_and_empty_column_are_validated() {
    let s = source(
        "bearing-capacities",
        "Trekweerstand,Afmeting,Sondering,Drukweerstand,Paalpuntniveau\n40,320,1,600,-18\n",
        Value::Null,
    );
    let p = serde_json::to_value(preview_advice_source(&s)).unwrap();
    assert_eq!(p["sheets"][0]["summary"]["item_count"], 2);
    assert_eq!(
        p["sheets"][0]["table"]["settings"]["columns"][0]["field"],
        "tension"
    );
    let empty = source(
        "bearing-capacities",
        "1,-18,320,600,\n",
        json!({"has_headers":false,"first_data_row":1,"columns":[{"column":1,"field":"id"},{"column":2,"field":"tip-level"},{"column":3,"field":"pile-size"},{"column":4,"field":"resistance"},{"column":5,"field":"tension"}]}),
    );
    let p = preview_advice_source(&empty);
    assert_ne!(
        serde_json::to_value(p).unwrap()["sheets"][0]["status"],
        "ready"
    );
}
#[test]
fn mapped_matrix_is_one_direction_and_supports_explicit_sizes() {
    let mut s = source(
        "bearing-capacities",
        "Sondering,Tip,Small,Large\n1,-18,40,80\n",
        json!({"has_headers":true,"header_row":1,"first_data_row":2,"columns":[{"column":1,"field":"id"},{"column":2,"field":"tip-level"},{"column":3,"field":"resistance","pile_size_mm":290},{"column":4,"field":"resistance","pile_size_mm":320}]}),
    );
    s.profile = ImportProfile::CapacityColumns;
    s.profile_options.resistance_direction = ResistanceDirection::Tension;
    let p = serde_json::to_value(preview_advice_source(&s)).unwrap();
    assert_eq!(p["sheets"][0]["summary"]["item_count"], 2);
    assert_eq!(
        p["sheets"][0]["summary"]["pile_sizes_mm"],
        json!([290, 320])
    );
    s.profile_options.tension_column = Some(4);
    assert_ne!(
        serde_json::to_value(preview_advice_source(&s)).unwrap()["sheets"][0]["status"],
        "ready"
    );
}
#[test]
fn mapped_error_points_to_original_row_and_column() {
    let p = preview(&source("cpts", "Y,ID,X\n2,1,broken\n", Value::Null));
    assert_eq!(p["diagnostics"][0]["location"]["row"], 2);
    assert_eq!(p["diagnostics"][0]["location"]["column"], 3);
}
#[test]
fn fifth_numeric_column_and_legacy_blank_advice_heading_are_inferred() {
    let p = preview(&source(
        "load-points",
        "ID,X,Y,FEd,Extra\n1,0,0,10,0\n",
        Value::Null,
    ));
    assert_eq!(
        p["resolved_options"]["table"]["columns"][4]["field"],
        "tension"
    );
    let p = serde_json::to_value(preview_advice_source(&source(
        "bearing-capacities",
        "Sondering,Paalpuntniveau,,FRd\n1,-18,320,600\n",
        Value::Null,
    )))
    .unwrap();
    assert_eq!(p["sheets"][0]["status"], "ready");
}
#[test]
fn textual_first_row_is_header_even_with_unknown_captions() {
    let p = preview(&source(
        "load-points",
        "Point,Eastings,Northings,Force\n1,0,2,40\n",
        Value::Null,
    ));
    assert_eq!(p["resolved_options"]["table"]["has_headers"], true);
    assert_eq!(p["resolved_options"]["table"]["first_data_row"], 2);
    assert_eq!(p["table"]["columns"][0]["header"], "Point");
}
#[test]
fn explicit_no_header_does_not_silently_discard_a_text_data_row() {
    let p = preview_import_source(&source(
        "load-points",
        "bad,0,2,40\n1,1,2,40\n",
        json!({"has_headers":false,"first_data_row":1}),
    ));
    assert!(p.has_errors());
}

#[test]
fn joint_preview_uses_the_same_cpt_mapping_as_actual_import() {
    let mut loads = source("load-points", "ID,X,Y,FEd\n1,0,0,100\n", Value::Null);
    loads.profile_options = preview_import_source(&loads).resolved_options;
    let mut cpts = source("cpts", "Y,ID,X\n0,1,0\n", Value::Null);
    cpts.profile_options = preview_import_source(&cpts).resolved_options;
    let advice = source("bearing-capacities", "1,-18,320,150\n", Value::Null);
    let request: PreviewProjectImportRequest =
        serde_json::from_value(json!({"sources":[loads,cpts,advice],"current_project":null}))
            .unwrap();
    let result = preview_project_import(&request);
    assert!(result.can_apply);
    assert_eq!(result.imported_value_count, 1);
    assert_eq!(result.orphan_value_count, 0);
}

#[test]
fn csv_advice_uses_delimiter_from_its_sheet_editor() {
    let mut advice = source(
        "bearing-capacities",
        "Metadata\nSondering;Tip;Size;FRd\n1;-18;320;150\n",
        Value::Null,
    );
    advice.profile_options.advice_sheets = Some(vec![serde_json::from_value(json!({
        "sheet_name":"", "profile":"standard-table", "direction":"compression",
        "table":{"delimiter":";","has_headers":true,"header_row":2,"first_data_row":3,
        "columns":[{"column":1,"field":"id"},{"column":2,"field":"tip-level"},{"column":3,"field":"pile-size"},{"column":4,"field":"resistance"}]}
    })).unwrap()]);
    let preview = preview_advice_source(&advice);
    assert_eq!(preview.sheets[0].status, AdviceSheetStatus::Ready);
    assert_eq!(preview.sheets[0].summary.item_count, 1);
    let project = import_project_from_sources(
        "test",
        &[
            source("load-points", "1,0,0,100\n", Value::Null),
            source("cpts", "1,0,0\n", Value::Null),
            advice,
        ],
        Some(0.),
        "EUR",
    )
    .unwrap();
    assert_eq!(project.inputs.bearing_capacities[0].frd_kn, 150.);
}

#[test]
fn advice_fixed_sheet_size_and_scope_keep_blank_values_as_missing(){
 let settings=json!({"fixed_pile_size_mm":320,"pile_count":4,"has_headers":true,"header_row":1,"first_data_row":2,"columns":[{"column":1,"field":"id"},{"column":2,"field":"tip-level","unit":"m"},{"column":3,"field":"tension"}]});
 let mut s=source("bearing-capacities","Sondering,PPN,Rt;d Indicatief [kN]\n1,-23,317.8\n2,-23,\n",settings);
 let p=preview_advice_source(&s);
 assert_eq!(p.sheets[0].status,AdviceSheetStatus::Ready);assert_eq!(p.sheets[0].summary.pile_sizes_mm,vec![320]);
 s.profile_options.advice_sheets=Some(p.suggested_selection);
 let loads=source("load-points","1,0,0,10\n",Value::Null);
 let cpts=source("cpts","1,0,0\n2,1000,0\n",Value::Null);
 let imported=import_project_from_sources("scoped",&[loads,cpts,s],Some(0.),"EUR").unwrap();
 let rows=&imported.inputs.bearing_capacities;assert_eq!(rows.len(),2);
 assert!(rows.iter().all(|v|v.pile_count==Some(4)&&v.direction==ResistanceDirection::Tension));
 assert!(rows.iter().any(|v|v.cpt_id==2&&v.missing));
}

#[test]
fn advice_recognizes_kenmerk_and_waarde_without_changing_other_roles() {
 let p=preview(&source("bearing-capacities","Waarde,Kenmerk,PPN,Naam Sondering\n700,320,-18,1\n",Value::Null));
 let sheet=&p["details"]["sheets"][0];
 assert_eq!(sheet["table"]["settings"]["columns"][1]["field"],"pile-size");
 assert_eq!(sheet["table"]["settings"]["columns"][0]["field"],"resistance");
 assert_eq!(sheet["status"],"ready");
 let legacy=preview(&source("bearing-capacities","Sond.,niveau2,Kenmerk,Waarde\n1,-18,320,700\n",Value::Null));
 assert_eq!(legacy["details"]["sheets"][0]["status"],"ready");
 let columns=legacy["details"]["sheets"][0]["table"]["settings"]["columns"].as_array().unwrap();
 assert_eq!(columns.iter().map(|c|c["field"].as_str().unwrap()).collect::<Vec<_>>(),vec!["id","tip-level","pile-size","resistance"]);
 let other=preview(&source("load-points","ID,X,Y,Kenmerk,Waarde\n1,0,0,320,700\n",Value::Null));
 assert_ne!(other["table"]["settings"]["columns"][3]["field"],"pile-size");
 assert_ne!(other["table"]["settings"]["columns"][4]["field"],"resistance");
}
