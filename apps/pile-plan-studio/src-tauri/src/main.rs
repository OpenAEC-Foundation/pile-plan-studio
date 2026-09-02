#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pile_plan_core::{
    aggregate_pile_options_for_load_points,
    apply_load_point_group_assignment as apply_load_point_group_assignment_core,
    bearing_capacity_rows_for_cpt,
    build_pile_options_by_load_point, build_project_analysis,
    build_spatial_neighborhood as build_spatial_neighborhood_core,
    build_tip_level_region_topology as build_tip_level_region_topology_core, calculate_pile_cost,
    choose_default_pile_option, choose_default_pile_options, greedy_optimize_pile_choices,
    derive_load_point_groups as derive_load_point_groups_core,
    import_project_from_generic_sources_with_properties, preview_import_source,
    preview_pile_plan_import, refresh_project_from_profiled_sources, selected_cpts,
    write_pile_plan_csv as write_pile_plan_csv_bytes,
    write_pile_plan_xlsx as write_pile_plan_xlsx_bytes, CptSelectionSettings,
    AggregatedPileConfiguration, ApplyLoadPointGroupAssignmentInput,
    ApplyLoadPointGroupAssignmentResult, GreedyOptimizationInput, GreedyOptimizationOutcome,
    ImportSource, ImportSourcePreview, LoadPointGroup, LoadPointGroupingSettings,
    PileConfigurationKey, PileConfigurationOption, PileCostSettings, PilePlanExportRequest,
    PilePlanImportPreview, PilePlanImportRequest, PilePlanProject, ProjectAnalysisResult,
    ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint, SelectedCpt, SpatialNeighborhood,
    SpatialPileAssignment, TipLevelRegionTopology,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct SelectedCptsRequest {
    load_point: ProjectLoadPoint,
    cpts: Vec<ProjectCpt>,
    settings: CptSelectionSettings,
    manual_cpt_ids: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize)]
struct PileOptionsRequest {
    load_points: Vec<ProjectLoadPoint>,
    cpts: Vec<ProjectCpt>,
    bearing_capacities: Vec<ProjectBearingCapacity>,
    global_settings: CptSelectionSettings,
    settings_by_load_point: HashMap<u32, CptSelectionSettings>,
    manual_cpt_ids_by_load_point: HashMap<u32, Vec<u32>>,
}

#[derive(Debug, Deserialize)]
struct ProjectAnalysisRequest {
    load_points: Vec<ProjectLoadPoint>,
    cpts: Vec<ProjectCpt>,
    bearing_capacities: Vec<ProjectBearingCapacity>,
    global_settings: CptSelectionSettings,
    settings_by_load_point: HashMap<u32, CptSelectionSettings>,
    manual_cpt_ids_by_load_point: HashMap<u32, Vec<u32>>,
    include_cpt_frd_rows: bool,
}

