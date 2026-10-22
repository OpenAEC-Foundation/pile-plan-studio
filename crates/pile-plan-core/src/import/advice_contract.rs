use super::{ImportDiagnostic, ImportProfile};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct AdviceSheetSelection {
    pub sheet_name: String,
    pub profile: ImportProfile,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct AdviceValueLocation {
    pub source_id: String,
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub row: Option<usize>,
    pub column: Option<usize>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AdviceConflictValue {
    pub frd_kn: f64,
    pub locations: Vec<AdviceValueLocation>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AdviceConflict {
    pub cpt_id: u32,
    pub pile_size_mm: u32,
    pub pile_tip_level_mm: i64,
    pub values: Vec<AdviceConflictValue>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct AdviceTableSummary {
    pub item_count: usize,
    pub cpt_count: usize,
    pub pile_sizes_mm: Vec<u32>,
    pub min_tip_level_mm: Option<i64>,
    pub max_tip_level_mm: Option<i64>,
    pub missing_cell_count: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AdviceSheetStatus {
    Ready,
    Invalid,
    Unsupported,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AdviceSheetPreview {
    pub sheet_name: String,
    pub status: AdviceSheetStatus,
    pub detected_profile: Option<ImportProfile>,
    pub resolved_profile: Option<ImportProfile>,
    pub summary: AdviceTableSummary,
    pub diagnostics: Vec<ImportDiagnostic>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct AdviceSourcePreview {
    pub source_id: String,
    pub sheets: Vec<AdviceSheetPreview>,
    pub suggested_selection: Vec<AdviceSheetSelection>,
    pub diagnostics: Vec<ImportDiagnostic>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct ProjectImportPreview {
    pub existing_sources: Vec<StoredAdviceSource>,
    pub can_apply: bool,
    pub unique_value_count: usize,
    pub imported_value_count: usize,
    pub exact_duplicate_count: usize,
    pub orphan_value_count: usize,
    pub conflicts: Vec<AdviceConflict>,
    pub diagnostics: Vec<ImportDiagnostic>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SourceImportFailure {
    #[serde(default)]
    pub unique_value_count: usize,
    #[serde(default)]
    pub exact_duplicate_count: usize,
    pub message: String,
    pub diagnostics: Vec<ImportDiagnostic>,
    pub conflicts: Vec<AdviceConflict>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AdviceImportOperation {
    Append,
    Replace { advice_id: String },
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct StoredAdviceSource {
    pub id: String,
    pub file_names: Vec<String>,
    pub sheet_names: Vec<String>,
    pub item_count: usize,
    pub combined_legacy: bool,
}
