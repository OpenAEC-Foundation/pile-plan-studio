use crate::{
    CptSelectionAlgorithm, CptSelectionSettings, GreedyOptimizationSettings, PileCostSettings,
    PilePlanProject, ProjectApplication, ProjectBearingCapacity, ProjectCpt, ProjectImportLogEntry,
    ProjectInputs, ProjectLoadPoint, ProjectMetadata, ProjectSettings, ProjectUnits,
    ProjectUserState,
};
use std::collections::HashMap;
use std::fmt;

mod roles;
mod table;

pub use roles::{
    parse_bearing_capacities, parse_cpts, parse_load_points, validate_imported_inputs,
};
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
    Validation(String),
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
            Self::Validation(message) => formatter.write_str(message),
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
    let table = read_source_table("Belastinglocaties.csv", SourceFormat::Csv, input.as_bytes())?;
    parse_load_points(&table)
}

pub fn import_cpts_xlsx(input: &[u8]) -> Result<Vec<ProjectCpt>, ImportError> {
    let table = read_source_table("Sonderingen.xlsx", SourceFormat::Xlsx, input)?;
    parse_cpts(&table)
}

pub fn import_bearing_capacities_xlsx(
    input: &[u8],
) -> Result<Vec<ProjectBearingCapacity>, ImportError> {
    let table = read_source_table("Draagvermogens.xlsx", SourceFormat::Xlsx, input)?;
    parse_bearing_capacities(&table)
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
    fn role_parsers_treat_text_and_numeric_cells_equally() {
        let text_loads = source_table(vec![vec![
            text("15"),
            text("9450"),
            text("4700"),
            text("79"),
        ]]);
        let numeric_loads = source_table(vec![vec![
            number(15.0),
            number(9450.0),
            number(4700.0),
            number(79.0),
        ]]);
        assert_eq!(
            parse_load_points(&text_loads).unwrap(),
            parse_load_points(&numeric_loads).unwrap()
        );

        let text_cpts = source_table(vec![vec![text("61"), text("1000"), text("2000")]]);
        let numeric_cpts = source_table(vec![vec![number(61.0), number(1000.0), number(2000.0)]]);
        assert_eq!(
            parse_cpts(&text_cpts).unwrap(),
            parse_cpts(&numeric_cpts).unwrap()
        );

        let text_capacities = source_table(vec![vec![
            text("61"),
            text("-17.5"),
            text("290"),
            text("672"),
        ]]);
        let numeric_capacities = source_table(vec![vec![
            number(61.0),
            number(-17.5),
            number(290.0),
            number(672.0),
        ]]);
        assert_eq!(
            parse_bearing_capacities(&text_capacities).unwrap(),
            parse_bearing_capacities(&numeric_capacities).unwrap()
        );
    }

    #[test]
    fn imported_inputs_reject_unknown_capacity_cpt_references() {
        let loads = parse_load_points(&source_table(vec![vec![
            text("1"),
            text("0"),
            text("0"),
            text("100"),
        ]]))
        .unwrap();
        let cpts = parse_cpts(&source_table(vec![vec![text("61"), text("0"), text("0")]])).unwrap();
        let capacities = parse_bearing_capacities(&source_table(vec![vec![
            text("62"),
            text("-17.5"),
            text("290"),
            text("700"),
        ]]))
        .unwrap();

        let error = validate_imported_inputs(&loads, &cpts, &capacities).unwrap_err();
        assert!(error.to_string().contains("unknown CPT 62"));
    }

    fn source_table(rows: Vec<Vec<TableCell>>) -> SourceTable {
        SourceTable {
            sheet_name: None,
            rows,
        }
    }

    fn text(value: &str) -> TableCell {
        TableCell::Text(value.to_string())
    }

    fn number(value: f64) -> TableCell {
        TableCell::Number(value)
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
