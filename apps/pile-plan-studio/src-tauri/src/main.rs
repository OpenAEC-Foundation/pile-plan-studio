use pile_plan_core::{
    bearing_capacity_rows_for_cpt, build_pile_options_by_load_point, build_project_analysis,
    calculate_pile_cost, choose_default_pile_option, choose_default_pile_options,
    greedy_optimize_pile_choices,
    import_project_from_generic_sources, selected_cpts,
    CptSelectionSettings, GreedyOptimizationSettings, GreedyOptimizedPileChoice,
    PileConfigurationKey, PileConfigurationOption, PileCostSettings, ProjectBearingCapacity, ProjectCpt,
    ImportSource, PilePlanProject, ProjectAnalysisResult, ProjectLoadPoint, SelectedCpt,
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
    settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct DefaultPileOptionRequest {
    options: Vec<PileConfigurationOption>,
    settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct DefaultPileOptionsRequest {
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    cost_settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
struct CptFrdRowsRequest {
    bearing_capacities: Vec<ProjectBearingCapacity>,
    cpt_id: u32,
}

#[derive(Debug, Deserialize)]
struct GreedyOptimizationRequest {
    options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    cost_settings: PileCostSettings,
    settings: GreedyOptimizationSettings,
}

#[derive(Debug, Deserialize)]
struct ImportProjectRequest {
    project_name: String,
    sources: Vec<ImportSource>,
}

#[derive(Debug, Serialize)]
struct PileCostResponse {
    cost_eur: Option<u32>,
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
        cost_eur: calculate_pile_cost(
            request.pile_size_mm,
            request.pile_tip_level_m,
            &request.settings,
        ),
    }
}

#[tauri::command(rename_all = "snake_case")]
fn choose_default_option(
    request: DefaultPileOptionRequest,
) -> Option<PileConfigurationOption> {
    choose_default_pile_option(&request.options, &request.settings).cloned()
}

#[tauri::command(rename_all = "snake_case")]
fn choose_default_options(
    request: DefaultPileOptionsRequest,
) -> HashMap<u32, PileConfigurationKey> {
    choose_default_pile_options(&request.options_by_load_point, &request.cost_settings)
}

#[tauri::command(rename_all = "snake_case")]
fn cpt_frd_rows(
    request: CptFrdRowsRequest,
) -> Vec<pile_plan_core::CptBearingCapacityRow> {
    bearing_capacity_rows_for_cpt(&request.bearing_capacities, request.cpt_id)
}

#[tauri::command(rename_all = "snake_case")]
fn greedy_optimize(request: GreedyOptimizationRequest) -> Vec<GreedyOptimizedPileChoice> {
    greedy_optimize_pile_choices(
        &request.options_by_load_point,
        &request.cost_settings,
        &request.settings,
    )
}

#[tauri::command(rename_all = "snake_case")]
fn import_project_from_files(request: ImportProjectRequest) -> Result<PilePlanProject, String> {
    import_project_from_generic_sources(&request.project_name, &request.sources)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            calculate_selected_cpts,
            calculate_pile_options,
            calculate_project_analysis,
            calculate_pile_option_cost,
            choose_default_option,
            choose_default_options,
            cpt_frd_rows,
            greedy_optimize,
            import_project_from_files,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pile Plan Studio");
}
