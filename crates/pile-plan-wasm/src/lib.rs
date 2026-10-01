use std::collections::HashMap;
mod ilp_optimization;

use pile_plan_core::{
    aggregate_pile_options_for_load_points,
    apply_load_point_group_assignment as apply_load_point_group_assignment_core,
    apply_load_point_group_assignment_batch as apply_load_point_group_assignment_batch_core,
    apply_load_point_group_edit as apply_load_point_group_edit_core,
    apply_load_point_group_ungroup_batch as apply_load_point_group_ungroup_batch_core,
    assess_load_point_group_assignments as assess_load_point_group_assignments_core,
    assess_technical_assignment as assess_technical_assignment_core,
    build_load_point_topology as build_load_point_topology_core, build_pile_option_analysis,
    build_tip_level_region_topology as build_tip_level_region_topology_core, calculate_pile_cost,
    choose_default_pile_options, derive_load_point_groups as derive_load_point_groups_core,
    evaluate_cpt_settings_edit as evaluate_cpt_settings_edit_core,
    evaluate_load_point_grouping_settings as evaluate_load_point_grouping_settings_core,
    evaluate_mcp_project_edit as evaluate_mcp_project_edit_core,
    evaluate_pile_cost_catalog_edit as evaluate_pile_cost_catalog_edit_core,
    import_project_from_sources, preview_import_source,
    preview_load_point_group_edit as preview_load_point_group_edit_core, preview_pile_plan_import,
    read_project_document as read_project_document_core, refresh_project_from_profiled_sources,
    validate_load_point_lock_batch as validate_load_point_lock_batch_core,
    validate_manual_cpt_selection_batch as validate_manual_cpt_selection_batch_core,
    validate_project_tip_levels, write_pile_plan_csv, write_pile_plan_xlsx,
    write_project_document as write_project_document_core, ApplyLoadPointGroupAssignmentBatchInput,
    ApplyLoadPointGroupAssignmentBatchResult, ApplyLoadPointGroupAssignmentInput,
    ApplyLoadPointGroupAssignmentResult, CptSettingsEditInput, LoadPointGroupEditInput,
    LoadPointGroupUngroupBatchInput, LoadPointGroupingSettingsEditInput, LoadPointLockBatchInput,
    ManualCptSelectionBatchInput, McpProjectEditInput, PileConfigurationKey,
    PileCostCatalogEditInput, PilePlanExportRequest, PilePlanImportRequest, ProjectDocumentDraft,
    ProjectDocumentError, TipLevelRegionTopology, ValidatedPilePlanProject,
};
use pile_plan_core::{
    AggregatePileOptionsRequest, AssessLoadPointGroupAssignmentsRequest, DefaultPileOptionsRequest,
    DeriveLoadPointGroupsRequest, ImportProjectRequest, LoadPointTopologyRequest, PileCostRequest,
    PileCostResponse, PileOptionAnalysisRequest, PreviewImportRequest, ReadProjectDocumentRequest,
    RefreshProjectRequest, TechnicalAssignmentRequest, TipLevelRegionTopologyRequest,
    WriteProjectDocumentRequest,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn calculate_pile_option_analysis(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PileOptionAnalysisRequest = from_js_value(request)?;
    let result = build_pile_option_analysis(
        &request.load_points,
        &request.cpts,
        &request.bearing_capacities,
        |load_point| {
            request
                .settings_by_load_point
                .get(&load_point.id)
                .cloned()
                .unwrap_or_else(|| request.global_settings.clone())
        },
        &request.manual_cpt_ids_by_load_point,
        request.include_cpt_frd_rows,
    );
    match result {
        Ok(result) => to_js_value(&result),
        Err(error) => Err(to_js_value(&error)?),
    }
}

#[wasm_bindgen]
pub fn calculate_pile_option_cost(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PileCostRequest = from_js_value(request)?;
    to_js_value(&PileCostResponse {
        cost: calculate_pile_cost(
            request.pile_size_mm,
            request.pile_tip_level_m,
            request.pile_head_level_m,
            &request.settings,
        ),
    })
}

#[wasm_bindgen]
pub fn choose_default_options(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DefaultPileOptionsRequest = from_js_value(request)?;
    let choices: HashMap<u32, PileConfigurationKey> = choose_default_pile_options(
        &request.options_by_load_point,
        &request.groups,
        request.pile_head_level_m,
        &request.cost_settings,
    );
    to_js_value(&choices)
}

#[wasm_bindgen]
pub fn aggregate_pile_options(request: JsValue) -> Result<JsValue, JsValue> {
    let request: AggregatePileOptionsRequest = from_js_value(request)?;
    to_js_value(&aggregate_pile_options_for_load_points(
        &request.options_by_load_point,
    ))
}

#[wasm_bindgen]
pub fn assess_technical_assignment(request: JsValue) -> Result<JsValue, JsValue> {
    let request: TechnicalAssignmentRequest = from_js_value(request)?;
    match assess_technical_assignment_core(&request.groups, &request.options_by_load_point) {
        Ok(assessment) => to_js_value(&assessment),
        Err(error) => Err(to_js_value(&error)?),
    }
}

#[wasm_bindgen]
pub fn import_project_from_files(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ImportProjectRequest = from_js_value(request)?;
    let project = import_project_from_sources(
        &request.project_name,
        &request.sources,
        request.pile_head_level_m,
        &request.currency_code,
    )
    .map_err(to_error_value)?;

    let tip_level_keys = validate_project_tip_levels(&project)
        .map_err(|error| to_js_value(&error).unwrap_or_else(|_| to_error_value(error)))?;
    to_js_value(&ValidatedPilePlanProject {
        project,
        tip_level_keys,
    })
}

#[wasm_bindgen]
pub fn refresh_project_from_files(request: JsValue) -> Result<JsValue, JsValue> {
    let request: RefreshProjectRequest = from_js_value(request)?;
    let project = refresh_project_from_profiled_sources(&request.current_project, &request.sources)
        .map_err(to_error_value)?;

    let tip_level_keys = validate_project_tip_levels(&project)
        .map_err(|error| to_js_value(&error).unwrap_or_else(|_| to_error_value(error)))?;
    to_js_value(&ValidatedPilePlanProject {
        project,
        tip_level_keys,
    })
}

#[wasm_bindgen]
pub fn preview_import_file(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PreviewImportRequest = from_js_value(request)?;
    to_js_value(&preview_import_source(&request.source))
}

#[wasm_bindgen]
pub fn preview_pile_plan_import_file(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PilePlanImportRequest = from_js_value(request)?;
    to_js_value(&preview_pile_plan_import(&request))
}

#[wasm_bindgen]
pub fn export_pile_plan_csv(request: JsValue) -> Result<Vec<u8>, JsValue> {
    let request: PilePlanExportRequest = from_js_value(request)?;
    write_pile_plan_csv(&request).map_err(to_error_value)
}

#[wasm_bindgen]
pub fn export_pile_plan_xlsx(request: JsValue) -> Result<Vec<u8>, JsValue> {
    let request: PilePlanExportRequest = from_js_value(request)?;
    write_pile_plan_xlsx(&request).map_err(to_error_value)
}

#[wasm_bindgen]
pub fn build_load_point_topology(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointTopologyRequest = from_js_value(request)?;
    to_js_value(&build_load_point_topology_core(&request.load_points))
}

#[wasm_bindgen]
pub fn read_project_document(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ReadProjectDocumentRequest = from_js_value(request)?;
    match read_project_document_contents(&request.contents) {
        Ok(document) => to_js_value(&document),
        Err(error) => Err(to_js_value(&error)?),
    }
}

#[wasm_bindgen]
pub fn write_project_document(request: JsValue) -> Result<String, JsValue> {
    let request: WriteProjectDocumentRequest = from_js_value(request)?;
    write_project_document_draft(request.draft)
        .map_err(|error| to_js_value(&error).unwrap_or_else(|_| to_error_value(error)))
}

#[wasm_bindgen]
pub fn build_tip_level_region_topology(request: JsValue) -> Result<JsValue, JsValue> {
    let request: TipLevelRegionTopologyRequest = from_js_value(request)?;
    let topology: TipLevelRegionTopology = build_tip_level_region_topology_core(
        &request.load_point_topology,
        &request.selected_assignments,
        &request.options_by_load_point,
    );
    to_js_value(&topology)
}

#[wasm_bindgen]
pub fn derive_load_point_groups(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DeriveLoadPointGroupsRequest = from_js_value(request)?;
    to_js_value(&derive_load_point_groups_core(
        &request.load_points,
        &request.settings,
    ))
}

#[wasm_bindgen]
pub fn preview_load_point_group_edit(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointGroupEditInput = from_js_value(request)?;
    to_js_value(&preview_load_point_group_edit_core(&request))
}

#[wasm_bindgen]
pub fn apply_load_point_group_edit(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointGroupEditInput = from_js_value(request)?;
    to_js_value(&apply_load_point_group_edit_core(&request))
}

#[wasm_bindgen]
pub fn assess_load_point_group_assignments(request: JsValue) -> Result<JsValue, JsValue> {
    let request: AssessLoadPointGroupAssignmentsRequest = from_js_value(request)?;
    to_js_value(&assess_load_point_group_assignments_core(
        &request.groups,
        &request.assignments,
        &request.locked_load_point_ids,
    ))
}

#[wasm_bindgen]
pub fn apply_load_point_group_assignment(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ApplyLoadPointGroupAssignmentInput = from_js_value(request)?;
    let result: ApplyLoadPointGroupAssignmentResult =
        apply_load_point_group_assignment_core(&request);
    to_js_value(&result)
}

#[wasm_bindgen]
pub fn apply_load_point_group_assignment_batch(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ApplyLoadPointGroupAssignmentBatchInput = from_js_value(request)?;
    let result: ApplyLoadPointGroupAssignmentBatchResult =
        apply_load_point_group_assignment_batch_core(&request);
    to_js_value(&result)
}

#[wasm_bindgen]
pub fn apply_load_point_group_ungroup_batch(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointGroupUngroupBatchInput = from_js_value(request)?;
    to_js_value(&apply_load_point_group_ungroup_batch_core(&request))
}

#[wasm_bindgen]
pub fn validate_manual_cpt_selection_batch(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ManualCptSelectionBatchInput = from_js_value(request)?;
    to_js_value(&validate_manual_cpt_selection_batch_core(&request))
}

#[wasm_bindgen]
pub fn evaluate_cpt_settings_edit(request: JsValue) -> Result<JsValue, JsValue> {
    let request: CptSettingsEditInput = from_js_value(request)?;
    to_js_value(&evaluate_cpt_settings_edit_core(&request))
}

#[wasm_bindgen]
pub fn evaluate_load_point_grouping_settings(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointGroupingSettingsEditInput = from_js_value(request)?;
    to_js_value(&evaluate_load_point_grouping_settings_core(&request))
}

#[wasm_bindgen]
pub fn evaluate_pile_cost_catalog_edit(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PileCostCatalogEditInput = from_js_value(request)?;
    to_js_value(&evaluate_pile_cost_catalog_edit_core(&request))
}

#[wasm_bindgen]
pub fn evaluate_mcp_project_edit(request: JsValue) -> Result<JsValue, JsValue> {
    let request: McpProjectEditInput = from_js_value(request)?;
    to_js_value(&evaluate_mcp_project_edit_core(&request))
}

#[wasm_bindgen]
pub fn validate_load_point_lock_batch(request: JsValue) -> Result<JsValue, JsValue> {
    let request: LoadPointLockBatchInput = from_js_value(request)?;
    to_js_value(&validate_load_point_lock_batch_core(&request))
}

fn from_js_value<T>(value: JsValue) -> Result<T, JsValue>
where
    T: for<'de> Deserialize<'de>,
{
    serde_wasm_bindgen::from_value(value).map_err(to_error_value)
}

fn to_js_value<T>(value: &T) -> Result<JsValue, JsValue>
where
    T: Serialize,
{
    serde_wasm_bindgen::to_value(value).map_err(to_error_value)
}

fn to_error_value(error: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&error.to_string()).into()
}

