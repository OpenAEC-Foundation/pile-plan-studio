use std::collections::{BTreeMap, BTreeSet};

use crate::ProjectLoadPoint;

use super::{
    table::read_xlsx_tables, ImportError, ImportProfileOptions, ImportRole, ImportSource,
    SourceFormat, SourceTable, TableCell,
};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RfemSheetDetection {
    pub coordinate_candidates: Vec<String>,
    pub reaction_candidates: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AnalyzedRfemLoadPoints {
    pub load_points: Vec<ProjectLoadPoint>,
    pub coordinate_sheet: String,
    pub reaction_sheet: String,
    pub coordinate_nodes_without_reactions: Vec<u32>,
    pub reaction_nodes_without_coordinates: Vec<u32>,
    pub exact_coordinate_duplicates: Vec<u32>,
    pub exact_reaction_duplicates: Vec<u32>,
}

struct ParsedCoordinates {
    values: BTreeMap<u32, (f64, f64)>,
    exact_duplicates: Vec<u32>,
}

struct ParsedReactions {
    values: BTreeMap<u32, f64>,
    exact_duplicates: Vec<u32>,
}

pub(crate) fn analyze_rfem_load_points(
    source: &ImportSource,
) -> Result<AnalyzedRfemLoadPoints, ImportError> {
    if source.role != ImportRole::LoadPoints || source.format != SourceFormat::Xlsx {
        return Err(ImportError::Validation(
            "RFEM export profile requires an XLSX load-point source.".to_string(),
        ));
    }
    let tables = read_xlsx_tables(&source.file_name, &source.bytes)?;
    analyze_tables(&tables, &source.profile_options)
}

pub(crate) fn detect_rfem_sheets(tables: &[SourceTable]) -> RfemSheetDetection {
    RfemSheetDetection {
        coordinate_candidates: tables
            .iter()
            .filter(|table| coordinate_columns(table).is_some())
            .filter_map(sheet_name)
            .collect(),
        reaction_candidates: tables
            .iter()
            .filter(|table| reaction_columns(table).is_some())
            .filter_map(sheet_name)
            .collect(),
    }
}

pub(crate) fn analyze_tables(
    tables: &[SourceTable],
    options: &ImportProfileOptions,
) -> Result<AnalyzedRfemLoadPoints, ImportError> {
    let detection = detect_rfem_sheets(tables);
    let coordinate_sheet = resolve_sheet(
        &detection.coordinate_candidates,
        options.coordinate_sheet.as_deref(),
        "RFEM coordinate",
    )?;
    let reaction_sheet = resolve_sheet(
        &detection.reaction_candidates,
        options.reaction_sheet.as_deref(),
        "RFEM reaction",
    )?;
    let coordinate_table = table_by_name(tables, coordinate_sheet)?;
    let reaction_table = table_by_name(tables, reaction_sheet)?;
    let coordinates = parse_coordinates(coordinate_table)?;
    let reactions = parse_reactions(reaction_table)?;

    let coordinate_ids: BTreeSet<_> = coordinates.values.keys().copied().collect();
    let reaction_ids: BTreeSet<_> = reactions.values.keys().copied().collect();
    let load_points = coordinate_ids
        .intersection(&reaction_ids)
        .map(|id| {
            let (x_m, y_m) = coordinates.values[id];
            ProjectLoadPoint {
                id: *id,
                name: format!("Load point {id}"),
                x_mm: (x_m * 1000.0).round(),
                y_mm: (y_m * 1000.0).round(),
                design_load_kn: reactions.values[id].abs(),
            }
        })
        .collect();

    Ok(AnalyzedRfemLoadPoints {
        load_points,
        coordinate_sheet: coordinate_sheet.to_string(),
        reaction_sheet: reaction_sheet.to_string(),
        coordinate_nodes_without_reactions: coordinate_ids
            .difference(&reaction_ids)
            .copied()
            .collect(),
        reaction_nodes_without_coordinates: reaction_ids
            .difference(&coordinate_ids)
            .copied()
            .collect(),
        exact_coordinate_duplicates: coordinates.exact_duplicates,
        exact_reaction_duplicates: reactions.exact_duplicates,
    })
}

fn parse_coordinates(table: &SourceTable) -> Result<ParsedCoordinates, ImportError> {
    let (header_row, id_column, x_column, y_column) =
        coordinate_columns(table).ok_or_else(|| {
            ImportError::Validation(format!(
                "{} does not contain RFEM node coordinates.",
                table.file_name
            ))
        })?;
    let mut result: BTreeMap<u32, (f64, f64)> = BTreeMap::new();
    let mut exact_duplicates = BTreeSet::new();
    for row in table.rows.iter().filter(|row| row.number > header_row) {
        let Some(id) = optional_u32(row.cells.get(id_column))? else {
            continue;
        };
        if row.cells.get(x_column).is_none_or(TableCell::is_empty)
            || row.cells.get(y_column).is_none_or(TableCell::is_empty)
        {
            continue;
        }
        let x = required_f64(row.cells.get(x_column), table, row.number, x_column)?;
        let y = required_f64(row.cells.get(y_column), table, row.number, y_column)?;
        if let Some(existing) = result.get(&id) {
            if (existing.0 - x).abs() <= f64::EPSILON && (existing.1 - y).abs() <= f64::EPSILON {
                exact_duplicates.insert(id);
                continue;
            }
            return Err(ImportError::Validation(format!(
                "{} contains duplicate RFEM node {id} with conflicting coordinates.",
                table.file_name
            )));
        }
        result.insert(id, (x, y));
    }
    Ok(ParsedCoordinates {
        values: result,
        exact_duplicates: exact_duplicates.into_iter().collect(),
    })
}

fn parse_reactions(table: &SourceTable) -> Result<ParsedReactions, ImportError> {
    let (header_row, id_column, label_column, pz_column) =
        reaction_columns(table).ok_or_else(|| {
            ImportError::Validation(format!(
                "{} does not contain RFEM nodal reactions.",
                table.file_name
            ))
        })?;
    let mut result: BTreeMap<u32, f64> = BTreeMap::new();
    let mut exact_duplicates = BTreeSet::new();
    let mut current_node = None;
    for row in table.rows.iter().filter(|row| row.number > header_row) {
        if let Some(id) = optional_u32(row.cells.get(id_column))? {
            current_node = Some(id);
        }
        let label = row
            .cells
            .get(label_column)
            .map(TableCell::as_text)
            .unwrap_or_default();
        if normalize(&label) != "min pz'" {
            continue;
        }
        let id = current_node.ok_or_else(|| {
            ImportError::Validation(format!(
                "{} has a Min PZ' row without an RFEM node number.",
                table.file_name
            ))
        })?;
        let value = required_f64(row.cells.get(pz_column), table, row.number, pz_column)?;
        if let Some(existing) = result.get(&id) {
            if (*existing - value).abs() <= f64::EPSILON {
                exact_duplicates.insert(id);
                continue;
            }
            return Err(ImportError::Validation(format!(
                "{} contains duplicate Min PZ' reactions for RFEM node {id} with conflicting values.",
                table.file_name
            )));
        }
        result.insert(id, value);
    }
    Ok(ParsedReactions {
        values: result,
        exact_duplicates: exact_duplicates.into_iter().collect(),
    })
}

fn coordinate_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    table.rows.iter().take(5).find_map(|row| {
        let normalized: Vec<_> = row
            .cells
            .iter()
            .map(|cell| normalize(&cell.as_text()))
            .collect();
        let id = find_header(&normalized, &["no.", "no", "nummer"])?;
        let x = find_header(&normalized, &["x [m]", "x[m]"])?;
        let y = find_header(&normalized, &["y [m]", "y[m]"])?;
        Some((row.number, id, x, y))
    })
}

