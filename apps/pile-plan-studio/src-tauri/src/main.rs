#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pile_plan_core::{
    aggregate_pile_options_for_load_points,
    apply_load_point_group_assignment as apply_load_point_group_assignment_core,
    apply_load_point_group_assignment_batch as apply_load_point_group_assignment_batch_core,
    apply_load_point_group_edit as apply_load_point_group_edit_core,
    apply_load_point_group_ungroup_batch as apply_load_point_group_ungroup_batch_core,
    assess_load_point_group_assignments as assess_load_point_group_assignments_core,
    assess_technical_assignment as assess_technical_assignment_core,
    build_load_point_topology as build_load_point_topology_core,
    build_tip_level_region_topology as build_tip_level_region_topology_core, calculate_pile_cost,
    choose_default_pile_options, derive_load_point_groups as derive_load_point_groups_core,
    evaluate_cpt_settings_edit as evaluate_cpt_settings_edit_core,
    evaluate_load_point_grouping_settings as evaluate_load_point_grouping_settings_core,
    evaluate_mcp_project_edit as evaluate_mcp_project_edit_core,
    evaluate_pile_cost_catalog_edit as evaluate_pile_cost_catalog_edit_core,
    import_project_from_sources, preview_import_source,
    preview_load_point_group_edit as preview_load_point_group_edit_core, preview_pile_plan_import,
    read_project_document as read_project_document_core,
    validate_load_point_lock_batch as validate_load_point_lock_batch_core,
    validate_manual_cpt_selection_batch as validate_manual_cpt_selection_batch_core,
    validate_project_tip_levels, write_pile_plan_csv as write_pile_plan_csv_bytes,
    write_pile_plan_xlsx as write_pile_plan_xlsx_bytes,
    write_project_document as write_project_document_core, AggregatedPileConfiguration,
    ApplyLoadPointGroupAssignmentBatchInput, ApplyLoadPointGroupAssignmentBatchResult,
    ApplyLoadPointGroupAssignmentInput, ApplyLoadPointGroupAssignmentResult, CptSettingsEditInput,
    CptSettingsEditResult, DerivedLoadPointGroups, GroupAssignmentConflict, ImportSourcePreview,
    InvalidPileTipLevels, LoadPointGroupEditInput, LoadPointGroupEditPreview,
    LoadPointGroupEditResult, LoadPointGroupUngroupBatchInput, LoadPointGroupingSettingsEditInput,
    LoadPointGroupingSettingsEditResult, LoadPointLockBatchInput, LoadPointLockBatchResult,
    LoadPointTopology, ManualCptSelectionBatchInput, ManualCptSelectionBatchResult,
    McpProjectEditInput, McpProjectEditResult, PileConfigurationKey, PileCostCatalogEditInput,
    PileCostCatalogEditResult, PileOptionAnalysisResult, PilePlanExportRequest,
    PilePlanImportPreview, PilePlanImportRequest, ProjectDocumentError,
    TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError, TipLevelRegionTopology,
    ValidatedPilePlanProject,
};
use pile_plan_core::{
    AggregatePileOptionsRequest, AssessLoadPointGroupAssignmentsRequest, DefaultPileOptionsRequest,
    DeriveLoadPointGroupsRequest, ImportProjectRequest, LoadPointTopologyRequest, PileCostRequest,
    PileCostResponse, PileOptionAnalysisRequest, PreviewImportRequest, ReadProjectDocumentRequest,
    RefreshProjectRequest, TechnicalAssignmentRequest, TipLevelRegionTopologyRequest,
    WriteProjectDocumentRequest,
};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
mod analysis_transport;
use analysis_transport::run_analysis_payload;
#[cfg(test)]
mod dispatch_tests;
mod ilp_optimization;
mod ilp_worker;
mod mcp_bridge;
use ilp_optimization::{cancel_ilp_optimization, ilp_optimize, IlpJobs};
use mcp_bridge::{mcp_bridge_start, mcp_bridge_stop, McpBridgeState};

const PROJECT_OPEN_REQUESTED_EVENT: &str = "project-open-requested";

#[derive(Debug, Default)]
struct PendingProjectPaths {
    paths: Mutex<Vec<String>>,
}

impl PendingProjectPaths {
    fn new(paths: Vec<String>) -> Self {
        Self {
            paths: Mutex::new(paths),
        }
    }

    fn extend(&self, paths: Vec<String>) {
        self.paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .extend(paths);
    }

