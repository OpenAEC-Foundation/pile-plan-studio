use std::collections::HashMap;
use std::fmt;
use std::io::Cursor;

use calamine::{Data, Reader, Xlsx};

use crate::{
    CptSelectionAlgorithm, CptSelectionSettings, GreedyOptimizationSettings, PileCostSettings,
    PilePlanProject, ProjectApplication, ProjectBearingCapacity, ProjectCpt, ProjectImportLogEntry,
    ProjectInputs, ProjectLoadPoint, ProjectMetadata, ProjectSettings, ProjectUnits,
    ProjectUserState,
};

mod table;

pub use table::{read_source_table, SourceFormat, SourceTable, TableCell};

pub struct ProjectImportSources<'a> {
    pub project_name: String,
    pub load_points_csv: &'a str,
    pub cpts_xlsx: &'a [u8],
    pub bearing_capacities_xlsx: &'a [u8],
}

#[derive(Debug)]
pub enum ImportError {
    Csv(String),
    Excel(String),
    EmptySource(String),
    MissingWorksheet(String),
    MissingCell {
        row: usize,
        column: usize,
    },
    InvalidValue {
        value: String,
        expected: &'static str,
    },
}

impl fmt::Display for ImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Csv(message) => write!(formatter, "Invalid CSV import: {message}"),
            Self::Excel(message) => write!(formatter, "Invalid Excel import: {message}"),
            Self::EmptySource(source) => write!(formatter, "Import source is empty: {source}"),
            Self::MissingWorksheet(workbook) => {
                write!(formatter, "Workbook has no readable worksheet: {workbook}")
            }
            Self::MissingCell { row, column } => {
                write!(formatter, "Missing cell at row {row}, column {column}")
            }
            Self::InvalidValue { value, expected } => {
                write!(formatter, "Invalid value '{value}', expected {expected}")
            }
        }
    }
}

impl std::error::Error for ImportError {}

pub fn import_project_from_sources(
    sources: ProjectImportSources<'_>,
) -> Result<PilePlanProject, ImportError> {
    let load_points = import_load_points_csv(sources.load_points_csv)?;
    let cpts = import_cpts_xlsx(sources.cpts_xlsx)?;
    let bearing_capacities = import_bearing_capacities_xlsx(sources.bearing_capacities_xlsx)?;
    let active_pile_sizes = unique_sorted_pile_sizes(&bearing_capacities);
    let active_pile_tip_levels = unique_sorted_tip_levels(&bearing_capacities);

    Ok(PilePlanProject {
        schema: "IFCPP".to_string(),
        schema_version: 1,
        application: ProjectApplication {
            name: "Pile Plan Studio".to_string(),
            version: "0.1.0-alpha".to_string(),
        },
        metadata: ProjectMetadata {
            name: sources.project_name,
            author: None,
            organization: None,
            created_at: None,
            modified_at: None,
            description: Some(
                "Imported from load point, CPT and bearing capacity source files.".to_string(),
            ),
            external_references: vec![],
        },
        units: ProjectUnits {
            coordinates: "mm".to_string(),
            design_loads: "kN".to_string(),
            pile_tip_levels: "m".to_string(),
            bearing_capacities: "kN".to_string(),
            costs: "EUR".to_string(),
        },
        inputs: ProjectInputs {
            load_points,
            cpts,
            bearing_capacities,
        },
        settings: ProjectSettings {
            global_cpt_selection: CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                max_angle_degrees: 120.0,
            },
            cpt_selection_by_load_point: HashMap::new(),
            pile_costs: PileCostSettings {
                schema_version: 1,
                pile_head_level_m: 0.0,
                items: vec![],
            },
            optimization: GreedyOptimizationSettings {
                max_pile_sizes: active_pile_sizes.len(),
                max_pile_tip_levels: active_pile_tip_levels.len(),
                max_pile_configurations: active_pile_sizes.len() * active_pile_tip_levels.len(),
                enabled_pile_sizes: active_pile_sizes.clone(),
                enabled_pile_tip_levels: active_pile_tip_levels.clone(),
                baseline_pile_sizes: vec![],
                baseline_pile_tip_levels: vec![],
                baseline_pile_configurations: vec![],
            },
            active_pile_sizes,
            active_pile_tip_levels,
        },
        user_state: ProjectUserState {
            selected_piles: HashMap::new(),
            manual_cpt_selections: HashMap::new(),
        },
        import_log: vec![
            import_log_entry(
                "Belastinglocaties.csv",
                None,
                &[
                    ("id", "id"),
                    ("x", "x_mm"),
                    ("y", "y_mm"),
                    ("FED", "design_load_kn"),
                ],
            ),
            import_log_entry(
                "Sonderingen.xlsx",
                Some("first worksheet"),
                &[("id", "id"), ("x", "x_mm"), ("y", "y_mm")],
            ),
            import_log_entry(
                "Draagvermogens.xlsx",
                Some("first worksheet"),
                &[
                    ("nummer", "cpt_id"),
                    ("ppn", "pile_tip_level_m"),
                    ("afm", "pile_size_mm"),
                    ("FRd", "frd_kn"),
                ],
            ),
        ],
    })
}