fn reaction_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    table.rows.iter().take(5).find_map(|row| {
        let normalized: Vec<_> = row
            .cells
            .iter()
            .map(|cell| normalize(&cell.as_text()))
            .collect();
        let id = find_header(&normalized, &["no.", "no", "nummer"])?;
        let pz = find_header(&normalized, &["pz'"])?;
        Some((row.number, id, id + 1, pz))
    })
}

fn find_header(values: &[String], candidates: &[&str]) -> Option<usize> {
    values
        .iter()
        .position(|value| candidates.iter().any(|candidate| value == candidate))
}

fn sheet_name(table: &SourceTable) -> Option<String> {
    table.sheet_name.clone()
}

fn resolve_sheet<'a>(
    candidates: &'a [String],
    selected: Option<&str>,
    label: &str,
) -> Result<&'a str, ImportError> {
    if let Some(selected) = selected {
        return candidates
            .iter()
            .find(|candidate| candidate.as_str() == selected)
            .map(String::as_str)
            .ok_or_else(|| {
                ImportError::Validation(format!(
                    "Selected {label} sheet was not found: {selected}."
                ))
            });
    }
    match candidates {
        [candidate] => Ok(candidate),
        [] => Err(ImportError::Validation(format!(
            "No {label} sheet was found."
        ))),
        _ => Err(ImportError::Validation(format!(
            "Multiple {label} sheets were found."
        ))),
    }
}

