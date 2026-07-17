use serde::{Deserialize, Serialize};

use crate::{PileConfigurationKey, ProjectCpt, ProjectLoadPoint, SourceFormat};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PilePlanImportProfile {
    #[default]
    Automatic,
    StandardTable,
    Legacy,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PilePlanImportOptions {
    pub import_pile_assignments: bool,
    pub import_cpt_selections: bool,
    pub coordinate_tolerance_mm: f64,
}

impl Default for PilePlanImportOptions {
    fn default() -> Self {
        Self {
            import_pile_assignments: true,
            import_cpt_selections: true,
            coordinate_tolerance_mm: 1.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PilePlanImportRequest {
    pub file_name: String,
    pub format: SourceFormat,
    pub bytes: Vec<u8>,
    #[serde(default)]
    pub profile: PilePlanImportProfile,
    #[serde(default)]
    pub options: PilePlanImportOptions,
    pub load_points: Vec<ProjectLoadPoint>,
    pub cpts: Vec<ProjectCpt>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "action", content = "value", rename_all = "kebab-case")]
pub enum PilePlanImportedValue<T> {
    Preserve,
    Clear,
    Set(T),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PilePlanImportChange {
    pub load_point_id: u32,
    pub pile: PilePlanImportedValue<PileConfigurationKey>,
    pub manual_cpt_ids: PilePlanImportedValue<Vec<u32>>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct PilePlanImportPatch {
    pub changes: Vec<PilePlanImportChange>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PilePlanImportDiagnosticSeverity {
    Warning,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PilePlanImportDiagnosticCode {
    InvalidSource,
    UnknownProfile,
    InvalidTolerance,
    InvalidRow,
    UnsupportedPileCount,
    UnmatchedLoadPoint,
    AmbiguousLoadPoint,
    ConflictingRows,
    UnknownCpt,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PilePlanImportDiagnosticLocation {
    pub sheet_name: Option<String>,
    pub row: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PilePlanImportDiagnostic {
    pub severity: PilePlanImportDiagnosticSeverity,
    pub code: PilePlanImportDiagnosticCode,
    pub message: String,
    pub location: Option<PilePlanImportDiagnosticLocation>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PilePlanImportSummary {
    pub source_rows: usize,
    pub matched_rows: usize,
    pub coordinate_fallbacks: usize,
    pub skipped_rows: usize,
    pub conflicts: usize,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PilePlanImportPreview {
    pub requested_profile: PilePlanImportProfile,
    pub detected_profile: Option<PilePlanImportProfile>,
    pub supports_cpt_selections: bool,
    pub can_apply: bool,
    pub summary: PilePlanImportSummary,
    pub diagnostics: Vec<PilePlanImportDiagnostic>,
    pub patch: PilePlanImportPatch,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pile_plan_import_contract_uses_stable_profile_names() {
        assert_eq!(
            serde_json::to_string(&PilePlanImportProfile::StandardTable).unwrap(),
            "\"standard-table\""
        );
        assert_eq!(
            serde_json::to_string(&PilePlanImportProfile::Legacy).unwrap(),
            "\"legacy\""
        );
    }

    #[test]
    fn import_options_default_to_both_categories_and_one_millimetre() {
        let options = PilePlanImportOptions::default();

        assert!(options.import_pile_assignments);
        assert!(options.import_cpt_selections);
        assert_eq!(options.coordinate_tolerance_mm, 1.0);
    }

    #[test]
    fn imported_values_have_an_explicit_wire_action() {
        let clear = PilePlanImportedValue::<u32>::Clear;
        let set = PilePlanImportedValue::Set(320_u32);

        assert_eq!(serde_json::to_value(clear).unwrap()["action"], "clear");
        assert_eq!(serde_json::to_value(&set).unwrap()["action"], "set");
        assert_eq!(serde_json::to_value(set).unwrap()["value"], 320);
    }
}
