mod matching;
mod source;
use crate::import::{parse_finite_number, parse_nonnegative_u32, NumericParseError};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::{
    import::read_xlsx_tables, import::SourceTable, import::TableCell, PileConfigurationKey,
    ProjectCpt, ProjectLoadPoint, SourceFormat,
};

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
    pub table: Option<crate::TableImportSettings>,
    pub location_decisions: Option<crate::LocationDecisions>,
    pub bulk_action: Option<crate::LocationBulkAction>,
    pub import_pile_assignments: bool,
    pub import_cpt_selections: bool,
    pub coordinate_tolerance_mm: f64,
}

impl Default for PilePlanImportOptions {
    fn default() -> Self {
        Self {
            table: None,
            location_decisions: None,
            bulk_action: None,
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
    #[serde(default)]
    pub available_pile_configurations: Vec<PileConfigurationKey>,
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
    InvalidColumnMapping,
    InvalidLocationMapping,
    InvalidSource,
    UnknownProfile,
    InvalidTolerance,
    InvalidRow,
    UnsupportedPileCount,
    UnmatchedLoadPoint,
    AmbiguousLoadPoint,
    ConflictingRows,
    SupersededLegacyRow,
    UnknownCpt,
    UnknownPileConfiguration,
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
    #[serde(default)]
    pub table: Option<crate::SourceTablePreview>,
    #[serde(default)]
    pub source_locations: Vec<matching::ImportLocation>,
    #[serde(default)]
    pub matching: Option<matching::ImportMatching>,
    #[serde(default)]
    pub supports_pile_assignments: bool,
    pub requested_profile: PilePlanImportProfile,
    pub detected_profile: Option<PilePlanImportProfile>,
    pub supports_cpt_selections: bool,
    pub can_apply: bool,
    pub summary: PilePlanImportSummary,
    pub diagnostics: Vec<PilePlanImportDiagnostic>,
    pub patch: PilePlanImportPatch,
}

#[derive(Clone, Debug, PartialEq)]
struct ParsedPilePlanRow {
    source_id: Option<u32>,
    x_mm: Option<f64>,
    y_mm: Option<f64>,
    pile: PilePlanImportedValue<PileConfigurationKey>,
    manual_cpt_ids: PilePlanImportedValue<Vec<u32>>,
    sheet_name: Option<String>,
    row: usize,
}

#[derive(Clone, Debug)]
struct ParsedPilePlanSource {
    profile: PilePlanImportProfile,
    supports_cpt_selections: bool,
    source_rows: usize,
    rows: Vec<ParsedPilePlanRow>,
    diagnostics: Vec<PilePlanImportDiagnostic>,
}

pub fn pile_plan_import_requirements() -> serde_json::Value {
    serde_json::json!({
        "version": 1,
        "profile": "standard-table",
        "format": "csv",
        "encoding": "UTF-8",
        "delimiter": ",",
        "decimal_separator": ".",
        "columns": [
            {"name": "Load Point ID", "type": "unsigned integer"},
            {"name": "X [mm]", "type": "number", "unit": "mm"},
            {"name": "Y [mm]", "type": "number", "unit": "mm"},
            {"name": "FEd [kN]", "type": "number", "unit": "kN", "used_for_matching": false},
            {"name": "Pile Size [mm]", "type": "positive integer, equal square dimensions, or empty", "unit": "mm"},
            {"name": "Pile Tip Level [m]", "type": "number or empty", "unit": "m"},
            {"name": "Selected CPTs", "type": "comma-separated CPT IDs or empty"}
        ],
        "example": "Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n1,1000,1500,80,320,-18.5,\n",
        "notes": [
            "Named export headers are recognized automatically. Optional table settings support custom columns, headers, worksheets, units and delimiters.",
            "Square pile sizes may use equal dimensions such as 290x290; x, X and × are accepted. This notation does not change project pile shapes.",
            "Pile Size and Pile Tip Level both empty clear the pile assignment when that category is enabled.",
            "An empty Selected CPTs cell clears the manual CPT choice when that category is enabled.",
            "Manual CPT choices are project-wide and shared by all pile plans.",
            "Files may identify locations by ID only, X/Y only, or both. When both are present, ID matches require agreeing coordinates; otherwise one unique coordinate match is used.",
            "Decimals use a point, not a comma."
        ]
    })
}

pub fn preview_pile_plan_import(request: &PilePlanImportRequest) -> PilePlanImportPreview {
    let (table, mut inspection, profile) = match source::inspect(request) {
        Ok(value) => value,
        Err(error) => return failed_preview(request.profile, error),
    };
    let mut result = preview_with_source(request, &table, &inspection.settings, profile);
    for number in result
        .diagnostics
        .iter()
        .filter(|d| d.severity == PilePlanImportDiagnosticSeverity::Error)
        .filter_map(|d| d.location.as_ref().and_then(|l| l.row))
        .take(5)
    {
        if !inspection.rows.iter().any(|r| r.number == number) {
            if let Some(row) = table.rows.iter().find(|r| r.number == number) {
                inspection.rows.push(crate::import::SourcePreviewRow {
                    number,
                    cells: (0..inspection.columns.len())
                        .map(|i| row.cells.get(i).map(TableCell::as_text).unwrap_or_default())
                        .collect(),
                });
            }
        }
    }
    inspection.rows.sort_by_key(|r| r.number);
    result.supports_pile_assignments =
        inspection.settings.columns.as_ref().is_some_and(|columns| {
            columns.iter().any(|c| c.field == "pile-size")
                && columns.iter().any(|c| c.field == "tip-level")
        });
    result.supports_cpt_selections = profile != PilePlanImportProfile::Legacy
        && inspection
            .settings
            .columns
            .as_ref()
            .is_some_and(|columns| columns.iter().any(|c| c.field == "selected-cpts"));
    result.table = Some(inspection);
    result
}
fn preview_with_source(
    request: &PilePlanImportRequest,
    table: &SourceTable,
    settings: &crate::TableImportSettings,
    profile: PilePlanImportProfile,
) -> PilePlanImportPreview {
    if !request.options.coordinate_tolerance_mm.is_finite()
        || request.options.coordinate_tolerance_mm < 0.0
    {
        return failed_preview(
            request.profile,
            PilePlanImportDiagnostic {
                severity: PilePlanImportDiagnosticSeverity::Error,
                code: PilePlanImportDiagnosticCode::InvalidTolerance,
                message: "Coordinate tolerance must be a finite, non-negative number.".to_string(),
                location: None,
            },
        );
    }

    let parsed = match source::parse(table, settings, profile, &request.options) {
        Ok(parsed) => parsed,
        Err(diagnostic) => return failed_preview(request.profile, diagnostic),
    };
    let mut matching = match matching::evaluate(request, &parsed.rows) {
        Ok(value) => value,
        Err(diagnostic) => return failed_preview(request.profile, diagnostic),
    };
    let source_locations = parsed
        .rows
        .iter()
        .map(matching::ImportLocation::from)
        .collect();
    let load_points_by_id: HashMap<u32, &ProjectLoadPoint> = request
        .load_points
        .iter()
        .map(|load_point| (load_point.id, load_point))
        .collect();
    let known_cpts: HashSet<u32> = request.cpts.iter().map(|cpt| cpt.id).collect();
    let known_piles: HashSet<&PileConfigurationKey> =
        request.available_pile_configurations.iter().collect();
    let mut diagnostics = parsed.diagnostics;
    let mut summary = PilePlanImportSummary {
        source_rows: parsed.source_rows,
        skipped_rows: diagnostics
            .iter()
            .filter(|diagnostic| {
                diagnostic.code == PilePlanImportDiagnosticCode::UnsupportedPileCount
            })
            .count(),
        ..PilePlanImportSummary::default()
    };
    let mut candidates = Vec::new();

    for row in parsed.rows {
        let key = row.row as u32;
        let link = matching.links.iter().find(|link| link.new_id == key);
        let Some(link) = link else {
            summary.skipped_rows += 1;
            if !matching.added.contains(&key) {
                let ambiguous = matching
                    .proposals
                    .iter()
                    .any(|p| p.new_id == key && p.candidates.len() > 1);
                diagnostics.push(row_diagnostic(
                    &row,
                    if ambiguous {
                        PilePlanImportDiagnosticCode::AmbiguousLoadPoint
                    } else {
                        PilePlanImportDiagnosticCode::UnmatchedLoadPoint
                    },
                    format!("Source row {} could not be uniquely matched.", row.row),
                ));
            }
            continue;
        };
        let load_point = load_points_by_id[&link.old_id];
        let used_fallback = request.options.location_decisions.is_none()
            && row.x_mm.is_some()
            && row.source_id != Some(load_point.id);

        let pile = if request.options.import_pile_assignments {
            match &row.pile {
                PilePlanImportedValue::Set(pile) if !known_piles.contains(pile) => {
                    diagnostics.push(row_diagnostic(
                        &row,
                        PilePlanImportDiagnosticCode::UnknownPileConfiguration,
                        format!(
                            "Pile configuration {} mm / {} m is not available in the active project; the pile assignment is preserved.",
                            pile.pile_size_mm,
                            pile.pile_tip_level_m()
                        ),
                    ));
                    PilePlanImportedValue::Preserve
                }
                value => value.clone(),
            }
        } else {
            PilePlanImportedValue::Preserve
        };
        let manual_cpt_ids =
            if request.options.import_cpt_selections && parsed.supports_cpt_selections {
                match &row.manual_cpt_ids {
                    PilePlanImportedValue::Set(cpt_ids)
                        if cpt_ids.iter().any(|cpt_id| !known_cpts.contains(cpt_id)) =>
                    {
                        let unknown = cpt_ids
                            .iter()
                            .filter(|cpt_id| !known_cpts.contains(cpt_id))
                            .copied()
                            .collect::<Vec<_>>();
                        diagnostics.push(row_diagnostic(
                            &row,
                            PilePlanImportDiagnosticCode::UnknownCpt,
                            format!(
                                "Unknown CPT identifiers: {}. The CPT selection is preserved.",
                                unknown
                                    .iter()
                                    .map(u32::to_string)
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ),
                        ));
                        PilePlanImportedValue::Preserve
                    }
                    value => value.clone(),
                }
            } else {
                PilePlanImportedValue::Preserve
            };

        candidates.push((
            PilePlanImportChange {
                load_point_id: load_point.id,
                pile,
                manual_cpt_ids,
            },
            row,
            used_fallback,
        ));
    }

    let mut candidates_by_target = HashMap::<u32, Vec<_>>::new();
    for candidate in candidates {
        candidates_by_target
            .entry(candidate.0.load_point_id)
            .or_default()
            .push(candidate);
    }
    let mut changes = Vec::new();
    for (load_point_id, mut target_candidates) in candidates_by_target {
        if target_candidates.len() > 1 && parsed.profile == PilePlanImportProfile::Legacy {
            let exact_match_count = target_candidates
                .iter()
                .filter(|candidate| !candidate.2)
                .count();
            let equivalent = target_candidates
                .windows(2)
                .all(|pair| pair[0].1.pile == pair[1].1.pile);
            let winner_index = if exact_match_count == 1 {
                target_candidates.iter().position(|candidate| !candidate.2)
            } else if equivalent {
                Some(0)
            } else {
                None
            };

            if let Some(winner_index) = winner_index {
                let winner = target_candidates.swap_remove(winner_index);
                for (_, row, _) in target_candidates {
                    matching.links.retain(|link| link.new_id != row.row as u32);
                    matching.added.push(row.row as u32);
                    summary.skipped_rows += 1;
                    diagnostics.push(row_diagnostic(
                        &row,
                        PilePlanImportDiagnosticCode::SupersededLegacyRow,
                        format!(
                            "This historical or duplicate Legacy row was ignored in favour of the selected row for load point {load_point_id}."
                        ),
                    ));
                }
                summary.matched_rows += 1;
                summary.coordinate_fallbacks += usize::from(winner.2);
                changes.push(winner.0);
                continue;
            }
        }

        if target_candidates.len() > 1 {
            for (_, row, _) in target_candidates {
                matching.links.retain(|link| link.new_id != row.row as u32);
                matching.unmatched_new.push(row.row as u32);
                summary.skipped_rows += 1;
                summary.conflicts += 1;
                diagnostics.push(row_diagnostic(
                    &row,
                    PilePlanImportDiagnosticCode::ConflictingRows,
                    format!("Multiple source rows resolve to load point {load_point_id}."),
                ));
            }
            continue;
        }

        let (change, _, used_fallback) = target_candidates
            .pop()
            .expect("grouped target candidates are non-empty");
        summary.matched_rows += 1;
        summary.coordinate_fallbacks += usize::from(used_fallback);
        changes.push(change);
    }
    changes.sort_by_key(|change| change.load_point_id);
    matching.added.sort_unstable();
    matching.added.dedup();
    matching.unmatched_new.sort_unstable();
    matching.unmatched_new.dedup();
    matching.complete = matching.unmatched_new.is_empty();

    let has_actionable_change = changes.iter().any(|change| {
        !matches!(change.pile, PilePlanImportedValue::Preserve)
            || !matches!(change.manual_cpt_ids, PilePlanImportedValue::Preserve)
    });
    let category_enabled = request.options.import_pile_assignments
        || (request.options.import_cpt_selections && parsed.supports_cpt_selections);

    PilePlanImportPreview {
        table: None,
        source_locations,
        matching: Some(matching),
        supports_pile_assignments: true,
        requested_profile: request.profile,
        detected_profile: Some(parsed.profile),
        supports_cpt_selections: parsed.supports_cpt_selections,
        can_apply: category_enabled && has_actionable_change,
        summary,
        diagnostics,
        patch: PilePlanImportPatch { changes },
    }
}

fn failed_preview(
    requested_profile: PilePlanImportProfile,
    diagnostic: PilePlanImportDiagnostic,
) -> PilePlanImportPreview {
    PilePlanImportPreview {
        table: None,
        source_locations: vec![],
        matching: None,
        supports_pile_assignments: false,
        requested_profile,
        detected_profile: None,
        supports_cpt_selections: false,
        can_apply: false,
        summary: PilePlanImportSummary::default(),
        diagnostics: vec![diagnostic],
        patch: PilePlanImportPatch::default(),
    }
}

fn coordinate_distance(x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    (x1 - x2).hypot(y1 - y2)
}

fn row_diagnostic(
    row: &ParsedPilePlanRow,
    code: PilePlanImportDiagnosticCode,
    message: String,
) -> PilePlanImportDiagnostic {
    PilePlanImportDiagnostic {
        severity: PilePlanImportDiagnosticSeverity::Warning,
        code,
        message,
        location: Some(PilePlanImportDiagnosticLocation {
            sheet_name: row.sheet_name.clone(),
            row: Some(row.row),
            column: None,
        }),
    }
}

#[cfg(test)]
fn parse_pile_plan_source(
    file_name: &str,
    format: SourceFormat,
    bytes: &[u8],
    profile: PilePlanImportProfile,
) -> Result<ParsedPilePlanSource, PilePlanImportDiagnostic> {
    let request = PilePlanImportRequest {
        file_name: file_name.into(),
        format,
        bytes: bytes.to_vec(),
        profile,
        options: Default::default(),
        load_points: vec![],
        cpts: vec![],
        available_pile_configurations: vec![],
    };
    let (table, preview, resolved) = source::inspect(&request)?;
    source::parse(&table, &preview.settings, resolved, &request.options)
}

fn parse_cpt_ids(value: &str) -> Result<Vec<u32>, String> {
    let mut ids = value
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            part.parse::<u32>()
                .map_err(|_| format!("Invalid CPT ID '{part}'."))
        })
        .collect::<Result<Vec<_>, _>>()?;
    ids.sort_unstable();
    ids.dedup();
    Ok(ids)
}