fn table_by_name<'a>(
    tables: &'a [SourceTable],
    sheet_name: &str,
) -> Result<&'a SourceTable, ImportError> {
    tables
        .iter()
        .find(|table| table.sheet_name.as_deref() == Some(sheet_name))
        .ok_or_else(|| ImportError::Validation(format!("Worksheet was not found: {sheet_name}.")))
}

fn optional_u32(cell: Option<&TableCell>) -> Result<Option<u32>, ImportError> {
    let Some(cell) = cell else {
        return Ok(None);
    };
    let text = cell.as_text();
    if text.trim().is_empty() {
        return Ok(None);
    }
    let value = text
        .parse::<f64>()
        .map_err(|_| ImportError::Validation(format!("Invalid RFEM node number: {text}.")))?;
    if !value.is_finite() || value < 0.0 || value.fract().abs() > f64::EPSILON {
        return Err(ImportError::Validation(format!(
            "Invalid RFEM node number: {text}."
        )));
    }
    Ok(Some(value as u32))
}

fn required_f64(
    cell: Option<&TableCell>,
    table: &SourceTable,
    row: usize,
    column: usize,
) -> Result<f64, ImportError> {
    let value = cell.map(TableCell::as_text).unwrap_or_default();
    let number = value
        .parse::<f64>()
        .map_err(|_| ImportError::InvalidValue {
            location: table.location(Some(row), Some(column + 1), None),
            value,
            expected: "a number",
        })?;
    if !number.is_finite() {
        return Err(ImportError::InvalidValue {
            location: table.location(Some(row), Some(column + 1), None),
            value: number.to_string(),
            expected: "a finite number",
        });
    }
    Ok(number)
}

fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['\u{2018}', '\u{2019}'], "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::{
        ImportProfile, ImportProfileOptions, ImportRole, ImportSource, SourceFormat, SourceRow,
        SourceTable, TableCell,
    };

    #[test]
    fn detects_rfem_coordinate_and_reaction_sheets_by_structure() {
        let detection = detect_rfem_sheets(&[
            rfem_coordinate_table("Coordinates", &[]),
            rfem_reaction_table("Reactions", &[]),
        ]);

        assert_eq!(detection.coordinate_candidates, vec!["Coordinates"]);
        assert_eq!(detection.reaction_candidates, vec!["Reactions"]);
    }

    #[test]
    fn preserves_all_reaction_candidates_for_user_selection() {
        let detection = detect_rfem_sheets(&[
            rfem_coordinate_table("Coordinates", &[]),
            rfem_reaction_table("RC1", &[]),
            rfem_reaction_table("RC2", &[]),
        ]);

        assert_eq!(detection.reaction_candidates, vec!["RC1", "RC2"]);
    }

    #[test]
    fn parses_rfem_min_pz_prime_and_joins_by_node_id() {
        let analysis = analyze_tables(
            &[
                rfem_coordinate_table("Coordinates", &[(15, 9.05, 4.70), (16, 4.00, 2.00)]),
                rfem_reaction_table("Reactions", &[(16, -157.0), (15, -79.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points[0].id, 15);
        assert_eq!(analysis.load_points[0].x_mm, 9050.0);
        assert_eq!(analysis.load_points[0].y_mm, 4700.0);
        assert_eq!(analysis.load_points[0].design_load_kn, 79.0);
        assert_eq!(analysis.load_points[1].id, 16);
    }

    #[test]
    fn warns_for_unmatched_coordinate_and_reaction_nodes() {
        let analysis = analyze_tables(
            &[
                rfem_coordinate_table("Coordinates", &[(15, 1.0, 2.0), (16, 3.0, 4.0)]),
                rfem_reaction_table("Reactions", &[(15, -10.0), (17, -20.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points.len(), 1);
        assert_eq!(analysis.coordinate_nodes_without_reactions, vec![16]);
        assert_eq!(analysis.reaction_nodes_without_coordinates, vec![17]);
    }

    #[test]
    fn deduplicates_identical_rfem_rows() {
        let analysis = analyze_tables(
            &[
                rfem_coordinate_table("Coordinates", &[(15, 1.0, 2.0), (15, 1.0, 2.0)]),
                rfem_reaction_table("Reactions", &[(15, -10.0), (15, -10.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points.len(), 1);
        assert_eq!(analysis.exact_coordinate_duplicates, vec![15]);
        assert_eq!(analysis.exact_reaction_duplicates, vec![15]);
    }

    #[test]
    fn rejects_conflicting_rfem_coordinate_duplicates() {
        let error = analyze_tables(
            &[
                rfem_coordinate_table("Coordinates", &[(15, 1.0, 2.0), (15, 2.0, 2.0)]),
                rfem_reaction_table("Reactions", &[(15, -10.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap_err();

        assert!(error.to_string().contains("duplicate RFEM node 15"));
    }

    #[test]
    fn imports_known_load_point_from_sample_rfem_export() {
        let source = ImportSource {
            role: ImportRole::LoadPoints,
            profile: ImportProfile::RfemExport,
            profile_options: ImportProfileOptions::default(),
            file_name: "Export RFEM.xlsx".to_string(),
            format: SourceFormat::Xlsx,
            bytes: include_bytes!("../../../../sample_project/Export RFEM.xlsx").to_vec(),
        };
        let analysis = analyze_rfem_load_points(&source).unwrap();
        let load_point = analysis
            .load_points
            .iter()
            .find(|load_point| load_point.id == 15)
            .unwrap();

        assert!((load_point.x_mm - 9450.0).abs() < 1e-6);
        assert!((load_point.y_mm - 4700.0).abs() < 1e-6);
        assert_eq!(load_point.design_load_kn, 79.0);
    }

    fn rfem_coordinate_table(name: &str, rows: &[(u32, f64, f64)]) -> SourceTable {
        let mut source_rows = vec![
            row(
                1,
                &[
                    "Knoop",
                    "",
                    "Referentie",
                    "Coördinaat",
                    "Knoopcoördinaten",
                    "",
                ],
            ),
            row(
                2,
                &["No.", "Knooptype", "Knoop", "Systeem", "X [m]", "Y [m]"],
            ),
        ];
        source_rows.extend(
            rows.iter()
                .enumerate()
                .map(|(index, (id, x, y))| SourceRow {
                    number: index + 3,
                    cells: vec![
                        TableCell::Number(*id as f64),
                        TableCell::Text("Standaard".to_string()),
                        TableCell::Number(0.0),
                        TableCell::Text("Carthesisch".to_string()),
                        TableCell::Number(*x),
                        TableCell::Number(*y),
                    ],
                }),
        );
        SourceTable {
            file_name: "Export RFEM.xlsx".to_string(),
            sheet_name: Some(name.to_string()),
            rows: source_rows,
        }
    }

    fn rfem_reaction_table(name: &str, rows: &[(u32, f64)]) -> SourceTable {
        let mut source_rows = vec![
            row(1, &["Knoop", "", "Reactiekrachten [kN]", "", "", ""]),
            row(2, &["No.", "", "PX'", "PY'", "PZ'", "MX'"]),
        ];
        for (id, min_pz) in rows {
            let base = source_rows.len() + 1;
            source_rows.push(SourceRow {
                number: base,
                cells: vec![
                    TableCell::Number(*id as f64),
                    TableCell::Text("Max".to_string()),
                    TableCell::Number(0.0),
                    TableCell::Number(0.0),
                    TableCell::Number(-1.0),
                ],
            });
            source_rows.push(SourceRow {
                number: base + 1,
                cells: vec![
                    TableCell::Empty,
                    TableCell::Text("Min PZ'".to_string()),
                    TableCell::Number(0.0),
                    TableCell::Number(0.0),
                    TableCell::Number(*min_pz),
                ],
            });
        }
        SourceTable {
            file_name: "Export RFEM.xlsx".to_string(),
            sheet_name: Some(name.to_string()),
            rows: source_rows,
        }
    }

    fn row(number: usize, values: &[&str]) -> SourceRow {
        SourceRow {
            number,
            cells: values
                .iter()
                .map(|value| TableCell::Text((*value).to_string()))
                .collect(),
        }
    }
}
