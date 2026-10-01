use crate::{
    CptSelectionSettings, ImportSource, LoadPointGroup, LoadPointGroupingSettings,
    LoadPointTopology, PileConfigurationKey, PileConfigurationOption, PileCostSettings,
    PilePlanProject, ProjectBearingCapacity, ProjectCpt, ProjectDocumentDraft, ProjectLoadPoint,
    TipLevelRegionAssignment,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct PileOptionAnalysisRequest {
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
pub struct TechnicalAssignmentRequest {
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
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
pub struct LoadPointTopologyRequest {
    pub load_points: Vec<ProjectLoadPoint>,
}

#[derive(Debug, Deserialize)]
pub struct ReadProjectDocumentRequest {
    pub contents: String,
}

#[derive(Debug, Deserialize)]
pub struct WriteProjectDocumentRequest {
    pub draft: ProjectDocumentDraft,
}

#[derive(Debug, Deserialize)]
pub struct DeriveLoadPointGroupsRequest {
    pub load_points: Vec<ProjectLoadPoint>,
    pub settings: LoadPointGroupingSettings,
}

#[derive(Debug, Deserialize)]
pub struct AssessLoadPointGroupAssignmentsRequest {
    pub groups: Vec<LoadPointGroup>,
    pub assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TipLevelRegionTopologyRequest {
    pub load_point_topology: LoadPointTopology,
    pub selected_assignments: HashMap<u32, TipLevelRegionAssignment>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
}

#[derive(Debug, Serialize)]
pub struct PileCostResponse {
    pub cost: Option<u32>,
}