fn cell(
    table: &SourceTable,
    row_number: usize,
    column: usize,
) -> Result<&TableCell, PilePlanImportDiagnostic> {
    table
        .rows
        .iter()
        .find(|row| row.number == row_number)
        .and_then(|row| row.cells.get(column))
        .ok_or_else(|| {
            invalid_cell(
                table,
                row_number,
                column,
                "Required cell is missing.".to_string(),
            )
        })
}

fn parse_legacy_load_point_id_cell(
    table: &SourceTable,
    row: usize,
    column: usize,
) -> Result<u32, PilePlanImportDiagnostic> {
    let value = cell(table, row, column)?;
    if let Ok(id) = parse_u32(value) {
        return Ok(id);
    }

    let text = value.as_text();
    let mut parts = text.split_whitespace();
    let prefix = parts.next();
    let id = parts.next();
    if prefix.is_some_and(|part| part.eq_ignore_ascii_case("Knoop")) && parts.next().is_none() {
        if let Some(id) = id.and_then(|part| part.parse::<u32>().ok()) {
            return Ok(id);
        }
    }

    Err(invalid_cell(
        table,
        row,
        column,
        format!("Invalid legacy load point ID '{text}'. Expected a number or 'Knoop <number>'."),
    ))
}

#[cfg(test)]
fn parse_f64_cell(
    table: &SourceTable,
    row: usize,
    column: usize,
) -> Result<f64, PilePlanImportDiagnostic> {
    let value = cell(table, row, column)?;
    parse_f64(value).map_err(|message| invalid_cell(table, row, column, message))
}