pub fn import_load_points_csv(input: &str) -> Result<Vec<ProjectLoadPoint>, ImportError> {
    input
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(parse_load_point_row(index + 1, trimmed))
            }
        })
        .collect()
}

pub fn import_cpts_xlsx(input: &[u8]) -> Result<Vec<ProjectCpt>, ImportError> {
    let rows = first_worksheet_rows(input, "Sonderingen.xlsx")?;
    rows.iter()
        .enumerate()
        .filter(|(_, row)| !row.iter().all(is_empty_cell))
        .map(|(row_index, row)| {
            let id = parse_cell_u32(cell(row, row_index + 1, 1)?)?;
            Ok(ProjectCpt {
                id,
                name: format!("CPT {id}"),
                x_mm: parse_cell_f64(cell(row, row_index + 1, 2)?)?,
                y_mm: parse_cell_f64(cell(row, row_index + 1, 3)?)?,
            })
        })
        .collect()
}

pub fn import_bearing_capacities_xlsx(
    input: &[u8],
) -> Result<Vec<ProjectBearingCapacity>, ImportError> {
    let rows = first_worksheet_rows(input, "Draagvermogens.xlsx")?;
    rows.iter()
        .enumerate()
        .skip(1)
        .filter(|(_, row)| !row.iter().all(is_empty_cell))
        .map(|(row_index, row)| {
            Ok(ProjectBearingCapacity {
                cpt_id: parse_cell_u32(cell(row, row_index + 1, 1)?)?,
                pile_tip_level_m: parse_cell_f64(cell(row, row_index + 1, 2)?)?,
                pile_size_mm: parse_cell_u32(cell(row, row_index + 1, 3)?)?,
                frd_kn: parse_cell_f64(cell(row, row_index + 1, 4)?)?,
            })
        })
        .collect()
}

fn parse_load_point_row(row_number: usize, line: &str) -> Result<ProjectLoadPoint, ImportError> {
    let columns: Vec<&str> = line.split(',').map(str::trim).collect();
    if columns.len() != 4 {
        return Err(ImportError::Csv(format!(
            "row {row_number} has {} columns, expected 4",
            columns.len()
        )));
    }

    let id = parse_str_u32(columns[0])?;
    Ok(ProjectLoadPoint {
        id,
        name: format!("Load point {id}"),
        x_mm: parse_str_f64(columns[1])?,
        y_mm: parse_str_f64(columns[2])?,
        design_load_kn: parse_str_f64(columns[3])?,
    })
}

fn first_worksheet_rows(input: &[u8], workbook_name: &str) -> Result<Vec<Vec<Data>>, ImportError> {
    let cursor = Cursor::new(input.to_vec());
    let mut workbook = Xlsx::new(cursor).map_err(|error| ImportError::Excel(error.to_string()))?;
    let range = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| ImportError::MissingWorksheet(workbook_name.to_string()))?
        .map_err(|error| ImportError::Excel(error.to_string()))?;

    Ok(range.rows().map(|row| row.to_vec()).collect())
}

fn cell(row: &[Data], row_number: usize, column_number: usize) -> Result<&Data, ImportError> {
    row.get(column_number - 1).ok_or(ImportError::MissingCell {
        row: row_number,
        column: column_number,
    })
}

fn is_empty_cell(cell: &Data) -> bool {
    matches!(cell, Data::Empty) || cell.to_string().trim().is_empty()
}