#[derive(Debug, Deserialize)]
struct PileCostRequest {
    pile_size_mm: u32,
    pile_tip_level_m: f64,
    pile_head_level_m: f64,
    settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct DefaultPileOptionRequest {
    options: Vec<PileConfigurationOption>,
    pile_head_level_m: f64,
    settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct DefaultPileOptionsRequest {
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pile_head_level_m: f64,
    cost_settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct AggregatePileOptionsRequest {
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}

#[derive(Debug, Deserialize)]
struct CptFrdRowsRequest {
    bearing_capacities: Vec<ProjectBearingCapacity>,
    cpt_id: u32,
}

#[derive(Debug, Deserialize)]
struct ImportProjectRequest {
    project_name: String,
    pile_head_level_m: Option<f64>,
    currency_code: String,
    sources: Vec<ImportSource>,
}

#[derive(Debug, Deserialize)]
struct RefreshProjectRequest {
    current_project: PilePlanProject,
    sources: Vec<ImportSource>,
}

#[derive(Debug, Deserialize)]
struct PreviewImportRequest {
    source: ImportSource,
}

#[derive(Debug, Deserialize)]
struct SpatialNeighborhoodRequest {
    load_points: Vec<ProjectLoadPoint>,
}

#[derive(Debug, Deserialize)]
struct DeriveLoadPointGroupsRequest {
    load_points: Vec<ProjectLoadPoint>,
}

#[derive(Debug, Deserialize)]
struct TipLevelRegionTopologyRequest {
    neighborhood: SpatialNeighborhood,
    selected_assignments: HashMap<u32, SpatialPileAssignment>,
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}

#[derive(Debug, Serialize)]
struct PileCostResponse {
    cost: Option<u32>,
}

#[tauri::command(rename_all = "snake_case")]
fn calculate_selected_cpts(request: SelectedCptsRequest) -> Vec<SelectedCpt> {
    selected_cpts(
        &request.load_point,
        &request.cpts,
        &request.settings,
        request.manual_cpt_ids.as_deref(),
    )
}

#[tauri::command(rename_all = "snake_case")]
fn calculate_pile_options(
    request: PileOptionsRequest,
) -> HashMap<u32, Vec<PileConfigurationOption>> {
    build_pile_options_by_load_point(
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
    )
}

#[tauri::command(rename_all = "snake_case")]
fn calculate_project_analysis(request: ProjectAnalysisRequest) -> ProjectAnalysisResult {
    build_project_analysis(
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
    )
}

#[tauri::command(rename_all = "snake_case")]
fn calculate_pile_option_cost(request: PileCostRequest) -> PileCostResponse {
    PileCostResponse {
        cost: calculate_pile_cost(
            request.pile_size_mm,
            request.pile_tip_level_m,
            request.pile_head_level_m,
            &request.settings,
        ),
    }
}

#[tauri::command(rename_all = "snake_case")]
fn choose_default_option(request: DefaultPileOptionRequest) -> Option<PileConfigurationOption> {
    choose_default_pile_option(
        &request.options,
        request.pile_head_level_m,
        &request.settings,
    )
    .cloned()
}

#[tauri::command(rename_all = "snake_case")]
fn choose_default_options(
    request: DefaultPileOptionsRequest,
) -> HashMap<u32, PileConfigurationKey> {
    choose_default_pile_options(
        &request.options_by_load_point,
        request.pile_head_level_m,
        &request.cost_settings,
    )
}

#[tauri::command(rename_all = "snake_case")]
fn aggregate_pile_options(
    request: AggregatePileOptionsRequest,
) -> Vec<AggregatedPileConfiguration> {
    aggregate_pile_options_for_load_points(&request.options_by_load_point)
}

#[tauri::command(rename_all = "snake_case")]
fn cpt_frd_rows(request: CptFrdRowsRequest) -> Vec<pile_plan_core::CptBearingCapacityRow> {
    bearing_capacity_rows_for_cpt(&request.bearing_capacities, request.cpt_id)
}

#[tauri::command(rename_all = "snake_case")]
fn greedy_optimize(request: GreedyOptimizationInput) -> GreedyOptimizationOutcome {
    greedy_optimize_pile_choices(&request)
}

#[tauri::command(rename_all = "snake_case")]
fn import_project_from_files(request: ImportProjectRequest) -> Result<PilePlanProject, String> {
    import_project_from_generic_sources_with_properties(
        &request.project_name,
        &request.sources,
        request.pile_head_level_m,
        &request.currency_code,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn refresh_project_from_files(request: RefreshProjectRequest) -> Result<PilePlanProject, String> {
    refresh_project_from_profiled_sources(&request.current_project, &request.sources)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn preview_import_file(request: PreviewImportRequest) -> ImportSourcePreview {
    preview_import_source(&request.source)
}

#[tauri::command(rename_all = "snake_case")]
fn preview_pile_plan_import_file(request: PilePlanImportRequest) -> PilePlanImportPreview {
    preview_pile_plan_import(&request)
}

#[tauri::command(rename_all = "snake_case")]
fn export_pile_plan_csv(request: PilePlanExportRequest) -> Result<Vec<u8>, String> {
    write_pile_plan_csv_bytes(&request).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn export_pile_plan_xlsx(request: PilePlanExportRequest) -> Result<Vec<u8>, String> {
    write_pile_plan_xlsx_bytes(&request).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn read_project_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn build_spatial_neighborhood(request: SpatialNeighborhoodRequest) -> SpatialNeighborhood {
    build_spatial_neighborhood_core(&request.load_points)
}

#[tauri::command(rename_all = "snake_case")]
fn build_tip_level_region_topology(
    request: TipLevelRegionTopologyRequest,
) -> TipLevelRegionTopology {
    build_tip_level_region_topology_core(
        &request.neighborhood,
        &request.selected_assignments,
        &request.options_by_load_point,
    )
}

#[tauri::command(rename_all = "snake_case")]
fn derive_load_point_groups(request: DeriveLoadPointGroupsRequest) -> Vec<LoadPointGroup> {
    derive_load_point_groups_core(
        &request.load_points,
        &LoadPointGroupingSettings::default(),
    )
}

#[tauri::command(rename_all = "snake_case")]
fn apply_load_point_group_assignment(
    request: ApplyLoadPointGroupAssignmentInput,
) -> ApplyLoadPointGroupAssignmentResult {
    apply_load_point_group_assignment_core(&request)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            aggregate_pile_options,
            apply_load_point_group_assignment,
            build_spatial_neighborhood,
            build_tip_level_region_topology,
            calculate_selected_cpts,
            calculate_pile_options,
            calculate_project_analysis,
            calculate_pile_option_cost,
            choose_default_option,
            choose_default_options,
            cpt_frd_rows,
            derive_load_point_groups,
            greedy_optimize,
            import_project_from_files,
            refresh_project_from_files,
            preview_import_file,
            preview_pile_plan_import_file,
            export_pile_plan_csv,
            export_pile_plan_xlsx,
            read_project_file,
            write_project_file,
            write_binary_file,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pile Plan Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spatial_commands_return_core_results() {
        let neighborhood = build_spatial_neighborhood(SpatialNeighborhoodRequest {
            load_points: vec![],
        });
        let topology = build_tip_level_region_topology(TipLevelRegionTopologyRequest {
            neighborhood,
            selected_assignments: HashMap::new(),
            options_by_load_point: HashMap::new(),
        });

        assert!(topology.groups.is_empty());
    }

    #[test]
    fn aggregate_command_returns_authoritative_core_facts() {
        let option = PileConfigurationOption {
            configuration: PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_500,
            },
            pile_size_mm: 320,
            pile_tip_level_m: -18.5,
            is_option: true,
            governing_cpt_id: Some(61),
            governing_frd_kn: Some(700.0),
            utilization: Some(0.82),
            missing_cpt_ids: vec![],
        };
        let result = aggregate_pile_options(AggregatePileOptionsRequest {
            options_by_load_point: HashMap::from([(7, vec![option])]),
        });

        assert_eq!(result[0].configuration.pile_tip_level_mm, -18_500);
        assert_eq!(result[0].maximum_utilization, Some(0.82));
        assert_eq!(result[0].critical_load_point_id, Some(7));
    }

    #[test]
    fn load_point_group_commands_return_core_results() {
        let groups = derive_load_point_groups(DeriveLoadPointGroupsRequest {
            load_points: vec![],
        });
        let requested_configuration = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18_000,
        };
        let result = apply_load_point_group_assignment(
            pile_plan_core::ApplyLoadPointGroupAssignmentInput {
                selected_load_point_ids: vec![2],
                groups: vec![pile_plan_core::LoadPointGroup {
                    load_point_ids: vec![1, 2],
                }],
                requested_configuration,
                current_assignments: HashMap::new(),
                locked_load_point_ids: vec![],
            },
        );

        assert!(groups.is_empty());
        assert!(matches!(
            result,
            pile_plan_core::ApplyLoadPointGroupAssignmentResult::Applied { changes }
                if changes.len() == 2
        ));
    }

    #[test]
    fn greedy_optimize_command_returns_the_tagged_core_outcome() {
        let outcome = greedy_optimize(GreedyOptimizationInput {
            groups: vec![LoadPointGroup {
                load_point_ids: vec![1],
            }],
            options_by_load_point: HashMap::from([(1, vec![])]),
            target_load_point_ids: vec![1],
            locked_load_point_ids: vec![],
            current_assignments: HashMap::new(),
            limit_scope: pile_plan_core::OptimizationLimitScope::Target,
            pile_head_level_m: None,
            cost_settings: PileCostSettings {
                schema_version: 1,
                items: vec![],
            },
            settings: pile_plan_core::GreedyOptimizationSettings {
                max_pile_sizes: 1,
                max_pile_tip_levels: 1,
                max_pile_configurations: 1,
                max_utilization: 1.0,
                enabled_pile_sizes: vec![320],
                enabled_pile_tip_levels: vec![-18.0],
            },
        });

        assert!(matches!(
            outcome,
            pile_plan_core::GreedyOptimizationOutcome::Blocked { .. }
        ));
    }
}