fn parse_u32(value: &TableCell) -> Result<u32, String> {
    let text = value.as_text();
    parse_nonnegative_u32(&text).map_err(|error| match error {
        NumericParseError::InvalidNumber => format!("Invalid number '{text}'."),
        NumericParseError::NonFinite => format!("Invalid finite number '{text}'."),
        NumericParseError::NonInteger | NumericParseError::OutOfRange => {
            format!("Invalid positive integer '{text}'.")
        }
    })
}

fn parse_positive_u32(value: &TableCell) -> Result<u32, String> {
    let number = parse_u32(value)?;
    if number == 0 {
        return Err("Pile size must be greater than zero.".to_string());
    }
    Ok(number)
}

fn parse_standard_pile_size(value: &TableCell) -> Result<u32, String> {
    let text = value.as_text();
    if !text.contains(['x', 'X', '×']) {
        return parse_positive_u32(value);
    }
    let dimensions = text.split(['x', 'X', '×']).collect::<Vec<_>>();
    if dimensions.len() != 2 {
        return Err(format!("Invalid square pile dimensions '{text}'."));
    }
    let width = parse_positive_u32(&TableCell::Text(dimensions[0].trim().to_string()))?;
    let height = parse_positive_u32(&TableCell::Text(dimensions[1].trim().to_string()))?;
    if width != height {
        return Err(format!("Square pile dimensions must be equal: '{text}'."));
    }
    Ok(width)
}