fn parse_cell_u32(cell: &Data) -> Result<u32, ImportError> {
    parse_str_u32(&cell.to_string())
}

fn parse_cell_f64(cell: &Data) -> Result<f64, ImportError> {
    parse_str_f64(&cell.to_string())
}

fn parse_str_u32(value: &str) -> Result<u32, ImportError> {
    let number = parse_str_f64(value)?;
    if !number.is_finite() || number.fract().abs() > f64::EPSILON || number < 0.0 {
        return Err(ImportError::InvalidValue {
            value: value.to_string(),
            expected: "a positive integer",
        });
    }

    Ok(number as u32)
}

fn parse_str_f64(value: &str) -> Result<f64, ImportError> {
    value.parse::<f64>().map_err(|_| ImportError::InvalidValue {
        value: value.to_string(),
        expected: "a number",
    })
}

fn unique_sorted_pile_sizes(bearing_capacities: &[ProjectBearingCapacity]) -> Vec<u32> {
    let mut values: Vec<u32> = bearing_capacities
        .iter()
        .map(|capacity| capacity.pile_size_mm)
        .collect();
    values.sort_unstable();
    values.dedup();
    values
}

fn unique_sorted_tip_levels(bearing_capacities: &[ProjectBearingCapacity]) -> Vec<f64> {
    let mut keys: Vec<i64> = bearing_capacities
        .iter()
        .map(|capacity| (capacity.pile_tip_level_m * 1000.0).round() as i64)
        .collect();
    keys.sort_unstable_by(|left, right| right.cmp(left));
    keys.dedup();
    keys.into_iter().map(|key| key as f64 / 1000.0).collect()
}

fn import_log_entry(
    source_file: &str,
    sheet_name: Option<&str>,
    mapped_columns: &[(&str, &str)],
) -> ProjectImportLogEntry {
    ProjectImportLogEntry {
        source_file: source_file.to_string(),
        imported_at: None,
        sheet_name: sheet_name.map(str::to_string),
        mapped_columns: mapped_columns
            .iter()
            .map(|(source, target)| (source.to_string(), target.to_string()))
            .collect(),
        warnings: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_source_table_preserves_quoted_cells_and_skips_empty_rows() {
        let table =
            read_source_table("loads.csv", SourceFormat::Csv, b"1,\"9,450\",4700,79\n\n").unwrap();

        assert_eq!(table.rows.len(), 1);
        assert_eq!(table.rows[0][1].as_text(), "9,450");
    }

    #[test]
    fn imports_load_points_from_simple_csv_without_header() {
        let load_points = import_load_points_csv("15,9450,4700,79\n16,9450,10350,157\n").unwrap();

        assert_eq!(load_points.len(), 2);
        assert_eq!(load_points[0].id, 15);
        assert_eq!(load_points[0].name, "Load point 15");
        assert_eq!(load_points[0].x_mm, 9450.0);
        assert_eq!(load_points[0].y_mm, 4700.0);
        assert_eq!(load_points[0].design_load_kn, 79.0);
    }

    #[test]
    fn imports_sample_sources_into_ifcpp_project() {
        let project = import_project_from_sources(ProjectImportSources {
            project_name: "Sample Project".to_string(),
            load_points_csv: include_str!("../../../sample_project/Belastinglocaties.csv"),
            cpts_xlsx: include_bytes!("../../../sample_project/Sonderingen.xlsx"),
            bearing_capacities_xlsx: include_bytes!("../../../sample_project/Draagvermogens.xlsx"),
        })
        .unwrap();

        assert_eq!(project.schema, "IFCPP");
        assert_eq!(project.inputs.load_points.len(), 328);
        assert_eq!(project.inputs.cpts.len(), 77);
        assert_eq!(project.inputs.bearing_capacities.len(), 2340);
        assert_eq!(project.inputs.cpts[0].name, "CPT 1");
        assert_eq!(project.inputs.bearing_capacities[0].cpt_id, 1);
        assert_eq!(project.inputs.bearing_capacities[0].pile_size_mm, 290);
        assert_eq!(project.inputs.bearing_capacities[0].pile_tip_level_m, -17.5);
        assert_eq!(project.inputs.bearing_capacities[0].frd_kn, 672.0);
        assert_eq!(project.import_log.len(), 3);
    }
}
