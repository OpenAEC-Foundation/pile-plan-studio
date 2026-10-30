use pile_plan_core::*;
use serde_json::{json, Value};
fn request() -> PileCapProposalRequest {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut draft = ProjectDocumentDraft::from_project(&project);
    draft.inputs.load_points = serde_json::from_value(json!([
        {"id":1,"name":"a","x_mm":0.0,"y_mm":0.0,"design_load_kn":700.0},
        {"id":2,"name":"b","x_mm":1100.0,"y_mm":0.0,"design_load_kn":500.0}
    ]))
    .unwrap();
    draft.inputs.cpts = serde_json::from_value(json!([
        {"id":11,"name":"S11","x_mm":0.0,"y_mm":1000.0},
        {"id":12,"name":"S12","x_mm":1100.0,"y_mm":1000.0}
    ]))
    .unwrap();
    draft.inputs.bearing_capacities = serde_json::from_value(json!([
        {"cpt_id":11,"pile_tip_level_m":-18.5,"pile_size_mm":320,"frd_kn":700.0},
        {"cpt_id":12,"pile_tip_level_m":-18.5,"pile_size_mm":320,"frd_kn":600.0}
    ]))
    .unwrap();
    draft.settings.load_point_grouping = Default::default();
    draft.settings.pile_head_level_m = Some(0.0);
    draft.settings.cpt_selection_by_load_point.clear();
    draft.user_state.manual_cpt_selections =
        std::collections::HashMap::from([(1, vec![11]), (2, vec![12])]);
    draft.user_state.pile_plans.truncate(1);
    draft.user_state.pile_plans[0].pile_cap_proposals = vec![PileCapProposal {
        load_point_ids: vec![1, 2],
        pile_count: 3,
        quarter_turns: 0,
        configuration: Some(pile_plan_core::PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18500,
        }),
    }];
    PileCapProposalRequest { draft, edit: None }
}

fn export(include: bool) -> ConfiguredPilePlanExportRequest {
    let input = request();
    let id = input.draft.user_state.pile_plans[0].id.clone();
    serde_json::from_value(json!({"plan":{"load_points":[],"selected_piles":{},"selected_cpts":{},"project_context":{"draft":input.draft,"plan_id":id}},"export_options":{"include_proposals":include,"columns":[
        {"key":"id","field":"export_id","header":"ID"},
        {"key":"source","field":"load_point_id","header":"Source"},
        {"key":"origins","field":"original_locations","header":"Origins"},
        {"key":"r","field":"compression_resistance","header":"R"},
        {"key":"u","field":"compression_utilization","header":"U"},
        {"key":"l","field":"pile_length","header":"Length"},
        {"key":"g","field":"governing_cpt","header":"CPT"}
    ]}})).unwrap()
}
#[test]
fn proposals_have_reproducible_numeric_ids_origins_and_complete_analysis() {
    let req = export(true);
    let first = preview_configured_pile_plan_export(&req).unwrap();
    assert_eq!(first.table.rows.len(), 3);
    for (index, row) in first.table.rows.iter().enumerate() {
        assert_eq!(row[0], json!(index + 3));
        assert_eq!(row[1], Value::Null);
        assert_eq!(row[2], json!("1, 2"));
        assert_eq!(row[3], json!(600.0));
        assert!((row[4].as_f64().unwrap() - 200.0 / 3.0).abs() < 1e-10);
        assert_eq!(row[5], json!(18.5));
        assert_eq!(row[6], json!(12));
    }
    assert_eq!(first, preview_configured_pile_plan_export(&req).unwrap());
}
#[test]
fn partial_capacity_never_exports_complete_assessment() {
    let mut req = export(true);
    req.plan
        .project_context
        .as_mut()
        .unwrap()
        .draft
        .inputs
        .bearing_capacities
        .retain(|c| c.cpt_id == 11);
    let rows = preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows;
    assert_eq!(&rows[0][3..5], &[Value::Null, Value::Null]);
    assert_eq!(rows[0][6], Value::Null);
    assert_eq!(rows[0][5], json!(18.5));
}
#[test]
fn invalid_proposals_block_only_when_included() {
    let mut req = export(true);
    req.plan
        .project_context
        .as_mut()
        .unwrap()
        .draft
        .settings
        .load_point_grouping
        .automatic = false;
    assert!(preview_configured_pile_plan_export(&req).is_err());
    req.export_options.include_proposals = false;
    assert_eq!(
        preview_configured_pile_plan_export(&req)
            .unwrap()
            .table
            .rows
            .len(),
        2
    );
}
#[test]
fn cap_replacement_is_removed_added_even_for_identical_positions() {
    let mut req = export(true);
    req.plan
        .project_context
        .as_mut()
        .unwrap()
        .draft
        .user_state
        .pile_plans[0]
        .pile_cap_proposals[0]
        .pile_count = 2;
    let revision:RevitRevisionRequest=serde_json::from_value(json!({"new_plan":req.plan,"export_options":req.export_options,
        "old_source":{"file_name":"old.csv","format":"csv","bytes":b"Load Point ID,X [mm],Y [mm],Pile Size [mm],Pile Tip Level [m]\n1,0,0,320,-18.5\n2,1100,0,320,-18.5\n".to_vec()}})).unwrap();
    let result = preview_revit_revision(&revision).unwrap();
    assert!(result.matching.links.is_empty());
    assert_eq!(result.matching.added.len(), 2);
    assert_eq!(result.matching.removed.len(), 2);
    assert!(result.matching.complete);
}

