use std::collections::HashMap;

use pile_plan_core::{
    aggregate_pile_options_for_load_points,
    apply_load_point_group_assignment as apply_load_point_group_assignment_core,
    bearing_capacity_rows_for_cpt, build_pile_options_by_load_point, build_project_analysis,
    build_spatial_neighborhood as build_spatial_neighborhood_core,
    build_tip_level_region_topology as build_tip_level_region_topology_core, calculate_pile_cost,
    choose_default_pile_option, choose_default_pile_options,
    derive_load_point_groups as derive_load_point_groups_core, greedy_optimize_pile_choices,
    import_project_from_generic_sources_with_properties, preview_import_source,
    preview_pile_plan_import, refresh_project_from_profiled_sources, selected_cpts,
    write_ifcpp_string, write_pile_plan_csv, write_pile_plan_xlsx,
    ApplyLoadPointGroupAssignmentInput, ApplyLoadPointGroupAssignmentResult, CptSelectionSettings,
    GreedyOptimizationInput, ImportSource, LoadPointGroup, LoadPointGroupingSettings,
    PileConfigurationKey, PileConfigurationOption, PileCostSettings, PilePlanExportRequest,
    PilePlanImportRequest, PilePlanProject, ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint,
    SpatialNeighborhood, SpatialPileAssignment, TipLevelRegionTopology,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
pub struct SelectedCptsRequest {
    pub load_point: ProjectLoadPoint,
    pub cpts: Vec<ProjectCpt>,
    pub settings: CptSelectionSettings,
    pub manual_cpt_ids: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize)]