fn parse_f64(value: &TableCell) -> Result<f64, String> {
    let text = value.as_text();
    parse_finite_number(&text).map_err(|error| {
        if error == NumericParseError::NonFinite {
            format!("Invalid finite number '{text}'.")
        } else {
            format!("Invalid number '{text}'.")
        }
    })
}

fn location(
    table: &SourceTable,
    row: usize,
    column: Option<usize>,
) -> PilePlanImportDiagnosticLocation {
    PilePlanImportDiagnosticLocation {
        sheet_name: table.sheet_name.clone(),
        row: Some(row),
        column: column.map(|index| index + 1),
    }
}

fn fatal_source(message: String) -> PilePlanImportDiagnostic {
    PilePlanImportDiagnostic {
        severity: PilePlanImportDiagnosticSeverity::Error,
        code: PilePlanImportDiagnosticCode::InvalidSource,
        message,
        location: None,
    }
}

fn mapping_error(message: &str) -> PilePlanImportDiagnostic {
    let mut error = profile_error(message);
    error.code = PilePlanImportDiagnosticCode::InvalidColumnMapping;
    error
}

fn profile_error(message: &str) -> PilePlanImportDiagnostic {
    PilePlanImportDiagnostic {
        severity: PilePlanImportDiagnosticSeverity::Error,
        code: PilePlanImportDiagnosticCode::UnknownProfile,
        message: message.to_string(),
        location: None,
    }
}

