use pile_plan_core::*;
use serde_json::json;
#[test]
fn inspection_marks_only_applicable_scope_for_any_cpt_and_proposed_count() {
    let loads = (1..=4)
        .map(|id| json!({"id":id,"name":"P","x_mm":(id-1)*1100,"y_mm":0,"design_load_kn":0}))
        .collect::<Vec<_>>();
    let mut value = json!({"load_points":loads,"grouping_settings":{"automatic":true,"max_edge_distance_mm":1200},"cpt_id":99,"selected_piles":{"1":{"pile_size_mm":320,"pile_tip_level_mm":-18000}},"bearing_capacities":[
    {"cpt_id":99,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":700},
    {"cpt_id":99,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":90,"direction":"tension"},
    {"cpt_id":99,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":40,"direction":"tension","pile_count":2},
    {"cpt_id":99,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":0,"direction":"tension","pile_count":4,"missing":true}
    ]});
    let rows = inspect_foundation_advice(
        &serde_json::from_value::<FoundationAdviceInspectionRequest>(value.clone()).unwrap(),
    )
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert!(rows
        .iter()
        .any(|r| r.direction == ResistanceDirection::Compression && r.pile_count.is_none()));
    assert!(rows
        .iter()
        .any(|r| r.direction == ResistanceDirection::Tension
            && r.pile_count == Some(4)
            && r.missing));
    value["proposals"] =
        json!([{"load_point_ids":[1,2,3,4],"pile_count":2,"quarter_turns":0,"configuration":null}]);
    let rows = inspect_foundation_advice(
        &serde_json::from_value::<FoundationAdviceInspectionRequest>(value.clone()).unwrap(),
    )
    .unwrap();
    assert!(rows
        .iter()
        .any(|r| r.pile_count == Some(2) && r.frd_kn == 40.));
    value["grouping_settings"]["max_edge_distance_mm"] = json!(1000);
    value["proposals"] = json!([]);
    let rows = inspect_foundation_advice(
        &serde_json::from_value::<FoundationAdviceInspectionRequest>(value).unwrap(),
    )
    .unwrap();
    assert!(rows.iter().all(|r| r.pile_count.is_none()));
    assert!(rows
        .iter()
        .any(|r| r.direction == ResistanceDirection::Tension && r.frd_kn == 90.));
}
