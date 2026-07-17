use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::{
    import::read_source_table, import::read_xlsx_tables, import::SourceTable, import::TableCell,
    PileConfigurationKey, ProjectCpt, ProjectLoadPoint, SourceFormat,
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

#[derive(Clone, Debug, PartialEq)]
struct ParsedPilePlanRow {
    source_id: u32,
    x_mm: f64,
    y_mm: f64,
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

pub fn preview_pile_plan_import(request: &PilePlanImportRequest) -> PilePlanImportPreview {
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

    let parsed = match parse_pile_plan_source(
        &request.file_name,
        request.format,
        &request.bytes,
        request.profile,
    ) {
        Ok(parsed) => parsed,
        Err(diagnostic) => return failed_preview(request.profile, diagnostic),
    };

    let load_points_by_id: HashMap<u32, &ProjectLoadPoint> = request
        .load_points
        .iter()
        .map(|load_point| (load_point.id, load_point))
        .collect();
    let known_cpts: HashSet<u32> = request.cpts.iter().map(|cpt| cpt.id).collect();
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
        let id_match = load_points_by_id
            .get(&row.source_id)
            .copied()
            .filter(|load_point| {
                coordinate_distance(load_point.x_mm, load_point.y_mm, row.x_mm, row.y_mm)
                    <= request.options.coordinate_tolerance_mm
            });
        let (load_point, used_fallback) = if let Some(load_point) = id_match {
            (load_point, false)
        } else {
            let coordinate_matches: Vec<_> = request
                .load_points
                .iter()
                .filter(|load_point| {
                    coordinate_distance(load_point.x_mm, load_point.y_mm, row.x_mm, row.y_mm)
                        <= request.options.coordinate_tolerance_mm
                })
                .collect();
            match coordinate_matches.as_slice() {
                [load_point] => (*load_point, true),
                [] => {
                    summary.skipped_rows += 1;
                    diagnostics.push(row_diagnostic(
                        &row,
                        PilePlanImportDiagnosticCode::UnmatchedLoadPoint,
                        format!(
                            "Load point {} could not be matched by ID and coordinates.",
                            row.source_id
                        ),
                    ));
                    continue;
                }
                _ => {
                    summary.skipped_rows += 1;
                    diagnostics.push(row_diagnostic(
                        &row,
                        PilePlanImportDiagnosticCode::AmbiguousLoadPoint,
                        format!(
                            "Load point {} matches multiple project locations within the coordinate tolerance.",
                            row.source_id
                        ),
                    ));
                    continue;
                }
            }
        };

        let pile = if request.options.import_pile_assignments {
            row.pile.clone()
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

    let target_counts = candidates
        .iter()
        .fold(HashMap::new(), |mut counts, candidate| {
            *counts.entry(candidate.0.load_point_id).or_insert(0_usize) += 1;
            counts
        });
    let mut changes = Vec::new();
    for (change, row, used_fallback) in candidates {
        if target_counts
            .get(&change.load_point_id)
            .copied()
            .unwrap_or(0)
            > 1
        {
            summary.skipped_rows += 1;
            summary.conflicts += 1;
            diagnostics.push(row_diagnostic(
                &row,
                PilePlanImportDiagnosticCode::ConflictingRows,
                format!(
                    "Multiple source rows resolve to load point {}.",
                    change.load_point_id
                ),
            ));
            continue;
        }
        summary.matched_rows += 1;
        summary.coordinate_fallbacks += usize::from(used_fallback);
        changes.push(change);
    }
    changes.sort_by_key(|change| change.load_point_id);

    let has_actionable_change = changes.iter().any(|change| {
        !matches!(change.pile, PilePlanImportedValue::Preserve)
            || !matches!(change.manual_cpt_ids, PilePlanImportedValue::Preserve)
    });
    let category_enabled = request.options.import_pile_assignments
        || (request.options.import_cpt_selections && parsed.supports_cpt_selections);

    PilePlanImportPreview {
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

fn parse_pile_plan_source(
    file_name: &str,
    format: SourceFormat,
    bytes: &[u8],
    requested_profile: PilePlanImportProfile,
) -> Result<ParsedPilePlanSource, PilePlanImportDiagnostic> {
    let tables = match format {
        SourceFormat::Csv => vec![read_source_table(file_name, format, bytes)
            .map_err(|error| fatal_source(error.to_string()))?],
        SourceFormat::Xlsx => {
            read_xlsx_tables(file_name, bytes).map_err(|error| fatal_source(error.to_string()))?
        }
    };

    let standard_table = tables
        .iter()
        .find(|table| standard_columns(table).is_some());
    let legacy_table = tables.iter().find(|table| {
        table
            .sheet_name
            .as_deref()
            .is_some_and(|name| name.eq_ignore_ascii_case("Vergrendeld"))
    });

    let profile = match requested_profile {
        PilePlanImportProfile::StandardTable if standard_table.is_some() => {
            PilePlanImportProfile::StandardTable
        }
        PilePlanImportProfile::Legacy if format == SourceFormat::Xlsx && legacy_table.is_some() => {
            PilePlanImportProfile::Legacy
        }
        PilePlanImportProfile::Automatic => {
            match (standard_table, legacy_table) {
                (Some(_), None) => PilePlanImportProfile::StandardTable,
                (None, Some(_)) if format == SourceFormat::Xlsx => PilePlanImportProfile::Legacy,
                (Some(_), Some(_)) => return Err(profile_error(
                    "The file matches both Standard table and Legacy profiles; choose one profile.",
                )),
                _ => {
                    return Err(profile_error(
                        "The pile plan import profile could not be detected.",
                    ))
                }
            }
        }
        PilePlanImportProfile::Legacy => {
            return Err(profile_error(
                "The Legacy profile requires an XLSX workbook with a Vergrendeld worksheet.",
            ))
        }
        PilePlanImportProfile::StandardTable => {
            return Err(profile_error(
                "The Standard table profile requires the Pile Plan Studio export headers.",
            ))
        }
    };

    match profile {
        PilePlanImportProfile::StandardTable => {
            parse_standard_table(standard_table.expect("profile checked"))
        }
        PilePlanImportProfile::Legacy => parse_legacy_table(legacy_table.expect("profile checked")),
        PilePlanImportProfile::Automatic => unreachable!("automatic profile must resolve"),
    }
}

#[derive(Clone, Copy)]
struct StandardColumns {
    id: usize,
    x: usize,
    y: usize,
    pile_size: usize,
    pile_tip: usize,
    selected_cpts: usize,
}

fn standard_columns(table: &SourceTable) -> Option<StandardColumns> {
    let header = table.rows.first()?;
    let columns: HashMap<String, usize> = header
        .cells
        .iter()
        .enumerate()
        .map(|(index, cell)| (normalize_header(&cell.as_text()), index))
        .collect();

    Some(StandardColumns {
        id: *columns.get("loadpointid")?,
        x: *columns.get("xmm")?,
        y: *columns.get("ymm")?,
        pile_size: *columns.get("pilesizemm")?,
        pile_tip: *columns.get("piletiplevelm")?,
        selected_cpts: *columns.get("selectedcpts")?,
    })
}

fn normalize_header(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn parse_standard_table(
    table: &SourceTable,
) -> Result<ParsedPilePlanSource, PilePlanImportDiagnostic> {
    let columns = standard_columns(table).ok_or_else(|| {
        profile_error("The Standard table profile requires the Pile Plan Studio export headers.")
    })?;
    let mut rows = Vec::new();
    let mut diagnostics = Vec::new();

    for source_row in table.rows.iter().skip(1) {
        let source_id = parse_u32_cell(table, source_row.number, columns.id)?;
        let x_mm = parse_f64_cell(table, source_row.number, columns.x)?;
        let y_mm = parse_f64_cell(table, source_row.number, columns.y)?;
        let size = cell(table, source_row.number, columns.pile_size)?;
        let tip = cell(table, source_row.number, columns.pile_tip)?;
        let pile = match (size.is_empty(), tip.is_empty()) {
            (true, true) => PilePlanImportedValue::Clear,
            (false, false) => PilePlanImportedValue::Set(PileConfigurationKey {
                pile_size_mm: parse_u32(size).map_err(|message| {
                    invalid_cell(table, source_row.number, columns.pile_size, message)
                })?,
                pile_tip_level_m_key: (parse_f64(tip).map_err(|message| {
                    invalid_cell(table, source_row.number, columns.pile_tip, message)
                })? * 1000.0)
                    .round() as i64,
            }),
            _ => {
                diagnostics.push(PilePlanImportDiagnostic {
                    severity: PilePlanImportDiagnosticSeverity::Warning,
                    code: PilePlanImportDiagnosticCode::InvalidRow,
                    message: "Pile size and pile tip level must both be filled or both be empty; the pile assignment is preserved.".to_string(),
                    location: Some(location(table, source_row.number, None)),
                });
                PilePlanImportedValue::Preserve
            }
        };
        let selected_cpts_cell = cell(table, source_row.number, columns.selected_cpts)?;
        let manual_cpt_ids = if selected_cpts_cell.is_empty() {
            PilePlanImportedValue::Clear
        } else {
            PilePlanImportedValue::Set(parse_cpt_ids(&selected_cpts_cell.as_text()).map_err(
                |message| invalid_cell(table, source_row.number, columns.selected_cpts, message),
            )?)
        };

        rows.push(ParsedPilePlanRow {
            source_id,
            x_mm,
            y_mm,
            pile,
            manual_cpt_ids,
            sheet_name: table.sheet_name.clone(),
            row: source_row.number,
        });
    }

    Ok(ParsedPilePlanSource {
        profile: PilePlanImportProfile::StandardTable,
        supports_cpt_selections: true,
        source_rows: table.rows.len().saturating_sub(1),
        rows,
        diagnostics,
    })
}

fn parse_legacy_table(
    table: &SourceTable,
) -> Result<ParsedPilePlanSource, PilePlanImportDiagnostic> {
    let mut rows = Vec::new();
    let mut diagnostics = Vec::new();
    for source_row in &table.rows {
        if source_row.cells.len() < 7 {
            return Err(invalid_cell(
                table,
                source_row.number,
                source_row.cells.len(),
                "Legacy rows require seven columns.".to_string(),
            ));
        }
        let pile_count = parse_u32_cell(table, source_row.number, 1)?;
        if pile_count != 1 {
            diagnostics.push(PilePlanImportDiagnostic {
                severity: PilePlanImportDiagnosticSeverity::Warning,
                code: PilePlanImportDiagnosticCode::UnsupportedPileCount,
                message: format!(
                    "Pile count {pile_count} is not supported; the current application supports one pile per load point."
                ),
                location: Some(location(table, source_row.number, Some(2))),
            });
            continue;
        }
        rows.push(ParsedPilePlanRow {
            source_id: parse_u32_cell(table, source_row.number, 0)?,
            x_mm: parse_f64_cell(table, source_row.number, 5)?,
            y_mm: parse_f64_cell(table, source_row.number, 6)?,
            pile: PilePlanImportedValue::Set(PileConfigurationKey {
                pile_size_mm: parse_u32_cell(table, source_row.number, 3)?,
                pile_tip_level_m_key: (parse_f64_cell(table, source_row.number, 2)? * 1000.0)
                    .round() as i64,
            }),
            manual_cpt_ids: PilePlanImportedValue::Preserve,
            sheet_name: table.sheet_name.clone(),
            row: source_row.number,
        });
    }
    Ok(ParsedPilePlanSource {
        profile: PilePlanImportProfile::Legacy,
        supports_cpt_selections: false,
        source_rows: table.rows.len(),
        rows,
        diagnostics,
    })
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

fn parse_u32_cell(
    table: &SourceTable,
    row: usize,
    column: usize,
) -> Result<u32, PilePlanImportDiagnostic> {
    let value = cell(table, row, column)?;
    parse_u32(value).map_err(|message| invalid_cell(table, row, column, message))
}

fn parse_f64_cell(
    table: &SourceTable,
    row: usize,
    column: usize,
) -> Result<f64, PilePlanImportDiagnostic> {
    let value = cell(table, row, column)?;
    parse_f64(value).map_err(|message| invalid_cell(table, row, column, message))
}

fn parse_u32(value: &TableCell) -> Result<u32, String> {
    let number = parse_f64(value)?;
    if number < 0.0 || number > u32::MAX as f64 || number.fract().abs() > f64::EPSILON {
        return Err(format!("Invalid positive integer '{}'.", value.as_text()));
    }
    Ok(number as u32)
}

fn parse_f64(value: &TableCell) -> Result<f64, String> {
    let text = value.as_text();
    let number = text
        .parse::<f64>()
        .map_err(|_| format!("Invalid number '{text}'."))?;
    if !number.is_finite() {
        return Err(format!("Invalid finite number '{text}'."));
    }
    Ok(number)
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
    use rust_xlsxwriter::Workbook;

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
        assert_eq!(parsed.rows[0].source_id, 3);
        assert_eq!(parsed.rows[0].pile, PilePlanImportedValue::Clear);
        assert_eq!(parsed.rows[0].manual_cpt_ids, PilePlanImportedValue::Clear);
        assert_eq!(
            parsed.rows[1].pile,
            PilePlanImportedValue::Set(PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_m_key: -18_500,
            })
        );
        assert_eq!(
            parsed.rows[1].manual_cpt_ids,
            PilePlanImportedValue::Set(vec![2, 11])
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

        assert_eq!(parsed.rows[0].source_id, 15);
        assert_eq!(parsed.rows[0].x_mm, 9450.0);
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
        assert_eq!(parsed.rows[0].source_id, 15);
        assert_eq!(
            parsed.rows[0].manual_cpt_ids,
            PilePlanImportedValue::Preserve
        );
        assert!(parsed.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == PilePlanImportDiagnosticCode::UnsupportedPileCount
        }));
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
        })
    }

    fn load_point(id: u32, x_mm: f64, y_mm: f64) -> ProjectLoadPoint {
        ProjectLoadPoint {
            id,
            name: format!("Load point {id}"),
            x_mm,
            y_mm,
            design_load_kn: 80.0,
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
}
