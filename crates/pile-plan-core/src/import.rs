use crate::{
    CptSelectionAlgorithm, CptSelectionSettings, GreedyOptimizationSettings, PileCostSettings,
    PilePlanProject, ProjectApplication, ProjectBearingCapacity, ProjectCpt, ProjectImportLogEntry,
    ProjectInputs, ProjectLoadPoint, ProjectMetadata, ProjectSettings, ProjectUnits,
    ProjectUserState,
};
use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};

mod roles;
mod table;

pub use roles::{
    parse_bearing_capacities, parse_cpts, parse_load_points, reconcile_imported_inputs,
    validate_imported_inputs, ImportReconciliation,
};
pub use table::{
    read_source_table, SourceFormat, SourceLocation, SourceRow, SourceTable, TableCell,
};

pub struct ProjectImportSources<'a> {
    pub project_name: String,
    pub load_points_csv: &'a str,
    pub cpts_xlsx: &'a [u8],
    pub bearing_capacities_xlsx: &'a [u8],
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportRole {
    LoadPoints,
    Cpts,
    BearingCapacities,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImportSource {
    pub role: ImportRole,
    pub file_name: String,
    pub format: SourceFormat,
    pub bytes: Vec<u8>,
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
    let reconciliation = reconcile_imported_inputs(&load_points, &cpts, bearing_capacities)?;
    let mut import_log = vec![
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
            capacity_columns(),
        ),
    ];
    import_log[2].warnings = reconciliation_warnings(&reconciliation);
    Ok(build_imported_project(
        sources.project_name,
        load_points,
        cpts,
        reconciliation.bearing_capacities,
        import_log,
    ))
}

pub fn import_project_from_generic_sources(
    project_name: &str,
    sources: &[ImportSource],
) -> Result<PilePlanProject, ImportError> {
    let load_source = source_for_role(sources, ImportRole::LoadPoints)?;
    let cpt_source = source_for_role(sources, ImportRole::Cpts)?;
    let capacity_source = source_for_role(sources, ImportRole::BearingCapacities)?;
    let load_table = read_source_table(
        &load_source.file_name,
        load_source.format,
        &load_source.bytes,
    )?;
    let cpt_table = read_source_table(&cpt_source.file_name, cpt_source.format, &cpt_source.bytes)?;
    let capacity_table = read_source_table(
        &capacity_source.file_name,
        capacity_source.format,
        &capacity_source.bytes,
    )?;
    let load_points = parse_load_points(&load_table)?;
    let cpts = parse_cpts(&cpt_table)?;
    let bearing_capacities = parse_bearing_capacities(&capacity_table)?;
    let reconciliation = reconcile_imported_inputs(&load_points, &cpts, bearing_capacities)?;
    let mut capacity_log = provenance_entry(
        capacity_source,
        capacity_table.sheet_name,
        capacity_columns(),
    );
    capacity_log.warnings = reconciliation_warnings(&reconciliation);

    Ok(build_imported_project(
        project_name.to_string(),
        load_points,
        cpts,
        reconciliation.bearing_capacities,
        vec![
            provenance_entry(load_source, load_table.sheet_name, load_point_columns()),
            provenance_entry(cpt_source, cpt_table.sheet_name, cpt_columns()),
            capacity_log,
        ],
    ))
}

fn build_imported_project(
    project_name: String,
    load_points: Vec<ProjectLoadPoint>,
    cpts: Vec<ProjectCpt>,
    bearing_capacities: Vec<ProjectBearingCapacity>,
    import_log: Vec<ProjectImportLogEntry>,
) -> PilePlanProject {
    let active_pile_sizes = unique_sorted_pile_sizes(&bearing_capacities);
    let active_pile_tip_levels = unique_sorted_tip_levels(&bearing_capacities);
    PilePlanProject {
        schema: "IFCPP".to_string(),
        schema_version: 1,
        application: ProjectApplication {
            name: "Pile Plan Studio".to_string(),
            version: "0.1.0-alpha".to_string(),
        },
        metadata: ProjectMetadata {
            name: project_name,
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
        import_log,
    }
}

fn source_for_role(
    sources: &[ImportSource],
    role: ImportRole,
) -> Result<&ImportSource, ImportError> {
    let mut matches = sources.iter().filter(|source| source.role == role);
    let source = matches
        .next()
        .ok_or_else(|| ImportError::Validation(format!("Missing import source for {role:?}")))?;
    if matches.next().is_some() {
        return Err(ImportError::Validation(format!(
            "Multiple import sources for {role:?}"
        )));
    }
    Ok(source)
}

fn provenance_entry(
    source: &ImportSource,
    sheet_name: Option<String>,
    columns: &[(&str, &str)],
) -> ProjectImportLogEntry {
    ProjectImportLogEntry {
        source_file: source.file_name.clone(),
        imported_at: None,
        sheet_name,
        mapped_columns: columns
            .iter()
            .map(|(from, to)| ((*from).to_string(), (*to).to_string()))
            .collect(),
        warnings: vec![],
        source_role: Some(source.role),
        source_format: Some(source.format),
        schema_version: Some("fixed-1".to_string()),
    }
}

fn load_point_columns() -> &'static [(&'static str, &'static str)] {
    &[
        ("id", "id"),
        ("x", "x_mm"),
        ("y", "y_mm"),
        ("FED", "design_load_kn"),
    ]
}