    fn take(&self) -> Vec<String> {
        std::mem::take(
            &mut *self
                .paths
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        )
    }
}

fn project_paths_from_args<I, S>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|argument| {
            let path = PathBuf::from(argument.as_ref());
            if !is_ifcpp_path(&path) {
                return None;
            }
            let path = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            Some(path.to_string_lossy().into_owned())
        })
        .collect()
}

fn is_ifcpp_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ifcpp"))
}

#[cfg(any(test, target_os = "macos"))]
fn project_paths_from_urls(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| is_ifcpp_path(path))
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

// Owned, potentially expensive core/IO requests run off the native event thread.
// Tauri keeps their argument parsing and response serialization in the async task.
#[tauri::command(async, rename_all = "snake_case")]
fn calculate_pile_option_analysis(
    request: PileOptionAnalysisRequest,
) -> Result<PileOptionAnalysisResult, InvalidPileTipLevels> {
    pile_plan_core::calculate_pile_option_analysis(&request)
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

#[tauri::command(async, rename_all = "snake_case")]
fn choose_default_options(
    request: DefaultPileOptionsRequest,
) -> HashMap<u32, PileConfigurationKey> {
    choose_default_pile_options(
        &request.options_by_load_point,
        &request.groups,
        request.pile_head_level_m,
        &request.cost_settings,
    )
}

#[tauri::command(async, rename_all = "snake_case")]
fn aggregate_pile_options(
    request: AggregatePileOptionsRequest,
) -> Vec<AggregatedPileConfiguration> {
    aggregate_pile_options_for_load_points(&request.options_by_load_point)
}

#[tauri::command(async, rename_all = "snake_case")]
fn assess_technical_assignment(
    request: TechnicalAssignmentRequest,
) -> Result<TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError> {
    assess_technical_assignment_core(&request.groups, &request.options_by_load_point)
}

#[tauri::command(async, rename_all = "snake_case")]
fn import_project_from_files(
    request: ImportProjectRequest,
) -> Result<ValidatedPilePlanProject, pile_plan_core::SourceImportFailure> {
    let project = import_project_from_sources(
        &request.project_name,
        &request.sources,
        request.pile_head_level_m,
        &request.currency_code,
    )
    .map_err(|error| error.to_source_import_failure())?;
    let tip_level_keys = validate_project_tip_levels(&project).map_err(|error| {
        pile_plan_core::SourceImportFailure {
            unique_value_count: 0,
            exact_duplicate_count: 0,
            message: error.to_string(),
            diagnostics: vec![],
            conflicts: vec![],
        }
    })?;
    Ok(ValidatedPilePlanProject {
        project,
        tip_level_keys,
    })
}

#[tauri::command(async, rename_all = "snake_case")]
fn refresh_project_from_files(
    request: RefreshProjectRequest,
) -> Result<ValidatedPilePlanProject, pile_plan_core::SourceImportFailure> {
    let project = pile_plan_core::refresh_project_with_location_decisions(
        &request.current_project,
        &request.sources,
        request.location_decisions.as_ref(),
    )
    .map_err(|error| error.to_source_import_failure())?;
    let tip_level_keys = validate_project_tip_levels(&project).map_err(|error| {
        pile_plan_core::SourceImportFailure {
            unique_value_count: 0,
            exact_duplicate_count: 0,
            message: error.to_string(),
            diagnostics: vec![],
            conflicts: vec![],
        }
    })?;
    Ok(ValidatedPilePlanProject {
        project,
        tip_level_keys,
    })
}

#[tauri::command(async, rename_all = "snake_case")]
fn inspect_foundation_advice(request:pile_plan_core::FoundationAdviceInspectionRequest)->Result<Vec<pile_plan_core::CptBearingCapacityRow>,pile_plan_core::InvalidPileTipLevels>{
 pile_plan_core::inspect_foundation_advice(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_import_file(request: PreviewImportRequest) -> ImportSourcePreview {
    preview_import_source(&request.source)
}

#[tauri::command]
fn get_standard_csv_requirements() -> serde_json::Value {
    pile_plan_core::standard_csv_requirements()
}

#[tauri::command]
fn get_pile_plan_import_requirements() -> serde_json::Value {
    pile_plan_core::pile_plan_import_requirements()
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_pile_plan_import_file(request: PilePlanImportRequest) -> PilePlanImportPreview {
    preview_pile_plan_import(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_pile_driving_file(
    request: pile_plan_core::PileDrivingImportRequest,
) -> Result<pile_plan_core::PileDrivingPreview, pile_plan_core::PileDrivingImportError> {
    pile_plan_core::preview_pile_driving(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_pile_driving_files(
    request: pile_plan_core::PileDrivingBatchRequest,
) -> Result<pile_plan_core::PileDrivingBatchPreview, pile_plan_core::PileDrivingImportError> {
    pile_plan_core::preview_pile_driving_files(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn export_pile_plan_csv(request: PilePlanExportRequest) -> Result<Vec<u8>, String> {
    write_pile_plan_csv_bytes(&request).map_err(|error| error.to_string())
}

#[tauri::command(async, rename_all = "snake_case")]
fn export_pile_plan_xlsx(request: PilePlanExportRequest) -> Result<Vec<u8>, String> {
    write_pile_plan_xlsx_bytes(&request).map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn preview_configured_pile_plan_export(
    request: pile_plan_core::ConfiguredPilePlanExportRequest,
) -> Result<pile_plan_core::PilePlanExportPreview, String> {
    pile_plan_core::preview_configured_pile_plan_export(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn export_configured_pile_plan_csv(
    request: pile_plan_core::ConfiguredPilePlanExportRequest,
) -> Result<Vec<u8>, String> {
    pile_plan_core::write_configured_pile_plan_csv(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn export_configured_pile_plan_xlsx(
    request: pile_plan_core::ConfiguredPilePlanExportRequest,
) -> Result<Vec<u8>, String> {
    pile_plan_core::write_configured_pile_plan_xlsx(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn preview_revit_revision(
    request: pile_plan_core::RevitRevisionRequest,
) -> Result<pile_plan_core::RevitRevisionPreview, String> {
    pile_plan_core::preview_revit_revision(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn inspect_pile_table(
    request: pile_plan_core::InspectPileTableRequest,
) -> Result<pile_plan_core::PileTableInspection, String> {
    pile_plan_core::inspect_pile_table(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn export_revit_revision_csv(
    request: pile_plan_core::RevitRevisionRequest,
) -> Result<Vec<u8>, String> {
    pile_plan_core::write_revit_revision_csv(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn export_revit_revision_xlsx(
    request: pile_plan_core::RevitRevisionRequest,
) -> Result<Vec<u8>, String> {
    pile_plan_core::write_revit_revision_xlsx(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn reconcile_locations(
    request: pile_plan_core::LocationMatchingRequest,
) -> Result<pile_plan_core::LocationMatchingResult, String> {
    pile_plan_core::reconcile_locations(&request).map_err(|e| e.to_string())
}
#[tauri::command(async)]
fn prepare_load_point_refresh(
    request: pile_plan_core::LoadPointRefreshRequest,
) -> Result<pile_plan_core::LoadPointRefreshPreview, String> {
    pile_plan_core::prepare_load_point_refresh(&request).map_err(|e| e.to_string())
}

#[tauri::command(async, rename_all = "snake_case")]
fn read_project_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn take_pending_project_paths(state: State<'_, PendingProjectPaths>) -> Vec<String> {
    state.take()
}

#[tauri::command(async, rename_all = "snake_case")]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command(async, rename_all = "snake_case")]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command(async, rename_all = "snake_case")]
fn build_load_point_topology(request: LoadPointTopologyRequest) -> LoadPointTopology {
    build_load_point_topology_core(&request.load_points)
}

#[tauri::command(async, rename_all = "snake_case")]
fn read_project_document(
    request: ReadProjectDocumentRequest,
) -> Result<ValidatedPilePlanProject, ProjectDocumentError> {
    read_project_document_core(&request.contents)
}

#[tauri::command(async, rename_all = "snake_case")]
fn write_project_document(
    request: WriteProjectDocumentRequest,
) -> Result<String, ProjectDocumentError> {
    write_project_document_core(request.draft)
}

#[tauri::command(async, rename_all = "snake_case")]
fn build_tip_level_region_topology(
    request: TipLevelRegionTopologyRequest,
) -> TipLevelRegionTopology {
    build_tip_level_region_topology_core(
        &request.load_point_topology,
        &request.selected_assignments,
        &request.options_by_load_point,
    )
}

#[tauri::command(async, rename_all = "snake_case")]
fn evaluate_pile_cap_proposals(
    request: pile_plan_core::PileCapProposalRequest,
) -> Result<pile_plan_core::PileCapProposalResult, String> {
    pile_plan_core::evaluate_pile_cap_proposals(request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn derive_load_point_groups(request: DeriveLoadPointGroupsRequest) -> DerivedLoadPointGroups {
    derive_load_point_groups_core(&request.load_points, &request.settings)
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_load_point_group_edit(request: LoadPointGroupEditInput) -> LoadPointGroupEditPreview {
    preview_load_point_group_edit_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn apply_load_point_group_edit(request: LoadPointGroupEditInput) -> LoadPointGroupEditResult {
    apply_load_point_group_edit_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn assess_load_point_group_assignments(
    request: AssessLoadPointGroupAssignmentsRequest,
) -> Vec<GroupAssignmentConflict> {
    assess_load_point_group_assignments_core(
        &request.groups,
        &request.assignments,
        &request.locked_load_point_ids,
    )
}

#[tauri::command(async, rename_all = "snake_case")]
fn apply_load_point_group_assignment(
    request: ApplyLoadPointGroupAssignmentInput,
) -> ApplyLoadPointGroupAssignmentResult {
    apply_load_point_group_assignment_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn apply_load_point_group_assignment_batch(
    request: ApplyLoadPointGroupAssignmentBatchInput,
) -> ApplyLoadPointGroupAssignmentBatchResult {
    apply_load_point_group_assignment_batch_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn apply_load_point_group_ungroup_batch(
    request: LoadPointGroupUngroupBatchInput,
) -> LoadPointGroupEditResult {
    apply_load_point_group_ungroup_batch_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn validate_manual_cpt_selection_batch(
    request: ManualCptSelectionBatchInput,
) -> ManualCptSelectionBatchResult {
    validate_manual_cpt_selection_batch_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn evaluate_cpt_settings_edit(request: CptSettingsEditInput) -> CptSettingsEditResult {
    evaluate_cpt_settings_edit_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn evaluate_load_point_grouping_settings(
    request: LoadPointGroupingSettingsEditInput,
) -> LoadPointGroupingSettingsEditResult {
    evaluate_load_point_grouping_settings_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn evaluate_pile_cost_catalog_edit(request: PileCostCatalogEditInput) -> PileCostCatalogEditResult {
    evaluate_pile_cost_catalog_edit_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn evaluate_mcp_project_edit(request: McpProjectEditInput) -> McpProjectEditResult {
    evaluate_mcp_project_edit_core(&request)
}

#[tauri::command(async, rename_all = "snake_case")]
fn validate_load_point_lock_batch(request: LoadPointLockBatchInput) -> LoadPointLockBatchResult {
    validate_load_point_lock_batch_core(&request)
}

fn main() {
    if ilp_worker::is_worker_process() {
        ilp_worker::worker_main();
        return;
    }
    let launch_cwd = std::env::current_dir().unwrap_or_default();
    let launch_paths = project_paths_from_args(std::env::args_os(), &launch_cwd);
    tauri::Builder::default()
        .manage(PendingProjectPaths::new(launch_paths))
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = project_paths_from_args(args, Path::new(&cwd));
            if !paths.is_empty() {
                app.state::<PendingProjectPaths>().extend(paths);
                let _ = app.emit(PROJECT_OPEN_REQUESTED_EVENT, ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(IlpJobs::default())
        .manage(McpBridgeState::default())
        .setup(|app| {
            app.state::<McpBridgeState>()
                .install_response_listener(&app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<IlpJobs>().cancel();
                window.state::<McpBridgeState>().stop();
            }
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            run_analysis_payload,
            aggregate_pile_options,
            assess_technical_assignment,
            apply_load_point_group_assignment,
            apply_load_point_group_assignment_batch,
            apply_load_point_group_edit,
            apply_load_point_group_ungroup_batch,
            validate_manual_cpt_selection_batch,
            evaluate_cpt_settings_edit,
            evaluate_load_point_grouping_settings,
            evaluate_pile_cost_catalog_edit,
            evaluate_mcp_project_edit,
            validate_load_point_lock_batch,
            assess_load_point_group_assignments,
            build_load_point_topology,
            build_tip_level_region_topology,
            calculate_pile_option_analysis,
            calculate_pile_option_cost,
            choose_default_options,
            derive_load_point_groups,
            evaluate_pile_cap_proposals,
            preview_load_point_group_edit,
            ilp_optimize,
            cancel_ilp_optimization,
            read_project_document,
            write_project_document,
            import_project_from_files,
            refresh_project_from_files,
            preview_import_file,
            inspect_foundation_advice,
            preview_project_import_files,
            get_standard_csv_requirements,
            get_pile_plan_import_requirements,
            preview_pile_plan_import_file,
            preview_pile_driving_file,
            preview_pile_driving_files,
            export_pile_plan_csv,
            export_pile_plan_xlsx,
            preview_configured_pile_plan_export,
            export_configured_pile_plan_csv,
            export_configured_pile_plan_xlsx,
            preview_revit_revision,
            inspect_pile_table,
            export_revit_revision_csv,
            export_revit_revision_xlsx,
            reconcile_locations,
            prepare_load_point_refresh,
            read_project_file,
            write_project_file,
            write_binary_file,
            take_pending_project_paths,
            mcp_bridge_start,
            mcp_bridge_stop,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Open Pile Plan Studio")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths = project_paths_from_urls(&urls);
                if !paths.is_empty() {
                    _app.state::<PendingProjectPaths>().extend(paths);
                    let _ = _app.emit(PROJECT_OPEN_REQUESTED_EVENT, ());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use pile_plan_core::{
        LoadPointGroup, LoadPointGroupingSettings, PileConfigurationOption, ProjectDocumentDraft,
    };

    #[test]
    fn mcp_import_requirements_command_uses_core_contract() {
        let requirements = get_standard_csv_requirements();
        assert_eq!(requirements["version"], 1);
        assert_eq!(requirements["roles"][0]["role"], "load-points");
        assert_eq!(requirements["roles"][2]["columns"][1]["unit"], "m");
    }

    #[test]
    fn launch_arguments_select_only_ifcpp_projects_and_resolve_relative_paths() {
        let paths = project_paths_from_args(
            ["pile-plan-studio.exe", "project.IFCPP", "notes.txt"],
            std::path::Path::new("C:/projects"),
        );

        assert_eq!(
            paths,
            vec![std::path::Path::new("C:/projects")
                .join("project.IFCPP")
                .to_string_lossy()
                .into_owned()]
        );
    }

    #[test]
    fn file_urls_preserve_local_unicode_paths_and_filter_other_resources() {
        let path = std::env::temp_dir().join("project space α.IFCPP");
        let urls = vec![
            tauri::Url::from_file_path(&path).unwrap(),
            tauri::Url::parse("https://example.com/project.ifcpp").unwrap(),
            tauri::Url::from_file_path(path.with_extension("txt")).unwrap(),
        ];
        assert_eq!(
            project_paths_from_urls(&urls),
            vec![path.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn pending_project_paths_are_drained_exactly_once() {
        let pending = PendingProjectPaths::new(vec!["C:/projects/first.ifcpp".to_string()]);

        assert_eq!(pending.take(), vec!["C:/projects/first.ifcpp"]);
        assert!(pending.take().is_empty());
    }

    #[test]
    fn tip_level_region_commands_return_core_results() {
        let load_point_topology = build_load_point_topology(LoadPointTopologyRequest {
            load_points: vec![],
        });
        let topology = build_tip_level_region_topology(TipLevelRegionTopologyRequest {
            load_point_topology,
            selected_assignments: HashMap::new(),
            options_by_load_point: HashMap::new(),
        });

        assert!(topology.groups.is_empty());
    }

    #[test]
    fn pile_cap_proposal_survives_native_file_save_and_reopen() {
        let validated = read_project_document(ReadProjectDocumentRequest {
            contents: include_str!("../../../../sample_project/sample_project.ifcpp").to_string(),
        })
        .unwrap();
        let mut draft = ProjectDocumentDraft::from_project(&validated.project);
        let plan_id = draft.user_state.active_pile_plan_id.clone();
        let result = evaluate_pile_cap_proposals(pile_plan_core::PileCapProposalRequest {
            draft: draft.clone(),
            edit: Some(pile_plan_core::PileCapProposalEdit {
                plan_id: plan_id.clone(),
                proposal: pile_plan_core::PileCapProposal {
                    load_point_ids: vec![15, 43],
                    pile_count: 3,
                    quarter_turns: 1,
                    configuration: None,
                },
                remove: false,
            }),
        })
        .unwrap();
        draft
            .user_state
            .pile_plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .unwrap()
            .pile_cap_proposals = result
            .plans
            .iter()
            .find(|p| p.plan_id == plan_id)
            .unwrap()
            .proposals
            .clone();
        let contents = write_project_document(WriteProjectDocumentRequest { draft }).unwrap();
        let name = format!(
            "pile-cap-proposal-{}-{}.ifcpp",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let path = std::env::temp_dir()
            .join(name)
            .to_string_lossy()
            .into_owned();
        write_project_file(path.clone(), contents).unwrap();
        let reopened = read_project_document(ReadProjectDocumentRequest {
            contents: read_project_file(path.clone()).unwrap(),
        })
        .unwrap();
        std::fs::remove_file(path).unwrap();
        let proposal = &reopened
            .project
            .user_state
            .active_pile_plan()
            .unwrap()
            .pile_cap_proposals[0];
        assert_eq!(proposal.load_point_ids, vec![15, 43]);
        assert_eq!(proposal.pile_count, 3);
        assert_eq!(proposal.quarter_turns, 1);
        assert_eq!(reopened.project.inputs, validated.project.inputs);
    }

    #[test]
    fn project_document_commands_delegate_read_write_and_structured_errors() {
        let validated = read_project_document(ReadProjectDocumentRequest {
            contents: include_str!("../../../../sample_project/sample_project.ifcpp").to_string(),
        })
        .expect("sample project reads");
        let written = write_project_document(WriteProjectDocumentRequest {
            draft: ProjectDocumentDraft::from_project(&validated.project),
        })
        .expect("sample project writes");

        assert_eq!(
            read_project_document(ReadProjectDocumentRequest { contents: written })
                .expect("written project reads")
                .project
                .schema_version,
            validated.project.schema_version
        );
        assert!(matches!(
            read_project_document(ReadProjectDocumentRequest {
                contents: "{".to_string(),
            })
            .unwrap_err(),
            ProjectDocumentError::InvalidJson { .. }
        ));
    }

    #[test]
    fn aggregate_command_returns_authoritative_core_facts() {
        let option = PileConfigurationOption {
            compression: None,
            tension: None,
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
            technical_status: pile_plan_core::PileOptionTechnicalStatus::Valid,
        };
        let result = aggregate_pile_options(AggregatePileOptionsRequest {
            options_by_load_point: HashMap::from([(7, vec![option])]),
        });

        assert_eq!(result[0].configuration.pile_tip_level_mm, -18_500);
        assert_eq!(result[0].maximum_utilization, Some(0.82));
        assert_eq!(result[0].critical_load_point_id, Some(7));
    }

    #[test]
    fn technical_assignment_command_returns_grouped_missing_result() {
        let mut valid = PileConfigurationOption {
            compression: None,
            tension: None,
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
            technical_status: pile_plan_core::PileOptionTechnicalStatus::Valid,
        };
        let mut missing = valid.clone();
        missing.is_option = false;
        missing.missing_cpt_ids = vec![62];
        missing.technical_status = pile_plan_core::PileOptionTechnicalStatus::MissingCapacityData;
        valid.governing_cpt_id = Some(61);

        let result = assess_technical_assignment(TechnicalAssignmentRequest {
            groups: vec![LoadPointGroup {
                load_point_ids: vec![1, 2],
                origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
            }],
            options_by_load_point: HashMap::from([(1, vec![valid]), (2, vec![missing])]),
        })
        .unwrap();

        assert_eq!(result.issues[0].group_load_point_ids, vec![1, 2]);
        assert_eq!(
            result.issues[0].status,
            pile_plan_core::TechnicalAssignmentIssueStatus::MissingCapacityData
        );
    }

    #[test]
    fn load_point_group_commands_return_core_results() {
        let groups = derive_load_point_groups(DeriveLoadPointGroupsRequest {
            load_points: vec![],
            settings: LoadPointGroupingSettings::default(),
        });
        let requested_configuration = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18_000,
        };
        let result =
            apply_load_point_group_assignment(pile_plan_core::ApplyLoadPointGroupAssignmentInput {
                selected_load_point_ids: vec![2],
                groups: vec![pile_plan_core::LoadPointGroup {
                    load_point_ids: vec![1, 2],
                    origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
                }],
                requested_configuration: Some(requested_configuration),
                current_assignments: HashMap::new(),
                locked_load_point_ids: vec![],
            });

        assert!(groups.groups.is_empty());
        assert!(matches!(
            result,
            pile_plan_core::ApplyLoadPointGroupAssignmentResult::Applied { changes }
                if changes.len() == 2
        ));
    }
}

#[tauri::command(async, rename_all = "snake_case")]
fn preview_project_import_files(
    request: pile_plan_core::PreviewProjectImportRequest,
) -> pile_plan_core::ProjectImportPreview {
    pile_plan_core::preview_project_import(&request)
}
