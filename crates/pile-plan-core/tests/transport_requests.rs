use pile_plan_core::{
    read_ifcpp_str, AggregatePileOptionsRequest, AssessLoadPointGroupAssignmentsRequest,
    DefaultPileOptionsRequest, DeriveLoadPointGroupsRequest, ImportProjectRequest,
    LoadPointTopologyRequest, PileCostRequest, PileCostResponse, PileOptionAnalysisRequest,
    PreviewImportRequest, ProjectDocumentDraft, ReadProjectDocumentRequest, RefreshProjectRequest,
    TechnicalAssignmentRequest, TipLevelRegionTopologyRequest, WriteProjectDocumentRequest,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn accepts<T: DeserializeOwned>(value: Value) {
    serde_json::from_value::<T>(value).unwrap();
}

#[test]
fn wire_requests_keep_empty_maps_and_required_fields() {
    let settings =
        json!({"algorithm":"quadrants", "max_distance_m":25.0, "max_angle_degrees":120.0});
    let analysis = json!({"load_points":[], "cpts":[], "bearing_capacities":[],
        "global_settings":settings, "settings_by_load_point":{}, "manual_cpt_ids_by_load_point":{},
        "include_cpt_frd_rows":false});
    let request: PileOptionAnalysisRequest = serde_json::from_value(analysis.clone()).unwrap();
    assert!(!request.include_cpt_frd_rows);
    for field in analysis.as_object().unwrap().keys() {
        let mut incomplete = analysis.clone();
        incomplete.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<PileOptionAnalysisRequest>(incomplete).is_err(),
            "{field}"
        );
    }
    accepts::<AggregatePileOptionsRequest>(json!({"options_by_load_point":{}}));
    accepts::<TechnicalAssignmentRequest>(json!({"groups":[],"options_by_load_point":{}}));
    accepts::<PileCostRequest>(json!({"pile_size_mm":320,"pile_tip_level_m":-18.5,
        "pile_head_level_m":0.0,"settings":{"schema_version":1,"items":[]}}));
    accepts::<DefaultPileOptionsRequest>(json!({"groups":[],"options_by_load_point":{},
        "pile_head_level_m":0.0,"cost_settings":{"schema_version":1,"items":[]}}));
    accepts::<LoadPointTopologyRequest>(json!({"load_points":[]}));
    accepts::<DeriveLoadPointGroupsRequest>(json!({"load_points":[],"settings":
        serde_json::to_value(pile_plan_core::LoadPointGroupingSettings::default()).unwrap()}));
    accepts::<TipLevelRegionTopologyRequest>(json!({"load_point_topology":
        serde_json::to_value(pile_plan_core::build_load_point_topology(&[])).unwrap(),
        "selected_assignments":{},"options_by_load_point":{}}));
}

#[test]
fn wire_requests_preserve_numeric_map_keys_groups_and_locks() {
    let request: AssessLoadPointGroupAssignmentsRequest = serde_json::from_value(json!({
        "groups":[{"load_point_ids":[1,2],"origin":"automatic"}],
        "assignments":{"1":{"pile_size_mm":320,"pile_tip_level_mm":-18500}},
        "locked_load_point_ids":[2]}))
    .unwrap();
    assert_eq!(request.groups[0].load_point_ids, vec![1, 2]);
    assert_eq!(request.assignments[&1].pile_tip_level_mm, -18500);
    assert_eq!(request.locked_load_point_ids, vec![2]);
    let request: AggregatePileOptionsRequest =
        serde_json::from_value(json!({"options_by_load_point":{"42":[]}})).unwrap();
    assert!(request.options_by_load_point.contains_key(&42));
    assert!(serde_json::from_value::<AggregatePileOptionsRequest>(
        json!({"options_by_load_point":{"invalid":[]}})
    )
    .is_err());
}

#[test]
fn wire_import_and_document_requests_keep_optional_head_level_and_field_names() {
    let source = json!({"role":"load-points","file_name":"points.csv","format":"csv","bytes":[]});
    let value = json!({"project_name":"P","pile_head_level_m":null,"currency_code":"EUR","sources":[source.clone()]});
    let request: ImportProjectRequest = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(request.pile_head_level_m, None);
    let mut omitted = value;
    omitted.as_object_mut().unwrap().remove("pile_head_level_m");
    accepts::<ImportProjectRequest>(omitted);
    accepts::<PreviewImportRequest>(json!({"source":source}));
    let contents = include_str!("../../../sample_project/sample_project.ifcpp");
    let project = read_ifcpp_str(contents).unwrap();
    accepts::<RefreshProjectRequest>(json!({"current_project":project,"sources":[]}));
    accepts::<ReadProjectDocumentRequest>(json!({"contents":contents}));
    accepts::<WriteProjectDocumentRequest>(
        json!({"draft":ProjectDocumentDraft::from_project(&project)}),
    );
    assert!(
        serde_json::from_value::<ReadProjectDocumentRequest>(json!({"Contents":contents})).is_err()
    );
    assert_eq!(
        serde_json::to_value(PileCostResponse { cost: None }).unwrap(),
        json!({"cost":null})
    );
    assert_eq!(
        serde_json::to_value(PileCostResponse { cost: Some(42) }).unwrap(),
        json!({"cost":42})
    );
}
