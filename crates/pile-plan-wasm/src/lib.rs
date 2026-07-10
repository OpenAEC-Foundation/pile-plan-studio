use std::collections::HashMap;

use pile_plan_core::{
    bearing_capacity_rows_for_cpt, build_pile_options_by_load_point, calculate_pile_cost,
    choose_default_pile_option, greedy_optimize_pile_choices, import_project_from_generic_sources,
    selected_cpts, write_ifcpp_string, CptSelectionSettings, GreedyOptimizationSettings,
    GreedyOptimizedPileChoice, ImportSource, PileConfigurationOption, PileCostSettings,
    PilePlanProject, ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint,
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
pub struct PileCostRequest {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct DefaultPileOptionRequest {
    pub options: Vec<PileConfigurationOption>,
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct CptFrdRowsRequest {
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub cpt_id: u32,
}

#[derive(Debug, Deserialize)]
pub struct GreedyOptimizationRequest {
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub cost_settings: PileCostSettings,
    pub settings: GreedyOptimizationSettings,
}

#[derive(Debug, Deserialize)]
pub struct ImportProjectRequest {
    pub project_name: String,
    pub sources: Vec<ImportSource>,
}

#[derive(Debug, Serialize)]
pub struct PileCostResponse {
    pub cost_eur: Option<u32>,
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
pub fn calculate_pile_option_cost(request: JsValue) -> Result<JsValue, JsValue> {
    let request: PileCostRequest = from_js_value(request)?;
    to_js_value(&PileCostResponse {
        cost_eur: calculate_pile_cost(
            request.pile_size_mm,
            request.pile_tip_level_m,
            &request.settings,
        ),
    })
}

#[wasm_bindgen]
pub fn choose_default_option(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DefaultPileOptionRequest = from_js_value(request)?;
    to_js_value(&choose_default_pile_option(&request.options, &request.settings).cloned())
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
    let request: GreedyOptimizationRequest = from_js_value(request)?;
    let choices: Vec<GreedyOptimizedPileChoice> = greedy_optimize_pile_choices(
        &request.options_by_load_point,
        &request.cost_settings,
        &request.settings,
    );

    to_js_value(&choices)
}

#[wasm_bindgen]
pub fn import_project_from_files(request: JsValue) -> Result<JsValue, JsValue> {
    let request: ImportProjectRequest = from_js_value(request)?;
    let project = import_project_from_generic_sources(&request.project_name, &request.sources)
        .map_err(to_error_value)?;

    to_js_value(&project)
}

#[wasm_bindgen]
pub fn write_ifcpp_project(project: JsValue) -> Result<String, JsValue> {
    let project: PilePlanProject = from_js_value(project)?;
    write_ifcpp_string(&project).map_err(to_error_value)
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
    use pile_plan_core::{CptSelectionAlgorithm, SelectedCpt};

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
}
