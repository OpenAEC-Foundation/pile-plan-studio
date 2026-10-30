use super::{ImportDiagnostic, ImportProfile};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct AdviceSheetSelection {
    pub table: Option<super::TableImportSettings>,
    #[serde(default)]
    pub direction: crate::ResistanceDirection,
    pub tension_column: Option<usize>,
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
    #[serde(default)]
    pub missing: bool,
    pub frd_kn: f64,
    pub locations: Vec<AdviceValueLocation>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AdviceConflict {
    #[serde(default)]
    pub pile_count: Option<u32>,
    #[serde(default)]
    pub direction: crate::ResistanceDirection,
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
    NeedsProfile,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AdviceSheetPreview {
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub table: Option<super::SourceTablePreview>,
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
    #[serde(default)]
    pub counts_available: bool,
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

#[cfg(test)]
mod contract_tests {
    use super::*;
    #[test]
    fn profile_requirement_and_diagnostic_details_survive_transport() {
        assert_eq!(
            serde_json::from_str::<AdviceSheetStatus>("\"needs-profile\"").unwrap(),
            AdviceSheetStatus::NeedsProfile
        );
        let d: ImportDiagnostic = serde_json::from_value(serde_json::json!({
            "severity":"error","code":"advice-profile-required","count":1,"node_ids":[],
            "location":null,"fallback_message":"Choose profile",
            "advice":{"field":"header","value":"","expected_unit":"millimetres",
                "pile_sizes_mm":[250,290],"column_count":4,"required_profile":"capacity-columns"}
        }))
        .unwrap();
        assert_eq!(d.advice.as_ref().unwrap().value.as_deref(), Some(""));
        assert_eq!(
            serde_json::to_value(d).unwrap()["advice"]["pile_sizes_mm"],
            serde_json::json!([250, 290])
        );
    }
    #[test]
    fn legacy_diagnostic_and_uncomputed_counts_remain_distinct() {
        let d: ImportDiagnostic = serde_json::from_value(serde_json::json!({
            "severity":"error","code":"invalid-required-value","count":1,"node_ids":[],
            "location":null,"fallback_message":"Invalid"
        }))
        .unwrap();
        assert!(d.advice.is_none());
        assert!(!ProjectImportPreview::default().counts_available);
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct AdviceDiagnosticDetails {
    pub field: Option<AdviceField>,
    pub value: Option<String>,
    pub expected_unit: Option<AdviceUnit>,
    #[serde(default)]
    pub pile_sizes_mm: Vec<u32>,
    pub column_count: Option<usize>,
    pub required_profile: Option<ImportProfile>,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AdviceField {
    CptId,
    TipLevel,
    PileSize,
    Resistance,
    Header,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AdviceUnit {
    Metres,
    Millimetres,
    Kilonewtons,
}
