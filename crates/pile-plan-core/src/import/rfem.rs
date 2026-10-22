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
    let mut coordinate_candidates: Vec<_> = tables
        .iter()
        .filter(|table| coordinate_columns(table).is_some())
        .filter_map(sheet_name)
        .collect();
    let mut reaction_candidates: Vec<_> = tables
        .iter()
        .filter(|table| {
            reaction_columns(table).is_some() || component_reaction_columns(table).is_some()
        })
        .filter_map(sheet_name)
        .collect();

    if coordinate_candidates.is_empty() {
        coordinate_candidates.extend(
            tables
                .first()
                .filter(|table| component_reaction_columns(table).is_none())
                .and_then(sheet_name),
        );
    }
    if reaction_candidates.is_empty() {
        reaction_candidates.extend(tables.get(1).and_then(sheet_name));
    }

    RfemSheetDetection {
        coordinate_candidates,
        reaction_candidates,
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
    let (header_row, id_column, x_column, y_column) = coordinate_columns(table)
        .or_else(|| positional_coordinate_columns(table))
        .ok_or_else(|| {
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
    if let Some(columns) = component_reaction_columns(table) {
        return parse_component_reactions(table, columns);
    }
    let (header_row, id_column, label_column, pz_column) = reaction_columns(table)
        .or_else(|| positional_reaction_columns(table))
        .ok_or_else(|| {
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
        if !matches!(normalize(&label).as_str(), "min pz'" | "min pz" | "min") {
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

// RFEM 6 exports a pair of rows for each force/moment component, followed by
// per-node extremes and an overall summary. Only the Pz component rows define
// the vertical envelope; the summary rows are not additional reactions.
fn parse_component_reactions(
    table: &SourceTable,
    (header_row, id_column, label_column, pz_column): (usize, usize, usize, usize),
) -> Result<ParsedReactions, ImportError> {
    let mut envelopes = BTreeMap::<u32, (f64, usize)>::new();
    let summary_start = unlabelled_component_summary_start(table, id_column, label_column);
    for row in table.rows.iter().filter(|row| row.number > header_row) {
        if summary_start.is_some_and(|start| row.number >= start) {
            break;
        }
        let label = normalize(
            &row.cells
                .get(label_column)
                .map(TableCell::as_text)
                .unwrap_or_default(),
        );
        if ["totale max/min", "overall max/min", "total max/min"]
            .iter()
            .any(|prefix| label.starts_with(prefix))
        {
            break;
        }
        if label != "pz" {
            continue;
        }
        let id = optional_u32(row.cells.get(id_column))?.ok_or_else(|| {
            ImportError::Validation(format!(
                "{} has a PZ row without an RFEM node number.",
                table.file_name
            ))
        })?;
        let value = required_f64(row.cells.get(pz_column), table, row.number, pz_column)?;
        envelopes
            .entry(id)
            .and_modify(|(minimum, count)| {
                *minimum = minimum.min(value);
                *count += 1;
            })
            .or_insert((value, 1));
    }
    let mut values = BTreeMap::new();
    for (id, (minimum, count)) in envelopes {
        if count != 2 {
            return Err(ImportError::Validation(format!(
                "{} contains {count} PZ component rows for RFEM node {id}; expected a maximum/minimum pair.",
                table.file_name
            )));
        }
        values.insert(id, minimum);
    }
    Ok(ParsedReactions {
        values,
        exact_duplicates: vec![],
    })
}

fn unlabelled_component_summary_start(
    table: &SourceTable,
    id_column: usize,
    label_column: usize,
) -> Option<usize> {
    // Some exports omit the overall-summary heading. Its twelve component rows
    // immediately follow the final node's Extremes/max, min and ID-only rows.
    let tail = table.rows.last_chunk::<15>()?;
    let node = optional_u32(tail[1].cells.get(id_column)).ok().flatten()?;
    if normalize(&tail[0].cells.get(id_column)?.as_text()) != "extremes"
        || !tail[1]
            .cells
            .get(label_column)
            .is_none_or(TableCell::is_empty)
        || optional_u32(tail[2].cells.get(id_column)).ok().flatten() != Some(node)
        || tail[2]
            .cells
            .iter()
            .enumerate()
            .any(|(column, cell)| column != id_column && !cell.is_empty())
    {
        return None;
    }
    let labels = [
        "px", "px", "py", "py", "pz", "pz", "mx", "mx", "my", "my", "mz", "mz",
    ];
    tail[3..]
        .iter()
        .zip(labels)
        .all(|(row, label)| {
            row.cells
                .get(label_column)
                .is_some_and(|cell| normalize(&cell.as_text()) == label)
                && optional_u32(row.cells.get(id_column))
                    .ok()
                    .flatten()
                    .is_some()
        })
        .then_some(tail[3].number)
}

fn component_reaction_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    let columns = reaction_columns(table).unwrap_or((0, 0, 1, 4));
    let (header_row, id_column, label_column, pz_column) = columns;
    table
        .rows
        .iter()
        .filter(|row| row.number > header_row)
        .take(5)
        .any(|row| {
            let label = normalize(
                &row.cells
                    .get(label_column)
                    .map(TableCell::as_text)
                    .unwrap_or_default(),
            );
            matches!(label.as_str(), "px" | "py" | "pz" | "mx" | "my" | "mz")
                && row.cells.len() > pz_column
                && optional_u32(row.cells.get(id_column))
                    .ok()
                    .flatten()
                    .is_some()
        })
        .then_some(columns)
}

fn coordinate_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    let headers = table.rows.iter().take(5).find_map(|row| {
        let normalized: Vec<_> = row
            .cells
            .iter()
            .map(|cell| normalize(&cell.as_text()))
            .collect();
        let id = find_header(&normalized, &["no.", "no", "nummer"])?;
        let x = find_header(&normalized, &["x [m]", "x[m]"])?;
        let y = find_header(&normalized, &["y [m]", "y[m]"])?;
        Some((row.number, id, x, y))
    });
    let header_row = headers.map_or(0, |columns| columns.0);
    let rfem6_layout = table
        .rows
        .iter()
        .filter(|row| row.number > header_row)
        .take(5)
        .any(|row| {
            row.cells.get(4).is_some_and(|cell| {
                matches!(
                    normalize(&cell.as_text()).as_str(),
                    "carthesisch" | "cartesisch" | "cartesian"
                )
            }) && row.cells.get(8..11).is_some_and(|cells| {
                cells
                    .iter()
                    .all(|cell| cell.as_text().parse::<f64>().is_ok_and(f64::is_finite))
            })
        });
    if rfem6_layout {
        // F/G/H are input coordinates; I/J/K are the global Cartesian position.
        // With no headers, data starts at the first row rather than row three.
        Some((header_row, 0, 8, 9))
    } else {
        headers
    }
}

fn reaction_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    table.rows.iter().take(5).find_map(|row| {
        let normalized: Vec<_> = row
            .cells
            .iter()
            .map(|cell| normalize(&cell.as_text()))
            .collect();
        let id = find_header(&normalized, &["no.", "no", "nummer"])?;
        let pz = find_header(&normalized, &["pz'", "pz"])?;
        Some((row.number, id, id + 1, pz))
    })
}

fn positional_coordinate_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    let header_row = table.rows.get(1)?.number;
    table
        .rows
        .iter()
        .any(|row| row.cells.len() > 5)
        .then_some((header_row, 0, 4, 5))
}

fn positional_reaction_columns(table: &SourceTable) -> Option<(usize, usize, usize, usize)> {
    let header_row = table.rows.get(1)?.number;
    table
        .rows
        .iter()
        .any(|row| row.cells.len() > 4)
        .then_some((header_row, 0, 1, 4))
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
    fn falls_back_to_first_two_worksheets_for_positional_rfem_layout() {
        let analysis = analyze_tables(
            &[
                positional_coordinate_table("Ander knopenblad", &[(15, 9.05, 4.70)]),
                positional_reaction_table("Andere reacties", &[(15, -79.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.coordinate_sheet, "Ander knopenblad");
        assert_eq!(analysis.reaction_sheet, "Andere reacties");
        assert_eq!(analysis.load_points.len(), 1);
        assert_eq!(analysis.load_points[0].id, 15);
        assert_eq!(analysis.load_points[0].design_load_kn, 79.0);
    }

    #[test]
    fn parses_unprimed_pz_minimum_envelope_rows() {
        let analysis = analyze_tables(
            &[
                rfem_coordinate_table("1.1 Knopen", &[(15, 9.05, 4.70)]),
                unprimed_reaction_table("RC1 - Reactiekrachten", &[(15, -79.0)]),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points.len(), 1);
        assert_eq!(analysis.load_points[0].id, 15);
        assert_eq!(analysis.load_points[0].design_load_kn, 79.0);
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

    #[test]
    fn detects_rfem6_component_envelopes_without_headers_in_any_sheet_order() {
        let detection = detect_rfem_sheets(&[
            rfem6_reaction_table("Knoop | Reactiekrachten"),
            rfem_coordinate_table("Knopen", &[(1, 1.0, 2.0)]),
            rfem6_reaction_table("Andere combinatie"),
        ]);

        assert_eq!(detection.coordinate_candidates, vec!["Knopen"]);
        assert_eq!(
            detection.reaction_candidates,
            vec!["Knoop | Reactiekrachten", "Andere combinatie"]
        );
    }

    #[test]
    fn imports_rfem6_minimum_pz_per_node_without_counting_summaries() {
        let analysis = analyze_tables(
            &[
                rfem_coordinate_table("Knopen", &[(8, 3.0, 4.0), (1, 1.0, 2.0)]),
                rfem6_reaction_table("Knoop | Reactiekrachten"),
            ],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points.len(), 2);
        assert_eq!(analysis.load_points[0].id, 1);
        assert_eq!(analysis.load_points[0].x_mm, 1000.0);
        assert_eq!(analysis.load_points[0].y_mm, 2000.0);
        assert_eq!(analysis.load_points[0].design_load_kn, 398.577515);
        assert_eq!(analysis.load_points[1].id, 8);
        assert_eq!(analysis.load_points[1].design_load_kn, 643.518494);
        assert!(analysis.exact_reaction_duplicates.is_empty());
        assert!(analysis.reaction_nodes_without_coordinates.is_empty());
        assert!(analysis.coordinate_nodes_without_reactions.is_empty());
    }

    #[test]
    fn imports_rfem6_component_envelopes_with_headers_and_reversed_pz_order() {
        let mut reactions = rfem6_reaction_table("Reacties");
        reactions.rows.swap(4, 5);
        // A larger positive maximum must not replace the signed minimum.
        reactions.rows[5].cells[4] = TableCell::Number(900.0);
        let mut rows = vec![
            row(1, &["Knoop", "", "Reactiekrachten [kN]", "", ""]),
            row(2, &["No.", "", "PX", "PY", "PZ"]),
        ];
        rows.extend(reactions.rows);
        for (index, row) in rows.iter_mut().enumerate() {
            row.number = index + 1;
        }
        reactions.rows = rows;

        let parsed = parse_reactions(&reactions).unwrap();

        assert_eq!(parsed.values[&1], -398.577515);
        assert_eq!(parsed.values[&8], -643.518494);
        assert_eq!(parsed.values.len(), 2);
    }

    #[test]
    fn rejects_invalid_rfem6_pz_values_with_source_location() {
        for value in ["", "not a number", "NaN", "inf"] {
            let mut reactions = rfem6_reaction_table("Reacties");
            reactions.rows[5].cells[4] = TableCell::Text(value.to_string());

            let error = match parse_reactions(&reactions) {
                Ok(_) => panic!("invalid Pz value was accepted: {value}"),
                Err(error) => error,
            };
            let ImportError::InvalidValue { location, .. } = error else {
                panic!("expected a located invalid-value error, got {error}");
            };
            assert_eq!(location.sheet_name.as_deref(), Some("Reacties"));
            assert_eq!(location.row, Some(6));
            assert_eq!(location.column, Some(5));
        }
    }

    #[test]
    fn ignores_english_rfem6_overall_summaries() {
        let mut reactions = rfem6_reaction_table("Reactions");
        reactions.rows[22].cells[1] =
            TableCell::Text("Overall max/min values with corresponding values".to_string());

        let parsed = parse_reactions(&reactions).unwrap();

        assert_eq!(parsed.values.len(), 2);
        assert!(!parsed.values.contains_key(&99));
    }

    #[test]
    fn rejects_rfem6_component_envelopes_without_a_complete_pz_pair() {
        for extra_row in [false, true] {
            let mut reactions = rfem6_reaction_table("Reacties");
            if extra_row {
                reactions.rows.insert(6, reactions.rows[5].clone());
            } else {
                reactions.rows.remove(5);
            }
            assert!(parse_reactions(&reactions).is_err());
        }
    }

    #[test]
    fn rejects_invalid_rfem6_pz_node_numbers() {
        for value in ["", "not a node", "-1", "1.5", "NaN"] {
            let mut reactions = rfem6_reaction_table("Reacties");
            reactions.rows[5].cells[0] = TableCell::Text(value.to_string());

            assert!(parse_reactions(&reactions).is_err(), "node {value}");
        }
    }

    #[test]
    fn legacy_rfem_reactions_still_reject_conflicting_duplicate_minima() {
        let reactions = rfem_reaction_table("Reactions", &[(1, -10.0), (1, -20.0)]);

        assert!(parse_reactions(&reactions).is_err());
    }

    #[test]
    fn rfem6_reaction_only_workbook_reports_missing_coordinates() {
        let source = rfem6_source(&[rfem6_reaction_table("Knoop | Reactiekrachten")]);
        let preview = crate::import::preview_import_source(&source);

        assert!(preview.has_errors());
        assert!(preview.diagnostics.iter().any(|diagnostic| diagnostic.code
            == crate::import::ImportDiagnosticCode::MissingCoordinateSheet));
    }

    #[test]
    fn rfem6_xlsx_auto_preview_and_final_import_agree() {
        let source = rfem6_source(&[
            rfem_coordinate_table("Knopen", &[(1, 1.0, 2.0), (8, 3.0, 4.0)]),
            rfem6_reaction_table("Knoop | Reactiekrachten"),
        ]);
        let preview = crate::import::preview_import_source(&source);

        assert_eq!(preview.resolved_profile, Some(ImportProfile::RfemExport));
        assert_eq!(preview.item_count, 2);
        assert!(preview.diagnostics.is_empty(), "{:?}", preview.diagnostics);
        let (load_points, log) = super::super::pipeline::parse_load_source(&source).unwrap();
        assert_eq!(load_points.len(), preview.item_count);
        assert_eq!(load_points[0].design_load_kn, 398.577515);
        assert_eq!(load_points[1].design_load_kn, 643.518494);
        assert_eq!(log.source_profile, Some(ImportProfile::RfemExport));
        assert_eq!(log.profile_details["coordinate_sheet"], "Knopen");
        assert_eq!(
            log.profile_details["reaction_sheet"],
            "Knoop | Reactiekrachten"
        );
    }

    #[test]
    fn rfem6_headerless_coordinates_use_global_columns_and_keep_the_first_nodes() {
        let coordinates = rfem6_coordinate_table("Knopen");
        let analysis = analyze_tables(
            &[coordinates, rfem6_reaction_table("Reacties")],
            &ImportProfileOptions::default(),
        )
        .unwrap();

        assert_eq!(analysis.load_points.len(), 2);
        assert_eq!(analysis.load_points[0].id, 1);
        assert_eq!(analysis.load_points[0].x_mm, 5580.0);
        assert_eq!(analysis.load_points[0].y_mm, 5580.0);
        assert_eq!(analysis.load_points[1].id, 8);
        assert_eq!(analysis.load_points[1].x_mm, 5580.0);
        assert_eq!(analysis.load_points[1].y_mm, 10880.0);
    }

    #[test]
    fn rfem6_coordinate_headers_still_select_global_instead_of_input_coordinates() {
        let mut coordinates = rfem6_coordinate_table("Knopen");
        coordinates.rows.insert(
            0,
            row(
                0,
                &[
                    "No.",
                    "Knooptype",
                    "Referentieknoop",
                    "Coördinatenstelsel",
                    "Coördinatentype",
                    "X [m]",
                    "Y [m]",
                    "Z [m]",
                    "X [m]",
                    "Y [m]",
                    "Z [m]",
                ],
            ),
        );
        for (index, row) in coordinates.rows.iter_mut().enumerate() {
            row.number = index + 1;
        }
        let parsed = parse_coordinates(&coordinates).unwrap();

        assert_eq!(parsed.values[&1], (5.58, 5.58));
        assert_eq!(parsed.values[&8], (5.58, 10.88));
    }

    #[test]
    fn rfem6_support_types_are_optional_and_do_not_change_the_imported_nodes() {
        let supports = SourceTable {
            file_name: "RFEM 6.xlsx".to_string(),
            sheet_name: Some("Steunpunten".to_string()),
            rows: vec![
                row(
                    1,
                    &[
                        "4",
                        "1",
                        "1 - Globaal XYZ",
                        "inf",
                        "inf",
                        "inf",
                        "0",
                        "0",
                        "inf",
                    ],
                ),
                row(
                    2,
                    &["5", "8", "1 - Globaal XYZ", "0", "0", "inf", "0", "0", "0"],
                ),
            ],
        };
        let coordinates = rfem6_coordinate_table("Knopen");
        let reactions = rfem6_reaction_table("OS1 | Knoop | Reactiekrachten");
        let with_supports = rfem6_source(&[supports, reactions.clone(), coordinates.clone()]);
        let without_supports = rfem6_source(&[coordinates, reactions]);
        let preview = crate::import::preview_import_source(&with_supports);
        let (with_points, _) = super::super::pipeline::parse_load_source(&with_supports).unwrap();
        let (without_points, _) =
            super::super::pipeline::parse_load_source(&without_supports).unwrap();

        assert_eq!(preview.resolved_profile, Some(ImportProfile::RfemExport));
        assert_eq!(preview.item_count, 2);
        assert!(preview.diagnostics.is_empty(), "{:?}", preview.diagnostics);
        assert_eq!(with_points, without_points);
    }

    #[test]
    fn rfem6_overall_component_summary_can_omit_its_heading() {
        let mut reactions = rfem6_reaction_table("Reacties");
        reactions.rows.truncate(22);
        for (index, component) in [
            "Px", "Px", "Py", "Py", "Pz", "Pz", "Mx", "Mx", "My", "My", "Mz", "Mz",
        ]
        .iter()
        .enumerate()
        {
            reactions.rows.push(row(
                index + 23,
                &[
                    if index % 2 == 0 { "1" } else { "8" },
                    component,
                    "0",
                    "0",
                    "-99999",
                    "0",
                    "0",
                    "0",
                    "BC1",
                ],
            ));
        }

        let parsed = parse_reactions(&reactions).unwrap();

        assert_eq!(parsed.values.len(), 2);
        assert_eq!(parsed.values[&1], -398.577515);
        assert_eq!(parsed.values[&8], -643.518494);
    }

    fn rfem6_coordinate_table(name: &str) -> SourceTable {
        SourceTable {
            file_name: "RFEM 6.xlsx".to_string(),
            sheet_name: Some(name.to_string()),
            // Input coordinates deliberately differ from the global I/J/K columns.
            rows: vec![
                row(
                    1,
                    &[
                        "1",
                        "Standaard",
                        "--",
                        "1 - Globaal XYZ",
                        "Carthesisch",
                        "1",
                        "2",
                        "3",
                        "5.58",
                        "5.58",
                        "-0.3",
                    ],
                ),
                row(
                    2,
                    &[
                        "8",
                        "Standaard",
                        "--",
                        "1 - Globaal XYZ",
                        "Carthesisch",
                        "4",
                        "5",
                        "6",
                        "5.58",
                        "10.88",
                        "-0.3",
                    ],
                ),
            ],
        }
    }

    fn rfem6_reaction_table(name: &str) -> SourceTable {
        // Anonymized reaction blocks from the supplied RFEM 6 export. No headers.
        let mut table = crate::import::read_source_table(
            "RFEM 6.xlsx",
            SourceFormat::Csv,
            include_bytes!("fixtures/rfem6-reactions.csv"),
        )
        .unwrap();
        table.sheet_name = Some(name.to_string());
        table
    }

    fn rfem6_source(tables: &[SourceTable]) -> ImportSource {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        for table in tables {
            let sheet = workbook.add_worksheet();
            sheet
                .set_name(table.sheet_name.as_deref().unwrap())
                .unwrap();
            for row in &table.rows {
                for (column, cell) in row.cells.iter().enumerate() {
                    match cell {
                        TableCell::Number(value) => {
                            sheet
                                .write_number((row.number - 1) as u32, column as u16, *value)
                                .unwrap();
                        }
                        TableCell::Text(value) => {
                            sheet
                                .write_string((row.number - 1) as u32, column as u16, value)
                                .unwrap();
                        }
                        _ => {}
                    }
                }
            }
        }
        ImportSource {
            role: ImportRole::LoadPoints,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
            file_name: "RFEM 6.xlsx".to_string(),
            format: SourceFormat::Xlsx,
            bytes: workbook.save_to_buffer().unwrap(),
        }
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

    fn positional_coordinate_table(name: &str, rows: &[(u32, f64, f64)]) -> SourceTable {
        let mut table = rfem_coordinate_table(name, rows);
        table.rows[1] = row(2, &["Node", "Type", "Reference", "System", "X", "Y"]);
        table
    }

    fn positional_reaction_table(name: &str, rows: &[(u32, f64)]) -> SourceTable {
        let mut table = unprimed_reaction_table(name, rows);
        table.rows[1] = row(2, &["Node", "Envelope", "FX", "FY", "FZ", "MX"]);
        table
    }

    fn unprimed_reaction_table(name: &str, rows: &[(u32, f64)]) -> SourceTable {
        let mut source_rows = vec![
            row(1, &["Knoop", "", "Reactiekrachten [kN]", "", "", ""]),
            row(2, &["No.", "", "PX", "PY", "PZ", "MX"]),
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
                    TableCell::Text("Min".to_string()),
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