fn cpt_columns() -> &'static [(&'static str, &'static str)] {
    &[("id", "id"), ("x", "x_mm"), ("y", "y_mm")]
}

fn capacity_columns() -> &'static [(&'static str, &'static str)] {
    &[
        ("nummer", "cpt_id"),
        ("ppn", "pile_tip_level_m"),
        ("afm", "pile_size_mm"),
        ("FRd", "frd_kn"),
    ]
}

fn reconciliation_warnings(reconciliation: &ImportReconciliation) -> Vec<String> {
    let mut warnings = Vec::new();
    if reconciliation.ignored_orphan_rows > 0 {
        warnings.push(format!(
            "Ignored {} bearing-capacity row(s) for {} CPT(s) without coordinates: {}",
            reconciliation.ignored_orphan_rows,
            reconciliation.ignored_orphan_cpt_ids.len(),
            join_ids(&reconciliation.ignored_orphan_cpt_ids)
        ));
    }
    if reconciliation.deduplicated_rows > 0 {
        warnings.push(format!(
            "Deduplicated {} exact bearing-capacity row(s)",
            reconciliation.deduplicated_rows
        ));
    }
    if reconciliation.conflicting_duplicate_keys > 0 {
        warnings.push(format!(
            "Selected the lowest FRD for {} conflicting duplicate bearing-capacity key(s)",
            reconciliation.conflicting_duplicate_keys
        ));
    }
    if !reconciliation.cpt_ids_without_capacities.is_empty() {
        warnings.push(format!(
            "CPTs without bearing capacities: {}. Pile options using these CPTs will be Missing.",
            join_ids(&reconciliation.cpt_ids_without_capacities)
        ));
    }
    warnings
}