#[test]
fn ambiguous_original_positions_can_be_reviewed_before_cap_replacement() {
    let req = export(true);
    let revision:RevitRevisionRequest=serde_json::from_value(json!({"new_plan":req.plan,"export_options":req.export_options,"tolerance_mm":1200,
 "old_source":{"file_name":"old.csv","format":"csv","bytes":b"Mark,X [mm],Y [mm],Pile Size [mm],Pile Tip Level [m]\n1,0,0,320,-18.5\n2,1100,0,320,-18.5\n".to_vec()}})).unwrap();
    let preview = preview_revit_revision(&revision).unwrap();
    assert!(preview.table.is_none());
    let mut value = serde_json::to_value(revision).unwrap();
    value["source_decisions"] =
        json!({"links":[{"old_id":1,"new_id":1},{"old_id":2,"new_id":2}],"added":[],"removed":[]});
    let reviewed = preview_revit_revision(&serde_json::from_value(value).unwrap()).unwrap();
    assert!(reviewed.matching.complete);
    assert_eq!(reviewed.matching.removed.len(), 2);
    assert_eq!(reviewed.matching.added.len(), 3);
}

#[test]
fn alternate_csv_is_usable_as_a_new_table_without_inventing_source_ids() {
    let mut req = export(true);
    let fields = [
        ("export_id", "Export ID"),
        ("load_point_id", "Load Point ID"),
        ("x", "X [mm]"),
        ("y", "Y [mm]"),
        ("pile_size", "Pile Size [mm]"),
        ("tip_level", "Pile Tip Level [m]"),
    ];
    req.export_options.columns=Some(serde_json::from_value(json!(fields.iter().map(|(field,header)|json!({"key":field,"field":field,"header":header,"size_format":if *field=="pile_size" {json!("dimensions")}else{Value::Null}})).collect::<Vec<_>>())).unwrap());
    let bytes = write_configured_pile_plan_csv(&req).unwrap();
    let revision: RevitRevisionRequest = serde_json::from_value(json!({"new_plan":req.plan,
 "old_source":{"file_name":"old.csv","format":"csv","bytes":bytes},
 "new_source":{"file_name":"new.csv","format":"csv","bytes":bytes}}))
    .unwrap();
    let result = preview_revit_revision(&revision).unwrap();
    assert!(result.matching.complete);
    assert!(result
        .new_locations
        .iter()
        .all(|p| p.source_id.is_none() && p.export_id.is_some()));
}

