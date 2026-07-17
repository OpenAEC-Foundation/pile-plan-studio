use std::collections::HashMap;

use pile_plan_core::{
    bearing_capacity_rows_for_cpt, build_pile_options_by_load_point, build_project_analysis,
    calculate_pile_cost, choose_default_pile_option, choose_default_pile_options,
    greedy_optimize_pile_choices, import_project_from_generic_sources, preview_import_source,
    preview_pile_plan_import, refresh_project_from_profiled_sources, selected_cpts,
    write_ifcpp_string, write_pile_plan_csv, write_pile_plan_xlsx, CptSelectionSettings,
    GreedyOptimizationSettings, GreedyOptimizedPileChoice, ImportSource, PileConfigurationKey,
    PileConfigurationOption, PileCostSettings, PilePlanExportRequest, PilePlanImportRequest,
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
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct DefaultPileOptionRequest {
    pub options: Vec<PileConfigurationOption>,
    pub settings: PileCostSettings,
}

#[derive(Debug, Deserialize)]
pub struct DefaultPileOptionsRequest {
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub cost_settings: PileCostSettings,
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

#[derive(Debug, Deserialize)]
pub struct RefreshProjectRequest {
    pub current_project: PilePlanProject,
    pub sources: Vec<ImportSource>,
}

#[derive(Debug, Deserialize)]
pub struct PreviewImportRequest {
    pub source: ImportSource,
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
pub fn choose_default_options(request: JsValue) -> Result<JsValue, JsValue> {
    let request: DefaultPileOptionsRequest = from_js_value(request)?;
    let choices: HashMap<u32, PileConfigurationKey> =
        choose_default_pile_options(&request.options_by_load_point, &request.cost_settings);
    to_js_value(&choices)
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
            cost_settings: PileCostSettings {
                schema_version: 1,
                pile_head_level_m: 0.0,
                items: vec![],
            },
        };

        assert!(request.options_by_load_point.contains_key(&1));
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
}