fn join_ids(ids: &[u32]) -> String {
    ids.iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(", ")
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
        source_role: None,
        source_format: None,
        schema_version: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_source_table_preserves_quoted_cells_and_skips_empty_rows() {
        let table =
            read_source_table("loads.csv", SourceFormat::Csv, b"1,\"9,450\",4700,79\n\n").unwrap();

        assert_eq!(table.file_name, "loads.csv");
        assert_eq!(table.rows.len(), 1);
        assert_eq!(table.rows[0].number, 1);
        assert_eq!(table.rows[0].cells[1].as_text(), "9,450");
    }

    #[test]
    fn source_table_preserves_physical_rows_around_empty_rows() {
        let table = read_source_table(
            "loads.csv",
            SourceFormat::Csv,
            b"1,0,0,100\n\n2,1,1,200\n",
        )
        .unwrap();

        assert_eq!(table.rows[1].number, 3);
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
    fn reconciliation_ignores_orphans_deduplicates_and_keeps_cpts_without_capacities() {
        let loads = parse_load_points(&source_table(vec![vec![
            text("1"),
            text("0"),
            text("0"),
            text("100"),
        ]]))
        .unwrap();
        let cpts = parse_cpts(&source_table(vec![
            vec![text("61"), text("0"), text("0")],
            vec![text("63"), text("1000"), text("1000")],
        ]))
        .unwrap();
        let capacities = parse_bearing_capacities(&source_table(vec![
            vec![text("62"), text("-17.5"), text("290"), text("700")],
            vec![text("61"), text("-17.5"), text("290"), text("672")],
            vec![text("61"), text("-17.5"), text("290"), text("672")],
        ]))
        .unwrap();

        let result = reconcile_imported_inputs(&loads, &cpts, capacities).unwrap();
        assert_eq!(result.bearing_capacities.len(), 1);
        assert_eq!(result.ignored_orphan_rows, 1);
        assert_eq!(result.ignored_orphan_cpt_ids, vec![62]);
        assert_eq!(result.deduplicated_rows, 1);
        assert_eq!(result.cpt_ids_without_capacities, vec![63]);
    }

    #[test]
    fn reconciliation_uses_lowest_conflicting_duplicate_capacity() {
        let loads = vec![ProjectLoadPoint {
            id: 1,
            name: "Load point 1".into(),
            x_mm: 0.0,
            y_mm: 0.0,
            design_load_kn: 100.0,
        }];
        let cpts = vec![ProjectCpt {
            id: 61,
            name: "CPT 61".into(),
            x_mm: 0.0,
            y_mm: 0.0,
        }];
        let capacities = vec![
            ProjectBearingCapacity {
                cpt_id: 61,
                pile_tip_level_m: -17.5,
                pile_size_mm: 290,
                frd_kn: 672.0,
            },
            ProjectBearingCapacity {
                cpt_id: 61,
                pile_tip_level_m: -17.5,
                pile_size_mm: 290,
                frd_kn: 700.0,
            },
        ];

        let result = reconcile_imported_inputs(&loads, &cpts, capacities).unwrap();
        assert_eq!(result.bearing_capacities.len(), 1);
        assert_eq!(result.bearing_capacities[0].frd_kn, 672.0);
        assert_eq!(result.conflicting_duplicate_keys, 1);
    }

    #[test]
    fn reconciliation_keeps_finite_negative_frd() {
        let loads = vec![ProjectLoadPoint {
            id: 1,
            name: "Load point 1".into(),
            x_mm: 0.0,
            y_mm: 0.0,
            design_load_kn: 100.0,
        }];
        let cpts = vec![ProjectCpt {
            id: 50,
            name: "CPT 50".into(),
            x_mm: 0.0,
            y_mm: 0.0,
        }];
        let capacities = vec![ProjectBearingCapacity {
            cpt_id: 50,
            pile_tip_level_m: -17.5,
            pile_size_mm: 290,
            frd_kn: -42.0,
        }];

        let result = reconcile_imported_inputs(&loads, &cpts, capacities).unwrap();
        assert_eq!(result.bearing_capacities[0].frd_kn, -42.0);
    }

    #[test]
    fn generic_sources_import_atomically_and_record_provenance() {
        let sources = vec![
            ImportSource {
                role: ImportRole::LoadPoints,
                file_name: "loads.csv".to_string(),
                format: SourceFormat::Csv,
                bytes: include_bytes!("../../../sample_project/Belastinglocaties.csv").to_vec(),
            },
            ImportSource {
                role: ImportRole::Cpts,
                file_name: "cpts.xlsx".to_string(),
                format: SourceFormat::Xlsx,
                bytes: include_bytes!("../../../sample_project/Sonderingen.xlsx").to_vec(),
            },
            ImportSource {
                role: ImportRole::BearingCapacities,
                file_name: "capacities.xlsx".to_string(),
                format: SourceFormat::Xlsx,
                bytes: include_bytes!("../../../sample_project/Draagvermogens.xlsx").to_vec(),
            },
        ];

        let project = import_project_from_generic_sources("Mixed Project", &sources).unwrap();

        assert_eq!(project.metadata.name, "Mixed Project");
        assert_eq!(project.import_log[0].source_file, "loads.csv");
        assert_eq!(
            project.import_log[0].source_role,
            Some(ImportRole::LoadPoints)
        );
        assert_eq!(project.import_log[0].source_format, Some(SourceFormat::Csv));
        assert_eq!(
            project.import_log[0].schema_version.as_deref(),
            Some("fixed-1")
        );
    }

    #[test]
    fn generic_import_records_reconciliation_warnings() {
        let sources = vec![
            csv_source(ImportRole::LoadPoints, "loads.csv", "1,0,0,100\n"),
            csv_source(ImportRole::Cpts, "cpts.csv", "61,0,0\n63,1000,1000\n"),
            csv_source(
                ImportRole::BearingCapacities,
                "capacities.csv",
                "62,-17.5,290,700\n61,-17.5,290,672\n61,-17.5,290,672\n",
            ),
        ];

        let project = import_project_from_generic_sources("Warnings", &sources).unwrap();
        assert_eq!(project.inputs.bearing_capacities.len(), 1);
        let warnings = &project.import_log[2].warnings;
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("Ignored 1 bearing-capacity row")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("Deduplicated 1")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("CPTs without bearing capacities: 63")));
    }

    fn csv_source(role: ImportRole, file_name: &str, contents: &str) -> ImportSource {
        ImportSource {
            role,
            file_name: file_name.to_string(),
            format: SourceFormat::Csv,
            bytes: contents.as_bytes().to_vec(),
        }
    }

    fn source_table(rows: Vec<Vec<TableCell>>) -> SourceTable {
        SourceTable {
            file_name: "test.csv".to_string(),
            sheet_name: None,
            rows: rows
                .into_iter()
                .enumerate()
                .map(|(index, cells)| SourceRow {
                    number: index + 1,
                    cells,
                })
                .collect(),
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
        assert_eq!(project.inputs.bearing_capacities.len(), 2208);
        assert_eq!(project.inputs.cpts[0].name, "CPT 1");
        assert_eq!(project.inputs.bearing_capacities[0].cpt_id, 1);
        assert_eq!(project.inputs.bearing_capacities[0].pile_size_mm, 290);
        assert_eq!(project.inputs.bearing_capacities[0].pile_tip_level_m, -17.5);
        assert_eq!(project.inputs.bearing_capacities[0].frd_kn, 672.0);
        assert_eq!(project.import_log.len(), 3);
        assert!(project.import_log[2]
            .warnings
            .iter()
            .any(|warning| warning.contains("132 conflicting duplicate")));
    }
}