#[test]
fn explicit_destination_uses_its_assignments_instead_of_active_or_request_maps() {
    let mut req = export(false);
    let ctx = req.plan.project_context.as_mut().unwrap();
    let mut other = ctx.draft.user_state.pile_plans[0].clone();
    other.id = "destination".into();
    other.pile_cap_proposals.clear();
    other.selected_piles.clear();
    other.selected_piles.insert(
        1,
        SelectedPileChoice {
            pile: Some(PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18500,
            }),
            external_references: vec![],
        },
    );
    ctx.draft.user_state.pile_plans.push(other);
    ctx.plan_id = "destination".into();
    let rows = preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows;
    assert_eq!(rows[0][3], json!(700.0));
    assert_eq!(rows[0][6], json!(11));
    assert_eq!(rows[1][3], Value::Null);
}
#[test]
fn missing_head_or_price_is_not_zero_and_true_zero_resistance_is_preserved() {
    let mut req = export(true);
    req.export_options.columns=Some(serde_json::from_value(json!([
 {"key":"r","field":"compression_resistance","header":"R"},{"key":"u","field":"compression_utilization","header":"U"},
 {"key":"c","field":"pile_cost","header":"C"},{"key":"l","field":"pile_length","header":"L"},{"key":"s","field":"technical_status","header":"S"}])).unwrap());
    let ctx = req.plan.project_context.as_mut().unwrap();
    ctx.draft.settings.pile_head_level_m = None;
    for cap in &mut ctx.draft.inputs.bearing_capacities {
        cap.frd_kn = 0.0;
    }
    let row = &preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows[0];
    assert_eq!(row[0], json!(0.0));
    assert_eq!(row[1], Value::Null);
    assert_eq!(row[2], Value::Null);
    assert_eq!(row[3], Value::Null);
    assert_eq!(row[4], json!("Onvoldoende capaciteit"));
    let ctx = req.plan.project_context.as_mut().unwrap();
    ctx.draft.settings.pile_head_level_m = Some(0.0);
    ctx.draft.settings.pile_costs.items.clear();
    let row = &preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows[0];
    assert_eq!(row[2], Value::Null);
    assert_eq!(row[3], json!(18.5));
}
#[test]
fn spatial_mark_uses_fixed_export_positions_without_changing_export_ids() {
    let mut req = export(true);
    req.export_options.columns=Some(serde_json::from_value(json!([
 {"key":"id","field":"export_id","header":"ID"},{"key":"x","field":"x","header":"X"},{"key":"mark","field":"mark","header":"Mark"}])).unwrap());
    let first = preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows;
    req.export_options.mark.rule.x_direction = NumberingDirection::Descending;
    let second = preview_configured_pile_plan_export(&req)
        .unwrap()
        .table
        .rows;
    assert_eq!(
        first.iter().map(|r| r[0].clone()).collect::<Vec<_>>(),
        second.iter().map(|r| r[0].clone()).collect::<Vec<_>>()
    );
    assert!(first[0][1].as_f64().unwrap() < first[2][1].as_f64().unwrap());
    assert_eq!(first[0][2], json!(1));
    assert_eq!(second[0][2], json!(3));
}

#[test]
fn status_columns_have_independent_custom_values_and_blank_cells() {
    let mut req = export(true);
    req.export_options.columns=Some(serde_json::from_value(json!([
 {"key":"standard","field":"technical_status","header":"Standard"},
 {"key":"custom","field":"technical_status","header":"Code","status_values":{"valid":"OK","insufficient":"NOK","missing":"?","no_cpts":"CPT?","unassigned":""}},
 {"key":"blank","field":"technical_status","header":"Blank","status_values":{}}
 ])).unwrap());
    assert_eq!(
        preview_configured_pile_plan_export(&req)
            .unwrap()
            .table
            .rows[0],
        vec![json!("Voldoende capaciteit"), json!("OK"), json!("")]
    );
    req.export_options.language = "en".into();
    assert_eq!(
        preview_configured_pile_plan_export(&req)
            .unwrap()
            .table
            .rows[0],
        vec![json!("Sufficient capacity"), json!("OK"), json!("")]
    );
    req.plan
        .project_context
        .as_mut()
        .unwrap()
        .draft
        .inputs
        .bearing_capacities
        .retain(|c| c.cpt_id == 11);
    assert_eq!(
        preview_configured_pile_plan_export(&req)
            .unwrap()
            .table
            .rows[0][1],
        json!("?")
    );
}