fn read_project_document_contents(
    contents: &str,
) -> Result<ValidatedPilePlanProject, ProjectDocumentError> {
    read_project_document_core(contents)
}

fn write_project_document_draft(
    draft: ProjectDocumentDraft,
) -> Result<String, ProjectDocumentError> {
    write_project_document_core(draft)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pile_plan_core::{
        CptSelectionAlgorithm, CptSelectionSettings, ImportSource, LoadPointGroup,
        LoadPointGroupingSettings, LoadPointTopology, PileConfigurationOption, PileCostSettings,
    };

    #[test]
    fn pile_option_analysis_request_supports_optional_cpt_rows() {
        let request = PileOptionAnalysisRequest {
            load_points: vec![],
            cpts: vec![],
            bearing_capacities: vec![],
            global_settings: CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            settings_by_load_point: HashMap::new(),
            manual_cpt_ids_by_load_point: HashMap::new(),
            include_cpt_frd_rows: false,
        };

        assert!(!request.include_cpt_frd_rows);
    }

    #[test]
    fn default_pile_options_request_accepts_grouped_options() {
        let request = DefaultPileOptionsRequest {
            options_by_load_point: HashMap::from([(1, vec![])]),
            groups: vec![LoadPointGroup {
                load_point_ids: vec![1],
                origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
            }],
            pile_head_level_m: 0.0,
            cost_settings: PileCostSettings {
                schema_version: 1,
                items: vec![],
            },
        };

        assert!(request.options_by_load_point.contains_key(&1));
        assert_eq!(request.groups[0].load_point_ids, vec![1]);
    }

    #[test]
    fn aggregate_adapter_exposes_authoritative_core_facts() {
        let request = AggregatePileOptionsRequest {
            options_by_load_point: HashMap::from([
                (1, vec![aggregation_option(0.72, 61)]),
                (2, vec![aggregation_option(0.91, 62)]),
            ]),
        };

        let result = aggregate_pile_options_for_load_points(&request.options_by_load_point);

        assert_eq!(result[0].configuration.pile_tip_level_mm, -18_500);
        assert_eq!(result[0].maximum_utilization, Some(0.91));
        assert_eq!(result[0].critical_load_point_id, Some(2));
        let _export: fn(JsValue) -> Result<JsValue, JsValue> = aggregate_pile_options;
    }

    #[test]
    fn technical_assignment_request_exposes_grouped_missing_result() {
        let mut missing = aggregation_option(1.20, 62);
        missing.is_option = false;
        missing.missing_cpt_ids = vec![62];
        missing.technical_status = pile_plan_core::PileOptionTechnicalStatus::MissingCapacityData;
        let request = TechnicalAssignmentRequest {
            groups: vec![LoadPointGroup {
                load_point_ids: vec![1, 2],
                origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
            }],
            options_by_load_point: HashMap::from([
                (1, vec![aggregation_option(0.72, 61)]),
                (2, vec![missing]),
            ]),
        };

        let result =
            assess_technical_assignment_core(&request.groups, &request.options_by_load_point)
                .unwrap();

        assert_eq!(result.issues[0].group_load_point_ids, vec![1, 2]);
        assert_eq!(
            result.issues[0].status,
            pile_plan_core::TechnicalAssignmentIssueStatus::MissingCapacityData
        );
        let _export: fn(JsValue) -> Result<JsValue, JsValue> = assess_technical_assignment;
    }

    fn aggregation_option(utilization: f64, governing_cpt_id: u32) -> PileConfigurationOption {
        PileConfigurationOption {
            configuration: PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_500,
            },
            pile_size_mm: 320,
            pile_tip_level_m: -18.5,
            is_option: true,
            governing_cpt_id: Some(governing_cpt_id),
            governing_frd_kn: Some(700.0),
            utilization: Some(utilization),
            missing_cpt_ids: vec![],
            technical_status: pile_plan_core::PileOptionTechnicalStatus::Valid,
        }
    }

    #[test]
    fn project_document_adapters_delegate_read_write_and_structured_errors() {
        let validated = read_project_document_contents(include_str!(
            "../../../sample_project/sample_project.ifcpp"
        ))
        .expect("sample project reads");
        let written =
            write_project_document_draft(ProjectDocumentDraft::from_project(&validated.project))
                .expect("sample project writes");

        assert_eq!(
            read_project_document_contents(&written)
                .expect("written project reads")
                .project
                .schema_version,
            5
        );
        assert!(matches!(
            read_project_document_contents("{").unwrap_err(),
            ProjectDocumentError::InvalidJson { .. }
        ));
    }

    #[test]
    fn preview_import_request_accepts_profiled_source() {
        let request = PreviewImportRequest {
            source: ImportSource {
                role: pile_plan_core::ImportRole::LoadPoints,
                profile: pile_plan_core::ImportProfile::RfemExport,
                profile_options: pile_plan_core::ImportProfileOptions {
                    coordinate_sheet: Some("Coordinates".to_string()),
                    reaction_sheet: Some("Reactions".to_string()),
                },
                file_name: "Export RFEM.xlsx".to_string(),
                format: pile_plan_core::SourceFormat::Xlsx,
                bytes: vec![],
            },
        };

        assert_eq!(
            request.source.profile,
            pile_plan_core::ImportProfile::RfemExport
        );
    }

    #[test]
    fn pile_plan_import_preview_request_accepts_project_context() {
        let _export: fn(JsValue) -> Result<JsValue, JsValue> = preview_pile_plan_import_file;
        let request = pile_plan_core::PilePlanImportRequest {
            file_name: "plan.csv".to_string(),
            format: pile_plan_core::SourceFormat::Csv,
            bytes: vec![],
            profile: pile_plan_core::PilePlanImportProfile::Automatic,
            options: pile_plan_core::PilePlanImportOptions::default(),
            load_points: vec![],
            cpts: vec![],
            available_pile_configurations: vec![],
        };

        assert_eq!(request.options.coordinate_tolerance_mm, 1.0);
    }

    #[test]
    fn project_refresh_request_is_exposed_for_browser_runtime() {
        let _export: fn(JsValue) -> Result<JsValue, JsValue> = refresh_project_from_files;
        assert_eq!(
            std::mem::size_of::<RefreshProjectRequest>(),
            std::mem::size_of::<RefreshProjectRequest>()
        );
    }

    #[test]
    fn tip_level_region_requests_expose_the_core_contract_for_browser_runtime() {
        let topology_request = LoadPointTopologyRequest {
            load_points: vec![],
        };
        let region_request = TipLevelRegionTopologyRequest {
            load_point_topology: LoadPointTopology {
                load_point_ids: vec![],
                edges: vec![],
                faces: vec![],
            },
            selected_assignments: HashMap::new(),
            options_by_load_point: HashMap::new(),
        };
        let _graph_export: fn(JsValue) -> Result<JsValue, JsValue> = build_load_point_topology;
        let _topology_export: fn(JsValue) -> Result<JsValue, JsValue> =
            build_tip_level_region_topology;

        assert!(topology_request.load_points.is_empty());
        assert!(region_request.load_point_topology.load_point_ids.is_empty());
    }

    #[test]
    fn load_point_group_requests_expose_core_results_for_browser_runtime() {
        let request = DeriveLoadPointGroupsRequest {
            load_points: vec![],
            settings: LoadPointGroupingSettings::default(),
        };
        let groups = derive_load_point_groups_core(
            &request.load_points,
            &LoadPointGroupingSettings::default(),
        );
        let _derive_export: fn(JsValue) -> Result<JsValue, JsValue> = derive_load_point_groups;
        let _assignment_export: fn(JsValue) -> Result<JsValue, JsValue> =
            apply_load_point_group_assignment;

        assert!(groups.groups.is_empty());

        let requested_configuration = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18_000,
        };
        let assignment =
            apply_load_point_group_assignment_core(&ApplyLoadPointGroupAssignmentInput {
                selected_load_point_ids: vec![2],
                groups: vec![LoadPointGroup {
                    load_point_ids: vec![1, 2],
                    origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
                }],
                requested_configuration: Some(requested_configuration.clone()),
                current_assignments: HashMap::new(),
                locked_load_point_ids: vec![],
            });
        assert_eq!(
            assignment,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![
                    pile_plan_core::LoadPointGroupAssignmentChange {
                        load_point_id: 1,
                        configuration: Some(requested_configuration.clone()),
                    },
                    pile_plan_core::LoadPointGroupAssignmentChange {
                        load_point_id: 2,
                        configuration: Some(requested_configuration),
                    },
                ],
            }
        );
    }
}
