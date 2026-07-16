use serde::{Deserialize, Serialize};

use super::{ImportRole, SourceFormat, SourceLocation};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportProfile {
    #[default]
    Auto,
    StandardTable,
    RfemExport,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportProfileOptions {
    pub coordinate_sheet: Option<String>,
    pub reaction_sheet: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportDiagnosticSeverity {
    Warning,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportDiagnosticCode {
    InvalidWorkbook,
    UnsupportedProfileFormat,
    MissingCoordinateSheet,
    MissingReactionSheet,
    AmbiguousCoordinateSheet,
    AmbiguousReactionSheet,
    MissingRequiredColumn,
    InvalidRequiredValue,
    ConflictingCoordinateDuplicate,
    ConflictingReactionDuplicate,
    ExactCoordinateDuplicates,
    ExactReactionDuplicates,
    ReactionNodesWithoutCoordinates,
    CoordinateNodesWithoutReactions,
    NoImportedRows,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportDiagnosticLocation {
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub row: Option<usize>,
    pub column: Option<usize>,
    pub column_name: Option<String>,
}

impl From<&SourceLocation> for ImportDiagnosticLocation {
    fn from(location: &SourceLocation) -> Self {
        Self {
            file_name: location.file_name.clone(),
            sheet_name: location.sheet_name.clone(),
            row: location.row,
            column: location.column,
            column_name: location.column_name.map(str::to_string),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportDiagnostic {
    pub severity: ImportDiagnosticSeverity,
    pub code: ImportDiagnosticCode,
    pub count: usize,
    pub node_ids: Vec<u32>,
    pub location: Option<ImportDiagnosticLocation>,
    pub fallback_message: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ImportPreviewDetails {
    StandardTable { sheet_name: Option<String> },
    RfemExport(RfemPreviewDetails),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RfemPreviewDetails {
    pub coordinate_sheet_candidates: Vec<String>,
    pub reaction_sheet_candidates: Vec<String>,
    pub selected_coordinate_sheet: Option<String>,
    pub selected_reaction_sheet: Option<String>,
    pub load_rule: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ImportSourcePreview {
    pub role: ImportRole,
    pub requested_profile: ImportProfile,
    pub detected_profile: ImportProfile,
    pub resolved_profile: Option<ImportProfile>,
    pub available_profiles: Vec<ImportProfile>,
    pub resolved_options: ImportProfileOptions,
    pub item_count: usize,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub details: Option<ImportPreviewDetails>,
}

impl ImportSourcePreview {
    pub fn has_errors(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|item| item.severity == ImportDiagnosticSeverity::Error)
    }
}

pub fn available_profiles(role: ImportRole, format: SourceFormat) -> Vec<ImportProfile> {
    match (role, format) {
        (ImportRole::LoadPoints, SourceFormat::Xlsx) => {
            vec![ImportProfile::StandardTable, ImportProfile::RfemExport]
        }
        _ => vec![ImportProfile::StandardTable],
    }
}