#[test]
fn custom_codes_cover_each_engineering_status() {
    for (case, expected) in [
        ("valid", "OK"),
        ("insufficient", "NOK"),
        ("missing", "?"),
        ("no_cpts", "CPT?"),
        ("unassigned", ""),
    ] {
        let mut req = export(true);
        let draft = &mut req.plan.project_context.as_mut().unwrap().draft;
        match case {
            "insufficient" => {
                draft.inputs.load_points[0].design_load_kn = 100000.0;
            }
            "missing" => {
                draft.inputs.bearing_capacities.retain(|c| c.cpt_id == 11);
            }
            "no_cpts" => {
                draft.user_state.manual_cpt_selections.insert(2, vec![]);
            }
            "unassigned" => {
                draft.user_state.pile_plans[0].pile_cap_proposals[0].configuration = None;
            }
            _ => {}
        }
        req.export_options.columns=Some(serde_json::from_value(json!([{"key":"s","field":"technical_status","header":"Code","status_values":{"valid":"OK","insufficient":"NOK","missing":"?","no_cpts":"CPT?","unassigned":""}}])).unwrap());
        assert_eq!(
            preview_configured_pile_plan_export(&req)
                .unwrap()
                .table
                .rows[0][0],
            json!(expected),
            "{case}"
        );
    }
}
#[test]
fn revision_uses_custom_codes_only_for_current_evaluated_rows() {
    let req = export(true);
    let revision:RevitRevisionRequest=serde_json::from_value(json!({"new_plan":req.plan,"export_options":req.export_options,
 "old_source":{"file_name":"old.csv","format":"csv","bytes":b"Load Point ID,X [mm],Y [mm],Pile Size [mm],Pile Tip Level [m],Technical status\n1,0,0,320,-18.5,Historical\n2,1100,0,320,-18.5,Unknown source code\n".to_vec()},
 "output_columns":[{"key":"s","field":"technical_status","header":"Status","source_index":5,"status_values":{"valid":"OK"}}]})).unwrap();
    let rows = preview_revit_revision(&revision)
        .unwrap()
        .table
        .unwrap()
        .rows;
    assert_eq!(rows[0][0], json!("Historical"));
    assert_eq!(rows[1][0], json!("Unknown source code"));
    assert!(rows[2..].iter().all(|r| r[0] == json!("OK")));
}

#[test]
fn exports_independent_tension_facts_and_status_codes_for_proposals() {
 let mut req=export(true);
 let draft=&mut req.plan.project_context.as_mut().unwrap().draft;
 for p in &mut draft.inputs.load_points {p.tension=TensionDemand::Known{value_kn:150.};}
 let rows=draft.inputs.bearing_capacities.clone();
 for mut row in rows {row.direction=ResistanceDirection::Tension;row.frd_kn=120.;draft.inputs.bearing_capacities.push(row);}
 req.export_options.columns=Some(serde_json::from_value(json!([
  {"key":"p","field":"design_load","header":"P"},{"key":"t","field":"tension_load","header":"T"},
  {"key":"r","field":"tension_resistance","header":"R"},{"key":"u","field":"tension_utilization","header":"U"},
  {"key":"s","field":"tension_status","header":"Status","status_values":{"valid":"OK"}}
 ])).unwrap());
 let result=preview_configured_pile_plan_export(&req).unwrap();
 assert_eq!(result.table.rows[0][0],400.);assert_eq!(result.table.rows[0][1],100.);assert_eq!(result.table.rows[0][2],120.);
 assert!((result.table.rows[0][3].as_f64().unwrap()-10000./120.).abs()<1e-10);assert_eq!(result.table.rows[0][4],"OK");
 let draft=&mut req.plan.project_context.as_mut().unwrap().draft;
 for p in &mut draft.inputs.load_points {p.tension=Default::default();}
 let result=preview_configured_pile_plan_export(&req).unwrap();assert_eq!(result.table.rows[0][1],Value::Null);assert_eq!(result.table.rows[0][4],"Trek niet beoordeeld");
}

#[test]
fn proposal_export_uses_scoped_resistance_for_the_proposed_count(){
 let mut req=export(true);
 let draft=&mut req.plan.project_context.as_mut().unwrap().draft;
 let scoped=draft.inputs.bearing_capacities.iter().cloned().map(|mut v|{v.pile_count=Some(3);v.frd_kn=100.;v}).collect::<Vec<_>>();
 draft.inputs.bearing_capacities.extend(scoped);
 let preview=preview_configured_pile_plan_export(&req).unwrap();
 assert_eq!(preview.table.rows.len(),3);
 assert!(preview.table.rows.iter().all(|r|r[3]==json!(100.)));
}
