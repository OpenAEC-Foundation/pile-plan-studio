use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    rows: Vec<ParsedPilePlanRow>,
    diagnostics: Vec<PilePlanImportDiagnostic>,
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