pub struct PileOptionsRequest {
    pub load_points: Vec<ProjectLoadPoint>,
    pub cpts: Vec<ProjectCpt>,
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub global_settings: CptSelectionSettings,
    pub settings_by_load_point: HashMap<u32, CptSelectionSettings>,
    pub manual_cpt_ids_by_load_point: HashMap<u32, Vec<u32>>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectAnalysisRequest {
    pub load_points: Vec<ProjectLoadPoint>,
    pub cpts: Vec<ProjectCpt>,
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub global_settings: CptSelectionSettings,
    pub settings_by_load_point: HashMap<u32, CptSelectionSettings>,
    pub manual_cpt_ids_by_load_point: HashMap<u32, Vec<u32>>,
    pub include_cpt_frd_rows: bool,
}

#[derive(Debug, Deserialize)]
pub struct PileCostRequest {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub pile_head_level_m: f64,
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct DefaultPileOptionRequest {
    pub options: Vec<PileConfigurationOption>,
    pub pile_head_level_m: f64,
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct DefaultPileOptionsRequest {
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub groups: Vec<LoadPointGroup>,
    pub pile_head_level_m: f64,
    pub cost_settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct AggregatePileOptionsRequest {
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}

#[derive(Debug, Deserialize)]
pub struct CptFrdRowsRequest {
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub cpt_id: u32,
}

#[derive(Debug, Deserialize)]
pub struct ImportProjectRequest {
    pub project_name: String,
    pub pile_head_level_m: Option<f64>,
    pub currency_code: String,
    pub sources: Vec<ImportSource>,
}

#[derive(Debug, Deserialize)]
pub struct RefreshProjectRequest {
    pub current_project: PilePlanProject,
    pub sources: Vec<ImportSource>,
}

#[derive(Debug, Deserialize)]
pub struct PreviewImportRequest {
    pub source: ImportSource,
}

#[derive(Debug, Deserialize)]
pub struct SpatialNeighborhoodRequest {
    pub load_points: Vec<ProjectLoadPoint>,
}

#[derive(Debug, Deserialize)]
pub struct DeriveLoadPointGroupsRequest {
    pub load_points: Vec<ProjectLoadPoint>,
}

#[derive(Debug, Deserialize)]
pub struct TipLevelRegionTopologyRequest {
    pub neighborhood: SpatialNeighborhood,
    pub selected_assignments: HashMap<u32, SpatialPileAssignment>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}

#[derive(Debug, Serialize)]
pub struct PileCostResponse {
    pub cost: Option<u32>,
}

#[wasm_bindgen]
pub fn calculate_selected_cpts(request: JsValue) -> Result<JsValue, JsValue> {
    let request: SelectedCptsRequest = from_js_value(request)?;
    to_js_value(&selected_cpts(
        &request.load_point,
        &request.cpts,
        &request.settings,
        request.manual_cpt_ids.as_deref(),
    ))
}

#[wasm_bindgen]
pub fn calculate_pile_options(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PileOptionsRequest = from_js_value(request)?;
    let result = build_pile_options_by_load_point(
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
    );

    to_js_value(&result)
}

#[wasm_bindgen]
pub fn calculate_project_analysis(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ProjectAnalysisRequest = from_js_value(request)?;
    let result = build_project_analysis(
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
    to_js_value(&result)
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
pub fn choose_default_option(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DefaultPileOptionRequest = from_js_value(request)?;
    to_js_value(
        &choose_default_pile_option(
            &request.options,
            request.pile_head_level_m,
            &request.settings,
        )
        .cloned(),
    )
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
pub fn cpt_frd_rows(request: JsValue) -> Result<JsValue, JsValue> {
    let request: CptFrdRowsRequest = from_js_value(request)?;
    to_js_value(&bearing_capacity_rows_for_cpt(
        &request.bearing_capacities,
        request.cpt_id,
    ))
}

#[wasm_bindgen]
pub fn greedy_optimize(request: JsValue) -> Result<JsValue, JsValue> {
    let request: GreedyOptimizationInput = from_js_value(request)?;
    to_js_value(&greedy_optimize_pile_choices(&request))
}

#[wasm_bindgen]
pub fn import_project_from_files(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ImportProjectRequest = from_js_value(request)?;
    let project = import_project_from_generic_sources_with_properties(
        &request.project_name,
        &request.sources,
        request.pile_head_level_m,
        &request.currency_code,
    )
    .map_err(to_error_value)?;

    to_js_value(&project)
}

#[wasm_bindgen]
pub fn refresh_project_from_files(request: JsValue) -> Result<JsValue, JsValue> {
    let request: RefreshProjectRequest = from_js_value(request)?;
    let project = refresh_project_from_profiled_sources(&request.current_project, &request.sources)
        .map_err(to_error_value)?;

    to_js_value(&project)
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
pub fn write_ifcpp_project(project: JsValue) -> Result<String, JsValue> {
    let project: PilePlanProject = from_js_value(project)?;
    write_ifcpp_string(&project).map_err(to_error_value)
}

#[wasm_bindgen]
pub fn build_spatial_neighborhood(request: JsValue) -> Result<JsValue, JsValue> {
    let request: SpatialNeighborhoodRequest = from_js_value(request)?;
    to_js_value(&build_spatial_neighborhood_core(&request.load_points))
}

#[wasm_bindgen]
pub fn build_tip_level_region_topology(request: JsValue) -> Result<JsValue, JsValue> {
    let request: TipLevelRegionTopologyRequest = from_js_value(request)?;
    let topology: TipLevelRegionTopology = build_tip_level_region_topology_core(
        &request.neighborhood,
        &request.selected_assignments,
        &request.options_by_load_point,
    );
    to_js_value(&topology)
}

#[wasm_bindgen]
pub fn derive_load_point_groups(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DeriveLoadPointGroupsRequest = from_js_value(request)?;
    let groups: Vec<LoadPointGroup> =
        derive_load_point_groups_core(&request.load_points, &LoadPointGroupingSettings::default());
    to_js_value(&groups)
}

#[wasm_bindgen]
pub fn apply_load_point_group_assignment(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ApplyLoadPointGroupAssignmentInput = from_js_value(request)?;
    let result: ApplyLoadPointGroupAssignmentResult =
        apply_load_point_group_assignment_core(&request);
    to_js_value(&result)
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

#[cfg(test)]
mod tests {
    use super::*;
    use pile_plan_core::{
        CptSelectionAlgorithm, GreedyOptimizationSettings, OptimizationLimitScope, SelectedCpt,
    };

    #[test]
    fn wasm_request_types_match_core_contract() {
        let request = SelectedCptsRequest {
            load_point: ProjectLoadPoint {
                id: 1,
                name: "Load point 1".to_string(),
                x_mm: 0.0,
                y_mm: 0.0,
                design_load_kn: 100.0,
            },
            cpts: vec![ProjectCpt {
                id: 11,
                name: "CPT 11".to_string(),
                x_mm: 10.0,
                y_mm: 10.0,
            }],
            settings: CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            manual_cpt_ids: None,
        };

        let selected: Vec<SelectedCpt> = selected_cpts(
            &request.load_point,
            &request.cpts,
            &request.settings,
            request.manual_cpt_ids.as_deref(),
        );

        assert_eq!(selected[0].cpt.id, 11);
    }

    #[test]
    fn project_analysis_request_supports_optional_cpt_rows() {
        let request = ProjectAnalysisRequest {
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
        }
    }

    #[test]
    fn greedy_optimizer_uses_the_shared_core_request_and_result() {
        let request = GreedyOptimizationInput {
            groups: vec![LoadPointGroup {
                load_point_ids: vec![1],
            }],
            options_by_load_point: HashMap::from([(1, vec![])]),
            target_load_point_ids: vec![1],
            locked_load_point_ids: vec![],
            current_assignments: HashMap::from([(
                2,
                PileConfigurationKey {
                    pile_size_mm: 320,
                    pile_tip_level_mm: -18_000,
                },
            )]),
            limit_scope: OptimizationLimitScope::WholePlan,
            pile_head_level_m: Some(-3.5),
            cost_settings: PileCostSettings {
                schema_version: 1,
                items: vec![],
            },
            settings: GreedyOptimizationSettings {
                max_pile_sizes: 1,
                max_pile_tip_levels: 1,
                max_pile_configurations: 1,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![320],
                enabled_pile_tip_levels: vec![-18.0],
            },
        };

        let result = greedy_optimize_pile_choices(&request);

        assert!(matches!(
            result,
            pile_plan_core::GreedyOptimizationOutcome::Completed { result }
                if result.unassigned_group_count == 0
                    && result.unassigned.len() == 1
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
    fn spatial_requests_expose_the_core_contract_for_browser_runtime() {
        let neighborhood_request = SpatialNeighborhoodRequest {
            load_points: vec![],
        };
        let topology_request = TipLevelRegionTopologyRequest {
            neighborhood: SpatialNeighborhood {
                sites: vec![],
                edges: vec![],
                faces: vec![],
            },
            selected_assignments: HashMap::new(),
            options_by_load_point: HashMap::new(),
        };
        let _graph_export: fn(JsValue) -> Result<JsValue, JsValue> = build_spatial_neighborhood;
        let _topology_export: fn(JsValue) -> Result<JsValue, JsValue> =
            build_tip_level_region_topology;

        assert!(neighborhood_request.load_points.is_empty());
        assert!(topology_request.neighborhood.sites.is_empty());
    }

    #[test]
    fn load_point_group_requests_expose_core_results_for_browser_runtime() {
        let request = DeriveLoadPointGroupsRequest {
            load_points: vec![],
        };
        let groups = derive_load_point_groups_core(
            &request.load_points,
            &LoadPointGroupingSettings::default(),
        );
        let _derive_export: fn(JsValue) -> Result<JsValue, JsValue> = derive_load_point_groups;
        let _assignment_export: fn(JsValue) -> Result<JsValue, JsValue> =
            apply_load_point_group_assignment;

        assert!(groups.is_empty());

        let requested_configuration = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18_000,
        };
        let assignment =
            apply_load_point_group_assignment_core(&ApplyLoadPointGroupAssignmentInput {
                selected_load_point_ids: vec![2],
                groups: vec![LoadPointGroup {
                    load_point_ids: vec![1, 2],
                }],
                requested_configuration: requested_configuration.clone(),
                current_assignments: HashMap::new(),
                locked_load_point_ids: vec![],
            });
        assert_eq!(
            assignment,
            ApplyLoadPointGroupAssignmentResult::Applied {
                changes: vec![
                    pile_plan_core::LoadPointGroupAssignmentChange {
                        load_point_id: 1,
                        configuration: requested_configuration.clone(),
                    },
                    pile_plan_core::LoadPointGroupAssignmentChange {
                        load_point_id: 2,
                        configuration: requested_configuration,
                    },
                ],
            }
        );
    }
}