fn invalid_cell(
    table: &SourceTable,
    row: usize,
    column: usize,
    message: String,
) -> PilePlanImportDiagnostic {
    PilePlanImportDiagnostic {
        severity: PilePlanImportDiagnosticSeverity::Error,
        code: PilePlanImportDiagnosticCode::InvalidRow,
        message,
        location: Some(location(table, row, Some(column))),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rust_xlsxwriter::Workbook;

    use super::*;

    #[test]
    fn machine_readable_requirements_example_parses_as_standard_table() {
        let requirements = pile_plan_import_requirements();
        assert_eq!(requirements["version"], 1);
        assert_eq!(requirements["profile"], "standard-table");
        let example = requirements["example"].as_str().expect("CSV example");
        let parsed = parse_pile_plan_source(
            "example.csv",
            SourceFormat::Csv,
            example.as_bytes(),
            PilePlanImportProfile::StandardTable,
        )
        .expect("requirements example must parse");
        assert_eq!(parsed.source_rows, 1);
    }

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

    #[test]
    fn parses_standard_csv_export_by_header() {
        let bytes = b"Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n3,1000,1500,80,,,\n20,2000,3000,120,320,-18.5,\"2, 11\"\n";

        let parsed = parse_pile_plan_source(
            "plan.csv",
            SourceFormat::Csv,
            bytes,
            PilePlanImportProfile::Automatic,
        )
        .expect("standard source");

        assert_eq!(parsed.profile, PilePlanImportProfile::StandardTable);
        assert!(parsed.supports_cpt_selections);
        assert_eq!(parsed.rows.len(), 2);
        assert_eq!(parsed.rows[0].source_id, Some(3));
        assert_eq!(parsed.rows[0].pile, PilePlanImportedValue::Clear);
        assert_eq!(parsed.rows[0].manual_cpt_ids, PilePlanImportedValue::Clear);
        assert_eq!(
            parsed.rows[1].pile,
            PilePlanImportedValue::Set(PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_500,
            })
        );
        assert_eq!(
            parsed.rows[1].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![2, 11])
        );
    }

    #[test]
    fn standard_table_accepts_numeric_and_square_dimension_sizes() {
        for size in ["290", "290x290", " 290 X 290 ", "290 × 290"] {
            let csv = format!("Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n1,1000,1500,80,{size},-18.5,\n");
            let parsed = parse_pile_plan_source(
                "plan.csv",
                SourceFormat::Csv,
                csv.as_bytes(),
                PilePlanImportProfile::Automatic,
            )
            .unwrap_or_else(|error| panic!("{size}: {error:?}"));
            assert_eq!(
                parsed.rows[0].pile,
                PilePlanImportedValue::Set(PileConfigurationKey {
                    pile_size_mm: 290,
                    pile_tip_level_mm: -18_500,
                })
            );
        }
    }

    #[test]
    fn standard_table_rejects_invalid_dimensions_with_cell_location() {
        for size in [
            "290x320",
            "290x290x290",
            "0x0",
            "-290x-290",
            "290.5x290.5",
            "4294967296x4294967296",
            "x290",
            "290x",
            "NaNxNaN",
        ] {
            let csv = format!("Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n1,1000,1500,80,{size},-18.5,\n");
            let error = parse_pile_plan_source(
                "plan.csv",
                SourceFormat::Csv,
                csv.as_bytes(),
                PilePlanImportProfile::Automatic,
            )
            .expect_err(size);
            assert_eq!(
                error.code,
                PilePlanImportDiagnosticCode::InvalidRow,
                "{size}"
            );
            let location = error.location.unwrap();
            assert_eq!(location.row, Some(2));
            assert_eq!(location.column, Some(5));
        }
    }

    #[test]
    fn both_export_notations_round_trip_through_csv_and_xlsx() {
        let square = PileConfigurationKey {
            pile_size_mm: 290,
            pile_tip_level_mm: -18_500,
        };
        let round = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -19_000,
        };
        for notation in [
            crate::PileSizeExportFormat::Numeric,
            crate::PileSizeExportFormat::Dimensions,
        ] {
            let input = crate::PilePlanExportRequest {
                project_context: None,
                load_points: vec![
                    load_point(1, 1000.0, 1500.0),
                    load_point(2, 2000.0, 2500.0),
                    load_point(3, 3000.0, 3500.0),
                ],
                selected_piles: HashMap::from([(1, square.clone()), (2, round.clone())]),
                selected_cpts: HashMap::from([(1, vec![11, 2])]),
                pile_shapes: HashMap::from([
                    (290, crate::PileCostShape::Square),
                    (320, crate::PileCostShape::Round),
                ]),
                pile_size_format: notation,
            };
            for (name, format, bytes) in [
                (
                    "plan.csv",
                    SourceFormat::Csv,
                    crate::write_pile_plan_csv(&input).unwrap(),
                ),
                (
                    "plan.xlsx",
                    SourceFormat::Xlsx,
                    crate::write_pile_plan_xlsx(&input).unwrap(),
                ),
            ] {
                let parsed =
                    parse_pile_plan_source(name, format, &bytes, PilePlanImportProfile::Automatic)
                        .expect(name);
                assert_eq!(parsed.rows.len(), 3);
                assert_eq!(
                    parsed.rows[0].pile,
                    PilePlanImportedValue::Set(square.clone())
                );
                assert_eq!(
                    parsed.rows[1].pile,
                    PilePlanImportedValue::Set(round.clone())
                );
                assert_eq!(parsed.rows[2].pile, PilePlanImportedValue::Clear);
                assert_eq!(
                    parsed.rows[0].manual_cpt_ids,
                    PilePlanImportedValue::Set(vec![2, 11])
                );
                assert_eq!(parsed.rows[2].manual_cpt_ids, PilePlanImportedValue::Clear);
                assert_eq!(
                    (parsed.rows[0].x_mm, parsed.rows[0].y_mm),
                    (Some(1000.0), Some(1500.0))
                );
            }
        }
    }

    #[test]
    fn parses_standard_xlsx_created_by_the_exporter() {
        let pile = PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18_500,
        };
        let bytes = crate::write_pile_plan_xlsx(&crate::PilePlanExportRequest {
            project_context: None,
            load_points: vec![load_point(7, 1000.0, 1500.0)],
            selected_piles: HashMap::from([(7, pile.clone())]),
            selected_cpts: HashMap::from([(7, vec![61, 64])]),
            pile_shapes: HashMap::new(),
            pile_size_format: Default::default(),
        })
        .expect("export workbook");

        let parsed = parse_pile_plan_source(
            "plan.xlsx",
            SourceFormat::Xlsx,
            &bytes,
            PilePlanImportProfile::Automatic,
        )
        .expect("standard workbook");

        assert_eq!(parsed.profile, PilePlanImportProfile::StandardTable);
        assert_eq!(parsed.rows[0].pile, PilePlanImportedValue::Set(pile));
        assert_eq!(
            parsed.rows[0].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![61, 64])
        );
    }

    #[test]
    fn standard_table_columns_are_found_by_name() {
        let bytes = b"Selected CPTs,Pile Tip Level [m],Load Point ID,Pile Size [mm],Y [mm],FEd [kN],X [mm]\n61,-18,15,290,4700,79,9450\n";

        let parsed = parse_pile_plan_source(
            "reordered.csv",
            SourceFormat::Csv,
            bytes,
            PilePlanImportProfile::StandardTable,
        )
        .expect("reordered standard source");

        assert_eq!(parsed.rows[0].source_id, Some(15));
        assert_eq!(parsed.rows[0].x_mm, Some(9450.0));
        assert_eq!(
            parsed.rows[0].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![61])
        );
    }

    #[test]
    fn detects_legacy_workbook_and_skips_multiple_piles() {
        let bytes = legacy_workbook(&[
            [15.0, 1.0, -18.5, 320.0, 0.72, 9450.0, 4700.0],
            [16.0, 2.0, -19.0, 350.0, 0.81, 10450.0, 4700.0],
        ]);

        let parsed = parse_pile_plan_source(
            "Vergrendeld.xlsx",
            SourceFormat::Xlsx,
            &bytes,
            PilePlanImportProfile::Automatic,
        )
        .expect("legacy source");

        assert_eq!(parsed.profile, PilePlanImportProfile::Legacy);
        assert!(!parsed.supports_cpt_selections);
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].source_id, Some(15));
        assert_eq!(
            parsed.rows[0].manual_cpt_ids,
            PilePlanImportedValue::Preserve
        );
        assert!(parsed.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PilePlanImportDiagnosticCode::UnsupportedPileCount
        }));
    }

    #[test]
    fn accepts_legacy_rfem_node_names_as_load_point_ids() {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("Vergrendeld").unwrap();
        worksheet.write_string(0, 0, "Knoop 1603").unwrap();
        for (column, value) in [1.0, -21.5, 320.0, 0.85, -22350.0, 102400.0]
            .into_iter()
            .enumerate()
        {
            worksheet
                .write_number(0, (column + 1) as u16, value)
                .unwrap();
        }

        let parsed = parse_pile_plan_source(
            "Vergrendeld.xlsx",
            SourceFormat::Xlsx,
            &workbook.save_to_buffer().unwrap(),
            PilePlanImportProfile::Automatic,
        )
        .expect("legacy RFEM node source");

        assert_eq!(parsed.profile, PilePlanImportProfile::Legacy);
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].source_id, Some(1603));
    }

    #[test]
    fn matches_id_only_when_coordinates_agree() {
        let preview = preview_for(
            "15,9450,4700,79,320,-18.5,61",
            vec![load_point(15, 9450.0, 4700.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(preview.can_apply);
        assert_eq!(preview.summary.matched_rows, 1);
        assert_eq!(preview.summary.coordinate_fallbacks, 0);
        assert_eq!(preview.patch.changes[0].load_point_id, 15);
    }

    #[test]
    fn falls_back_to_coordinates_at_the_tolerance_boundary() {
        let preview = preview_for(
            "999,1000.6,1000.8,80,320,-18.5,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(preview.can_apply);
        assert_eq!(preview.patch.changes[0].load_point_id, 7);
        assert_eq!(preview.summary.coordinate_fallbacks, 1);
    }

    #[test]
    fn skips_ambiguous_coordinate_matches() {
        let preview = preview_for(
            "999,1000,1000,80,320,-18.5,61",
            vec![load_point(7, 999.5, 1000.0), load_point(8, 1000.5, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(!preview.can_apply);
        assert!(preview.patch.changes.is_empty());
        assert!(preview.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PilePlanImportDiagnosticCode::AmbiguousLoadPoint
        }));
    }

    #[test]
    fn conflicting_rows_do_not_change_the_same_load_point() {
        let preview = preview_for_rows(
            &["7,1000,1000,80,320,-18.5,61", "999,1000,1000,80,350,-19,61"],
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(!preview.can_apply);
        assert!(preview.patch.changes.is_empty());
        assert_eq!(preview.summary.conflicts, 2);
        assert!(!preview.matching.as_ref().unwrap().complete);
        assert!(preview.matching.as_ref().unwrap().links.is_empty());
    }

    #[test]
    fn legacy_exact_id_match_wins_over_historical_coordinate_match() {
        let preview = preview_legacy(
            &[
                ("Knoop 202", 1, -17.75, 290, 15000.0, 44100.0),
                ("Knoop 83", 1, -18.0, 320, 15000.0, 44100.0),
            ],
            vec![load_point(83, 15000.0, 44100.0)],
        );

        assert!(preview.can_apply);
        assert_eq!(preview.patch.changes.len(), 1);
        assert_eq!(preview.patch.changes[0].load_point_id, 83);
        assert_eq!(
            preview.patch.changes[0].pile,
            PilePlanImportedValue::Set(PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_000,
            })
        );
        assert_eq!(preview.summary.matched_rows, 1);
        assert_eq!(preview.summary.skipped_rows, 1);
        assert_eq!(preview.summary.conflicts, 0);
    }

    #[test]
    fn legacy_identical_coordinate_fallback_rows_are_deduplicated() {
        let preview = preview_legacy(
            &[
                ("Knoop 201", 1, -18.0, 320, 12000.0, 44100.0),
                ("Knoop 72", 1, -18.0, 320, 12000.0, 44100.0),
            ],
            vec![load_point(999, 12000.0, 44100.0)],
        );

        assert!(preview.can_apply);
        assert_eq!(preview.patch.changes.len(), 1);
        assert_eq!(preview.summary.matched_rows, 1);
        assert_eq!(preview.summary.coordinate_fallbacks, 1);
        assert_eq!(preview.summary.skipped_rows, 1);
        assert_eq!(preview.summary.conflicts, 0);
        assert_eq!(preview.matching.as_ref().unwrap().links.len(), 1);
        assert_eq!(preview.matching.as_ref().unwrap().added.len(), 1);
    }

    #[test]
    fn legacy_different_coordinate_fallback_rows_remain_a_conflict() {
        let preview = preview_legacy(
            &[
                ("Knoop 201", 1, -17.75, 290, 12000.0, 44100.0),
                ("Knoop 72", 1, -18.0, 320, 12000.0, 44100.0),
            ],
            vec![load_point(999, 12000.0, 44100.0)],
        );

        assert!(!preview.can_apply);
        assert!(preview.patch.changes.is_empty());
        assert_eq!(preview.summary.conflicts, 2);
    }

    #[test]
    fn unknown_cpt_skips_only_the_cpt_change() {
        let preview = preview_for(
            "7,1000,1000,80,320,-18.5,999",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(preview.can_apply);
        assert!(matches!(
            preview.patch.changes[0].pile,
            PilePlanImportedValue::Set(_)
        ));
        assert_eq!(
            preview.patch.changes[0].manual_cpt_ids,
            PilePlanImportedValue::Preserve
        );
        assert!(preview
            .diagnostics
            .iter()
            .any(|diagnostic| { diagnostic.code == PilePlanImportDiagnosticCode::UnknownCpt }));
    }

    #[test]
    fn unknown_pile_configuration_skips_only_the_pile_change() {
        let preview = preview_for(
            "7,1000,1000,80,350,-19,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert_eq!(
            preview.patch.changes[0].pile,
            PilePlanImportedValue::Preserve
        );
        assert_eq!(
            preview.patch.changes[0].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![61])
        );
        assert!(preview.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PilePlanImportDiagnosticCode::UnknownPileConfiguration
        }));
    }

    #[test]
    fn rejects_zero_pile_size_in_standard_table() {
        let preview = preview_for(
            "7,1000,1000,80,0,-18.5,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(!preview.can_apply);
        assert_eq!(
            preview.diagnostics[0].code,
            PilePlanImportDiagnosticCode::InvalidRow
        );
    }

    #[test]
    fn category_options_preserve_disabled_project_values() {
        let mut options = PilePlanImportOptions::default();
        options.import_pile_assignments = false;
        let preview = preview_for(
            "7,1000,1000,80,320,-18.5,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            options,
        );

        assert_eq!(
            preview.patch.changes[0].pile,
            PilePlanImportedValue::Preserve
        );
        assert_eq!(
            preview.patch.changes[0].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![61])
        );
    }

    #[test]
    fn unmatched_rows_are_reported_without_a_patch_change() {
        let preview = preview_for(
            "999,5000,5000,80,320,-18.5,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            PilePlanImportOptions::default(),
        );

        assert!(!preview.can_apply);
        assert_eq!(preview.summary.skipped_rows, 1);
        assert!(preview.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PilePlanImportDiagnosticCode::UnmatchedLoadPoint
        }));
    }

    #[test]
    fn rejects_negative_coordinate_tolerance_without_parsing() {
        let mut options = PilePlanImportOptions::default();
        options.coordinate_tolerance_mm = -1.0;
        let preview = preview_for(
            "7,1000,1000,80,320,-18.5,61",
            vec![load_point(7, 1000.0, 1000.0)],
            vec![cpt(61)],
            options,
        );

        assert!(!preview.can_apply);
        assert!(preview.patch.changes.is_empty());
        assert_eq!(
            preview.diagnostics[0].code,
            PilePlanImportDiagnosticCode::InvalidTolerance
        );
    }

    fn preview_for(
        row: &str,
        load_points: Vec<ProjectLoadPoint>,
        cpts: Vec<ProjectCpt>,
        options: PilePlanImportOptions,
    ) -> PilePlanImportPreview {
        preview_for_rows(&[row], load_points, cpts, options)
    }

    fn preview_for_rows(
        rows: &[&str],
        load_points: Vec<ProjectLoadPoint>,
        cpts: Vec<ProjectCpt>,
        options: PilePlanImportOptions,
    ) -> PilePlanImportPreview {
        let mut csv = "Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs\n".to_string();
        csv.push_str(&rows.join("\n"));
        preview_pile_plan_import(&PilePlanImportRequest {
            file_name: "plan.csv".to_string(),
            format: SourceFormat::Csv,
            bytes: csv.into_bytes(),
            profile: PilePlanImportProfile::Automatic,
            options,
            load_points,
            cpts,
            available_pile_configurations: vec![PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18_500,
            }],
        })
    }

    fn load_point(id: u32, x_mm: f64, y_mm: f64) -> ProjectLoadPoint {
        ProjectLoadPoint {
            id,
            name: format!("Load point {id}"),
            x_mm,
            y_mm,
            design_load_kn: 80.0,
            tension: Default::default(),
        }
    }

    fn cpt(id: u32) -> ProjectCpt {
        ProjectCpt {
            id,
            name: format!("CPT {id}"),
            x_mm: 0.0,
            y_mm: 0.0,
        }
    }

    fn legacy_workbook(rows: &[[f64; 7]]) -> Vec<u8> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("Vergrendeld").unwrap();
        for (row_index, values) in rows.iter().enumerate() {
            for (column_index, value) in values.iter().enumerate() {
                worksheet
                    .write_number(row_index as u32, column_index as u16, *value)
                    .unwrap();
            }
        }
        workbook.save_to_buffer().unwrap()
    }

    fn preview_legacy(
        rows: &[(&str, u32, f64, u32, f64, f64)],
        load_points: Vec<ProjectLoadPoint>,
    ) -> PilePlanImportPreview {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("Vergrendeld").unwrap();
        for (row_index, (name, count, tip, size, x, y)) in rows.iter().enumerate() {
            let row = row_index as u32;
            worksheet.write_string(row, 0, *name).unwrap();
            worksheet.write_number(row, 1, *count).unwrap();
            worksheet.write_number(row, 2, *tip).unwrap();
            worksheet.write_number(row, 3, *size).unwrap();
            worksheet.write_number(row, 4, 0.8).unwrap();
            worksheet.write_number(row, 5, *x).unwrap();
            worksheet.write_number(row, 6, *y).unwrap();
        }

        preview_pile_plan_import(&PilePlanImportRequest {
            file_name: "Vergrendeld.xlsx".to_string(),
            format: SourceFormat::Xlsx,
            bytes: workbook.save_to_buffer().unwrap(),
            profile: PilePlanImportProfile::Automatic,
            options: PilePlanImportOptions {
                import_cpt_selections: false,
                ..PilePlanImportOptions::default()
            },
            load_points,
            cpts: Vec::new(),
            available_pile_configurations: vec![
                PileConfigurationKey {
                    pile_size_mm: 290,
                    pile_tip_level_mm: -17_750,
                },
                PileConfigurationKey {
                    pile_size_mm: 320,
                    pile_tip_level_mm: -18_000,
                },
            ],
        })
    }
}

