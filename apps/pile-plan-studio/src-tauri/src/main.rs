use pile_plan_core::{
    bearing_capacity_rows_for_cpt, build_pile_options_by_load_point, calculate_pile_cost,
    choose_default_pile_option, greedy_optimize_pile_choices, selected_cpts,
    CptSelectionSettings, GreedyOptimizationSettings, GreedyOptimizedPileChoice,
    PileConfigurationOption, PileCostSettings, ProjectBearingCapacity, ProjectCpt,
    ProjectLoadPoint, SelectedCpt,
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            calculate_selected_cpts,
            calculate_pile_options,
            calculate_pile_option_cost,
            choose_default_option,
            cpt_frd_rows,
            greedy_optimize,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pile Plan Studio");
}
