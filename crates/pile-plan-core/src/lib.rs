mod cpt_selection;
mod export;
mod ifcpp;
mod import;
mod legacy_optimization;
mod load_point_groups;
mod load_point_positions;
mod optimization;
mod pile_configuration;
mod pile_options;
mod pile_plan_import;
mod pile_tip_levels;
mod project;
mod source_data;
mod technical_assignment;
mod tip_level_regions;

pub(crate) use project::APPLICATION_NAME;

pub use cpt_selection::{CptSelectionAlgorithm, CptSelectionSettings, SelectedCpt};
pub use export::{
    build_pile_plan_export_rows, write_pile_plan_csv, write_pile_plan_xlsx, ExportError,
    PilePlanExportRequest, PilePlanExportRow, PILE_PLAN_EXPORT_HEADERS,
};
pub use ifcpp::{
    read_ifcpp_str, read_project_document, read_validated_ifcpp_str, validate_ifcpp_project,
    write_ifcpp_string, write_project_document, IfcppError, ProjectDocumentError,
};
pub use import::{
    import_project_from_sources, preview_import_source, refresh_project_from_profiled_sources,
    ImportDiagnostic, ImportDiagnosticCode, ImportDiagnosticLocation, ImportDiagnosticSeverity,
    ImportError, ImportPreviewDetails, ImportProfile, ImportProfileOptions, ImportRole,
    ImportSource, ImportSourcePreview, RfemPreviewDetails, SourceFormat,
};
pub use legacy_optimization::LegacyOptimizationSettings;
pub use load_point_groups::{
    apply_load_point_group_assignment, derive_load_point_groups,
    ApplyLoadPointGroupAssignmentInput, ApplyLoadPointGroupAssignmentResult,
    BlockingLockedLoadPoint, LoadPointGroup, LoadPointGroupAssignmentChange,
    LoadPointGroupingSettings, DEFAULT_MAX_GROUP_EDGE_DISTANCE_MM,
};
pub use load_point_positions::{
    duplicate_load_point_positions, validate_unique_load_point_positions,
    DuplicateLoadPointPosition, DuplicateLoadPointPositionMember, DuplicateLoadPointPositions,
};
pub use optimization::{
    prepare_optimization_units, IlpCandidateSource, IlpAssignment, IlpCostReference, IlpCounts, IlpDiagnostic, IlpEvent,
    IlpLimitProposal, IlpOptimizationInput, IlpOptimizationOutcome, IlpOptimizationSession,
    IlpSolverBackend, IlpSolverModel, IlpSolverUpdate, IlpSolverOutcome, IlpOptimizationSettings, IlpPhase, IlpProgress, IlpProof, IlpRunRequest, IlpSolution,
    IlpTermination, IlpTransitionCounts, IlpTransitionWeights, OptimizationCandidateSettings,
    OptimizationLimitScope, OptimizationPreparationDiagnostic,
    OptimizationPreparationDiagnosticKind, OptimizationPreparationResult,
    OptimizationUnassignedReason, OptimizationUnit,
    OptimizationUnitOption, PrepareOptimizationUnitsInput,
};
pub use pile_configuration::PileConfigurationKey;
pub use pile_options::{
    aggregate_pile_options_for_load_points, build_pile_option_analysis, calculate_pile_cost,
    choose_default_pile_options, pile_option_technical_status, validate_pile_cost_settings,
    AggregatedPileConfiguration, AggregatedPileConfigurationStatus, CptBearingCapacityRow,
    InvalidPileCostSettings, InvalidPileCostSettingsItem, PileConfigurationOption,
    PileCostSettings, PileCostSettingsItem, PileCostShape, PileCostValidationReason,
    PileOptionAnalysisResult, PileOptionTechnicalStatus,
};
pub use pile_plan_import::{
    preview_pile_plan_import, PilePlanImportChange, PilePlanImportDiagnostic,
    PilePlanImportDiagnosticCode, PilePlanImportDiagnosticLocation,
    PilePlanImportDiagnosticSeverity, PilePlanImportOptions, PilePlanImportPatch,
    PilePlanImportPreview, PilePlanImportProfile, PilePlanImportRequest, PilePlanImportSummary,
    PilePlanImportedValue,
};
pub use pile_tip_levels::{
    pile_tip_level_m, try_pile_tip_level_mm, InvalidPileTipLevels, PileTipLevelPrecisionError,
    PileTipLevelPrecisionErrorReason,
};
pub use project::{
    validate_project_tip_levels, ExternalReference, InvalidProjectPileTipLevel,
    InvalidProjectPileTipLevels, PilePlan, PilePlanProject, PilePlanTipLevelKeys,
    ProjectApplication, ProjectDocumentDraft, ProjectImportLogEntry, ProjectInputs,
    ProjectMetadata, ProjectPileTipLevelContext, ProjectSettings, ProjectTipLevelKeys,
    ProjectUnits, ProjectUserState, SelectedPileChoice, ValidatedPilePlanProject,
    ViewerUtilizationSettings,
};
pub use source_data::{
    BearingCapacity as ProjectBearingCapacity, Cpt as ProjectCpt, LoadPoint as ProjectLoadPoint,
};
pub use technical_assignment::{
    assess_technical_assignment, TechnicalAssignmentAssessment, TechnicalAssignmentAssessmentError,
    TechnicalAssignmentAvailability, TechnicalAssignmentIssue, TechnicalAssignmentIssueCause,
    TechnicalAssignmentIssueStatus,
};
pub use tip_level_regions::{
    build_load_point_topology, build_tip_level_region_topology, LoadPointEdge, LoadPointFace,
    LoadPointTopology, TipLevelRegionAssignment, TipLevelRegionGroup, TipLevelRegionTopology,
};