#[cfg(test)]
mod numeric_characterization_tests {
    use super::*;

    #[test]
    fn pile_plan_numbers_preserve_values_and_diagnostics() {
        for (text, integer, error_prefix) in [
            ("0", Some(0), None),
            ("-0", Some(0), None),
            ("42", Some(42), None),
            ("1e3", Some(1000), None),
            ("1.5", None, None),
            ("-1", None, None),
            ("4294967295", Some(u32::MAX), None),
            ("4294967296", None, None),
            ("1.0000000000000002", Some(1), None),
            ("1.0000000000000004", None, None),
            ("", None, Some("Invalid number")),
            ("abc", None, Some("Invalid number")),
            (" 42 ", None, Some("Invalid number")),
            ("NaN", None, Some("Invalid finite number")),
            ("inf", None, Some("Invalid finite number")),
            ("-inf", None, Some("Invalid finite number")),
        ] {
            let cell = TableCell::Text(text.into());
            let number_error = error_prefix.map(|prefix| format!("{prefix} '{text}'."));
            match parse_u32(&cell) {
                Ok(value) => assert_eq!(Some(value), integer, "{text}"),
                Err(message) => {
                    assert_eq!(integer, None, "{text}");
                    assert_eq!(
                        message,
                        number_error
                            .clone()
                            .unwrap_or_else(|| format!("Invalid positive integer '{text}'."))
                    );
                }
            }
            let table = SourceTable {
                formula_cells: Default::default(),
                file_name: "numbers.csv".into(),
                sheet_name: Some("Sheet1".into()),
                rows: vec![crate::import::SourceRow {
                    number: 7,
                    cells: vec![cell],
                }],
            };
            match parse_f64_cell(&table, 7, 0) {
                Ok(value) => {
                    assert!(number_error.is_none());
                    assert_eq!(value.to_bits(), text.parse::<f64>().unwrap().to_bits());
                }
                Err(error) => {
                    assert_eq!(error.code, PilePlanImportDiagnosticCode::InvalidRow);
                    assert_eq!(error.severity, PilePlanImportDiagnosticSeverity::Error);
                    assert_eq!(error.message, number_error.unwrap());
                    assert_eq!(error.location, Some(location(&table, 7, Some(0))));
                }
            }
        }
    }
}
