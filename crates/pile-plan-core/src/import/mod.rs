use crate::{
    CptSelectionAlgorithm, CptSelectionSettings, DuplicateLoadPointPositions, PileCostSettings,
    PilePlanProject, PileTipLevelPrecisionErrorReason, ProjectApplication, ProjectBearingCapacity,
    ProjectCpt, ProjectImportLogEntry, ProjectInputs, ProjectLoadPoint, ProjectMetadata,
    ProjectSettings, ProjectUnits, ProjectUserState, APPLICATION_NAME,
};
use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};

mod pipeline;
mod profile;
mod refresh;
mod rfem;
mod roles;
mod table;

pub use pipeline::{import_project_from_sources, preview_import_source};
pub use profile::{
    available_profiles, ImportDiagnostic, ImportDiagnosticCode, ImportDiagnosticLocation,
    ImportDiagnosticSeverity, ImportPileTipLevelDiagnostic, ImportPreviewDetails, ImportProfile,
    ImportProfileOptions, ImportSourcePreview, RfemPreviewDetails,
};
pub use refresh::refresh_project_from_profiled_sources;
#[cfg(test)]
use roles::parse_bearing_capacities;
use roles::{
    parse_bearing_capacities_with_diagnostics, parse_cpts, parse_load_points,
    reconcile_imported_inputs, ImportReconciliation,
};
pub(crate) use table::read_xlsx_tables;
pub use table::{
    read_source_table, SourceFormat, SourceLocation, SourceRow, SourceTable, TableCell,
};

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
    #[serde(default)]
    pub profile: ImportProfile,
    #[serde(default)]
    pub profile_options: ImportProfileOptions,
    pub file_name: String,
    pub format: SourceFormat,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub enum ImportError {
    Csv {
        file_name: String,
        message: String,
    },
    Excel {
        file_name: String,
        message: String,
    },
    EmptySource(String),
    MissingWorksheet(String),
    MissingCell {
        location: SourceLocation,
    },
    InvalidValue {
        location: SourceLocation,
        value: String,
        expected: &'static str,
    },
    InvalidRow {
        location: SourceLocation,
        role: &'static str,
        actual_columns: usize,
        expected_columns: usize,
    },
    InvalidConstraint {
        location: SourceLocation,
        message: &'static str,
    },
    DuplicateId {
        location: SourceLocation,
        first_location: SourceLocation,
        label: &'static str,
        id: u32,
    },
    DuplicateLoadPointPositions(DuplicateLoadPointPositions),
    InvalidPileTipLevels(Vec<InvalidSourcePileTipLevel>),
    Validation(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct InvalidSourcePileTipLevel {
    pub location: SourceLocation,
    pub value: String,
    pub reason: PileTipLevelPrecisionErrorReason,
}

impl fmt::Display for ImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Csv { file_name, message } => {
                write!(formatter, "{file_name}: invalid CSV data: {message}")
            }
            Self::Excel { file_name, message } => {
                write!(formatter, "{file_name}: invalid Excel workbook: {message}")
            }
            Self::EmptySource(source) => write!(formatter, "Import source is empty: {source}"),
            Self::MissingWorksheet(workbook) => {
                write!(formatter, "Workbook has no readable worksheet: {workbook}")
            }
            Self::MissingCell { location } => {
                write_location(formatter, location)?;
                formatter.write_str(": cell is missing.")
            }
            Self::InvalidValue {
                location,
                value,
                expected,
            } => {
                write_location(formatter, location)?;
                if value.trim().is_empty() {
                    write!(formatter, ": value is empty; expected {expected}.")
                } else {
                    write!(formatter, ": invalid value '{value}'; expected {expected}.")
                }
            }
            Self::InvalidRow {
                location,
                role,
                actual_columns,
                expected_columns,
            } => {
                write_location(formatter, location)?;
                write!(
                    formatter,
                    ": {role} row has {actual_columns} columns; expected at least {expected_columns}."
                )
            }
            Self::InvalidConstraint { location, message } => {
                write_location(formatter, location)?;
                write!(formatter, ": {message}.")
            }
            Self::DuplicateId {
                location,
                first_location,
                label,
                id,
            } => {
                write_location(formatter, location)?;
                write!(formatter, ": duplicate {label} ID {id}")?;
                if let Some(row) = first_location.row {
                    write!(formatter, "; first defined at row {row}.")?;
                    return Ok(());
                }
                formatter.write_str(".")
            }
            Self::DuplicateLoadPointPositions(error) => error.fmt(formatter),
            Self::InvalidPileTipLevels(values) => {
                if let Some(first) = values.first() {
                    write_location(formatter, &first.location)?;
                    write!(
                        formatter,
                        ": invalid pile tip level '{}' ({:?})",
                        first.value, first.reason
                    )?;
                    if values.len() > 1 {
                        write!(formatter, "; {} invalid values in total", values.len())?;
                    }
                    formatter.write_str(".")
                } else {
                    formatter.write_str("Invalid pile tip levels.")
                }
            }
            Self::Validation(message) => formatter.write_str(message),
        }
    }
}

fn write_location(formatter: &mut fmt::Formatter<'_>, location: &SourceLocation) -> fmt::Result {
    formatter.write_str(&location.file_name)?;
    if let Some(sheet_name) = &location.sheet_name {
        write!(formatter, " > {sheet_name}")?;
    }
    if let Some(row) = location.row {
        write!(formatter, ", row {row}")?;
    }
    if let Some(column_name) = location.column_name {
        write!(formatter, ", {column_name}")?;
    }
    if let Some(column) = location.column {
        write!(formatter, " (column {column})")?;
    }
    Ok(())
}

impl std::error::Error for ImportError {}

impl ImportRole {
    fn label(self) -> &'static str {
        match self {
            Self::LoadPoints => "load points",
            Self::Cpts => "CPTs",
            Self::BearingCapacities => "bearing capacities",
        }
    }
}

fn build_imported_project(
    project_name: String,
    load_points: Vec<ProjectLoadPoint>,
    cpts: Vec<ProjectCpt>,
    bearing_capacities: Vec<ProjectBearingCapacity>,
    import_log: Vec<ProjectImportLogEntry>,
    pile_head_level_m: Option<f64>,
    currency_code: &str,
) -> Result<PilePlanProject, ImportError> {
    let active_pile_sizes = unique_sorted_pile_sizes(&bearing_capacities);
    let active_pile_tip_levels = unique_sorted_tip_levels(&bearing_capacities)?;
    let optimization = crate::IlpOptimizationSettings::default();
    Ok(PilePlanProject {
        schema: "IFCPP".to_string(),
        schema_version: 5,
        application: ProjectApplication {
            name: APPLICATION_NAME.to_string(),
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
            costs: currency_code.to_string(),
        },
        inputs: ProjectInputs {
            load_points,
            cpts,
            bearing_capacities,
        },
        settings: ProjectSettings {
            ilp_optimization: Some(optimization),
            global_cpt_selection: CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 25.0,
                monopoly_distance_m: 1.0,
                max_angle_degrees: 120.0,
            },
            cpt_selection_by_load_point: HashMap::new(),
            load_point_grouping: Default::default(),
            pile_costs: PileCostSettings {
                schema_version: 2,
                items: vec![],
            },
            pile_head_level_m,
            legacy_optimization: Default::default(),
            viewer_utilization: Default::default(),
            pile_legend: None,
            viewer: Default::default(),
        },
        user_state: ProjectUserState::with_default_pile_plan(
            HashMap::new(),
            HashMap::new(),
            active_pile_sizes,
            active_pile_tip_levels,
        ),
        import_log,
    })
}

fn source_for_role(
    sources: &[ImportSource],
    role: ImportRole,
) -> Result<&ImportSource, ImportError> {
    let mut matches = sources.iter().filter(|source| source.role == role);
    let source = matches.next().ok_or_else(|| {
        ImportError::Validation(format!("Missing import source for {}.", role.label()))
    })?;
    if let Some(other) = matches.next() {
        return Err(ImportError::Validation(format!(
            "Multiple import sources assigned to {}: {}, {}.",
            role.label(),
            source.file_name,
            other.file_name
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
        source_profile: Some(source.profile),
        profile_details: HashMap::new(),
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

fn import_warnings(
    capacity_table: &SourceTable,
    empty_frd_rows: &[usize],
    reconciliation: &ImportReconciliation,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if !empty_frd_rows.is_empty() {
        warnings.push(empty_frd_warning(capacity_table, empty_frd_rows));
    }
    warnings.extend(reconciliation_warnings(reconciliation));
    warnings
}

fn empty_frd_warning(table: &SourceTable, rows: &[usize]) -> String {
    let source = match &table.sheet_name {
        Some(sheet_name) => format!("{} > {sheet_name}", table.file_name),
        None => table.file_name.clone(),
    };
    let shown_rows = rows
        .iter()
        .take(10)
        .map(usize::to_string)
        .collect::<Vec<_>>()
        .join(", ");
    let remaining = rows.len().saturating_sub(10);
    let row_list = if remaining > 0 {
        format!("{shown_rows}; and {remaining} more")
    } else {
        shown_rows
    };
    let row_label = if rows.len() == 1 { "row" } else { "rows" };
    format!(
        "Ignored {} bearing-capacity {row_label} with an empty FRD in {source} (rows {row_list}). These configurations are treated as Missing.",
        rows.len()
    )
}

fn join_ids(ids: &[u32]) -> String {
    ids.iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(", ")
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

fn unique_sorted_tip_levels(
    bearing_capacities: &[ProjectBearingCapacity],
) -> Result<Vec<f64>, ImportError> {
    let mut keys = Vec::with_capacity(bearing_capacities.len());
    for (index, capacity) in bearing_capacities.iter().enumerate() {
        keys.push(
            crate::try_pile_tip_level_mm(capacity.pile_tip_level_m).map_err(|error| {
                ImportError::InvalidPileTipLevels(vec![InvalidSourcePileTipLevel {
                    location: SourceLocation {
                        file_name: format!("project inputs (CPT {})", capacity.cpt_id),
                        sheet_name: None,
                        row: Some(index + 1),
                        column: None,
                        column_name: Some("Tip"),
                    },
                    value: error.value,
                    reason: error.reason,
                }])
            })?,
        );
    }
    keys.sort_unstable_by(|left, right| right.cmp(left));
    keys.dedup();
    Ok(keys.into_iter().map(crate::pile_tip_level_m).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_source_defaults_to_automatic_profile() {
        let source: ImportSource = serde_json::from_value(serde_json::json!({
            "role": "load-points",
            "file_name": "loads.csv",
            "format": "csv",
            "bytes": [49, 44, 48]
        }))
        .unwrap();

        assert_eq!(source.profile, ImportProfile::Auto);
        assert_eq!(source.profile_options, ImportProfileOptions::default());
    }

    #[test]
    fn old_import_log_entry_defaults_profile_provenance() {
        let entry: ProjectImportLogEntry = serde_json::from_value(serde_json::json!({
            "source_file": "loads.csv",
            "imported_at": null,
            "sheet_name": null,
            "mapped_columns": {},
            "warnings": []
        }))
        .unwrap();

        assert_eq!(entry.source_profile, None);
        assert!(entry.profile_details.is_empty());
    }

    #[test]
    fn import_preview_contract_round_trips_rfem_details() {
        let preview = ImportSourcePreview {
            role: ImportRole::LoadPoints,
            requested_profile: ImportProfile::Auto,
            detected_profile: ImportProfile::RfemExport,
            resolved_profile: Some(ImportProfile::RfemExport),
            available_profiles: vec![ImportProfile::StandardTable, ImportProfile::RfemExport],
            resolved_options: ImportProfileOptions {
                coordinate_sheet: Some("1.1 Knopen".to_string()),
                reaction_sheet: Some("RC1".to_string()),
            },
            item_count: 328,
            diagnostics: vec![ImportDiagnostic {
                severity: ImportDiagnosticSeverity::Warning,
                code: ImportDiagnosticCode::ReactionNodesWithoutCoordinates,
                count: 1,
                node_ids: vec![999],
                load_point_names: vec![],
                x_mm: None,
                y_mm: None,
                location: Some(ImportDiagnosticLocation {
                    file_name: "Export RFEM.xlsx".to_string(),
                    sheet_name: Some("RC1".to_string()),
                    row: None,
                    column: None,
                    column_name: None,
                }),
                pile_tip_levels: vec![],
                fallback_message: "One node was skipped".to_string(),
            }],
            details: Some(ImportPreviewDetails::RfemExport(RfemPreviewDetails {
                coordinate_sheet_candidates: vec!["1.1 Knopen".to_string()],
                reaction_sheet_candidates: vec!["RC1".to_string()],
                selected_coordinate_sheet: Some("1.1 Knopen".to_string()),
                selected_reaction_sheet: Some("RC1".to_string()),
                load_rule: "abs-min-pz-prime".to_string(),
            })),
        };

        let value = serde_json::to_value(&preview).unwrap();
        let restored: ImportSourcePreview = serde_json::from_value(value).unwrap();

        assert_eq!(restored, preview);
    }

    #[test]
    fn available_profiles_depend_on_role_and_format() {
        assert_eq!(
            available_profiles(ImportRole::LoadPoints, SourceFormat::Xlsx),
            vec![ImportProfile::StandardTable, ImportProfile::RfemExport]
        );
        assert_eq!(
            available_profiles(ImportRole::LoadPoints, SourceFormat::Csv),
            vec![ImportProfile::StandardTable]
        );
        assert_eq!(
            available_profiles(ImportRole::Cpts, SourceFormat::Xlsx),
            vec![ImportProfile::StandardTable]
        );
    }

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
        let table =
            read_source_table("loads.csv", SourceFormat::Csv, b"1,0,0,100\n\n2,1,1,200\n").unwrap();

        assert_eq!(table.rows[1].number, 3);
    }

    #[test]
    fn reports_empty_capacity_value_with_csv_location() {
        let table = read_source_table(
            "capacities.csv",
            SourceFormat::Csv,
            b"CPT ID,Tip,Size,FRD\n61,-17.5,290,\n",
        )
        .unwrap();

        let result = parse_bearing_capacities_with_diagnostics(&table).unwrap();
        assert!(result.bearing_capacities.is_empty());
        assert_eq!(result.empty_frd_rows, vec![2]);
    }

    #[test]
    fn empty_frd_does_not_hide_valid_capacity_for_same_configuration() {
        let table = read_source_table(
            "capacities.csv",
            SourceFormat::Csv,
            b"CPT ID,Tip,Size,FRD\n61,-17.5,290,\n61,-17.5,290,672\n",
        )
        .unwrap();

        let result = parse_bearing_capacities_with_diagnostics(&table).unwrap();
        assert_eq!(result.empty_frd_rows, vec![2]);
        assert_eq!(result.bearing_capacities.len(), 1);
        assert_eq!(result.bearing_capacities[0].frd_kn, 672.0);
    }

    #[test]
    fn reports_invalid_capacity_value_with_excel_location() {
        let table = SourceTable {
            file_name: "capacities.xlsx".to_string(),
            sheet_name: Some("Sheet1".to_string()),
            rows: vec![SourceRow {
                number: 84,
                cells: vec![text("61"), text("-17.5"), text("290"), text("abc")],
            }],
        };

        let error = parse_bearing_capacities(&table).unwrap_err();
        assert_eq!(
            error.to_string(),
            "capacities.xlsx > Sheet1, row 84, FRD (column 4): invalid value 'abc'; expected a number."
        );
    }

    #[test]
    fn reports_every_submillimetre_capacity_row_and_keeps_quarter_metres_valid() {
        let table = read_source_table(
            "capacities.csv",
            SourceFormat::Csv,
            b"CPT ID,Tip,Size,FRD\n61,-18.5004,290,700\n61,-18.25,290,710\n61,-19.0006,290,720\n",
        )
        .unwrap();

        let ImportError::InvalidPileTipLevels(values) =
            parse_bearing_capacities(&table).unwrap_err()
        else {
            panic!("expected invalid pile tip levels")
        };

        assert_eq!(
            values
                .iter()
                .map(|item| item.location.row)
                .collect::<Vec<_>>(),
            vec![Some(2), Some(4)]
        );
        assert_eq!(
            values
                .iter()
                .map(|item| item.value.as_str())
                .collect::<Vec<_>>(),
            vec!["-18.5004", "-19.0006"]
        );
    }

    #[test]
    fn reports_submillimetre_capacity_with_workbook_sheet_and_column() {
        let table = SourceTable {
            file_name: "capacities.xlsx".to_string(),
            sheet_name: Some("Advice".to_string()),
            rows: vec![SourceRow {
                number: 84,
                cells: vec![text("61"), text("-18.5004"), text("290"), text("700")],
            }],
        };

        let ImportError::InvalidPileTipLevels(values) =
            parse_bearing_capacities(&table).unwrap_err()
        else {
            panic!("expected invalid pile tip levels")
        };
        let invalid = &values[0];
        assert_eq!(invalid.location.file_name, "capacities.xlsx");
        assert_eq!(invalid.location.sheet_name.as_deref(), Some("Advice"));
        assert_eq!(invalid.location.row, Some(84));
        assert_eq!(invalid.location.column, Some(2));
        assert_eq!(invalid.location.column_name, Some("Tip"));
        assert_eq!(invalid.value, "-18.5004");
    }

    #[test]
    fn old_import_diagnostics_default_tip_level_occurrences_to_empty() {
        let diagnostic: ImportDiagnostic = serde_json::from_value(serde_json::json!({
            "severity": "error",
            "code": "invalid-required-value",
            "count": 1,
            "node_ids": [],
            "location": null,
            "fallback_message": "Invalid value"
        }))
        .unwrap();

        assert!(diagnostic.pile_tip_levels.is_empty());
    }

    #[test]
    fn reports_short_row_with_source_location() {
        let table =
            read_source_table("loads.csv", SourceFormat::Csv, b"ID,X,Y,FED\n1,100,200\n").unwrap();

        let error = parse_load_points(&table).unwrap_err();
        assert_eq!(
            error.to_string(),
            "loads.csv, row 2: load points row has 3 columns; expected at least 4."
        );
    }

    #[test]
    fn reports_duplicate_load_point_id_with_both_rows() {
        let table = read_source_table(
            "loads.csv",
            SourceFormat::Csv,
            b"ID,X,Y,FED\n42,0,0,100\n42,1,1,200\n",
        )
        .unwrap();

        let error = parse_load_points(&table).unwrap_err();
        assert_eq!(
            error.to_string(),
            "loads.csv, row 3, ID (column 1): duplicate load point ID 42; first defined at row 2."
        );
    }

    #[test]
    fn reports_zero_pile_size_at_its_source_cell() {
        let table = read_source_table(
            "capacities.csv",
            SourceFormat::Csv,
            b"CPT ID,Tip,Size,FRD\n61,-17.5,0,672\n",
        )
        .unwrap();

        let error = parse_bearing_capacities(&table).unwrap_err();
        assert_eq!(
            error.to_string(),
            "capacities.csv, row 2, Size (column 3): value must be greater than zero."
        );
    }

    #[test]
    fn reports_missing_import_role_with_user_facing_name() {
        let sources = vec![csv_source(
            ImportRole::LoadPoints,
            "loads.csv",
            "1,0,0,100\n",
        )];

        let error = import_project_from_sources("Missing", &sources, None, "EUR").unwrap_err();
        assert_eq!(error.to_string(), "Missing import source for CPTs.");
    }

    #[test]
    fn reports_duplicate_import_role_with_file_names() {
        let sources = vec![
            csv_source(ImportRole::LoadPoints, "loads-a.csv", "1,0,0,100\n"),
            csv_source(ImportRole::LoadPoints, "loads-b.csv", "2,0,0,100\n"),
        ];

        let error = source_for_role(&sources, ImportRole::LoadPoints).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Multiple import sources assigned to load points: loads-a.csv, loads-b.csv."
        );
    }

    #[test]
    fn reports_invalid_excel_with_file_name() {
        let error =
            read_source_table("broken.xlsx", SourceFormat::Xlsx, b"not an xlsx").unwrap_err();

        assert!(error
            .to_string()
            .starts_with("broken.xlsx: invalid Excel workbook:"));
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
                profile: ImportProfile::Auto,
                profile_options: ImportProfileOptions::default(),
                file_name: "loads.csv".to_string(),
                format: SourceFormat::Csv,
                bytes: include_bytes!("../../../../sample_project/Belastinglocaties.csv").to_vec(),
            },
            ImportSource {
                role: ImportRole::Cpts,
                profile: ImportProfile::Auto,
                profile_options: ImportProfileOptions::default(),
                file_name: "cpts.xlsx".to_string(),
                format: SourceFormat::Xlsx,
                bytes: include_bytes!("../../../../sample_project/Sonderingen.xlsx").to_vec(),
            },
            ImportSource {
                role: ImportRole::BearingCapacities,
                profile: ImportProfile::Auto,
                profile_options: ImportProfileOptions::default(),
                file_name: "capacities.xlsx".to_string(),
                format: SourceFormat::Xlsx,
                bytes: include_bytes!("../../../../sample_project/Draagvermogens.xlsx").to_vec(),
            },
        ];

        let project = import_project_from_sources("Mixed Project", &sources, None, "EUR").unwrap();

        assert_eq!(project.metadata.name, "Mixed Project");
        let optimization = project.settings.ilp_optimization.as_ref().unwrap();
        assert_eq!(optimization.max_pile_tip_levels, None);
        assert_eq!(optimization.max_pile_sizes, None);
        assert_eq!(optimization.max_pile_configurations, None);
        assert!(project.settings.viewer.show_tip_level_regions);
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

        let project = import_project_from_sources("Warnings", &sources, None, "EUR").unwrap();
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

    #[test]
    fn empty_frd_rows_are_persisted_as_one_bounded_warning() {
        let capacity_rows = (0..11)
            .map(|index| format!("61,-{},290,\n", 17.5 + index as f64 / 10.0))
            .collect::<String>();
        let sources = vec![
            csv_source(ImportRole::LoadPoints, "loads.csv", "1,0,0,100\n"),
            csv_source(ImportRole::Cpts, "cpts.csv", "61,0,0\n"),
            csv_source(
                ImportRole::BearingCapacities,
                "capacities.csv",
                &capacity_rows,
            ),
        ];

        let project = import_project_from_sources("Empty FRD", &sources, None, "EUR").unwrap();
        assert!(project.inputs.bearing_capacities.is_empty());
        assert!(project.import_log[2].warnings.iter().any(|warning| warning ==
            "Ignored 11 bearing-capacity rows with an empty FRD in capacities.csv (rows 1, 2, 3, 4, 5, 6, 7, 8, 9, 10; and 1 more). These configurations are treated as Missing."
        ));
    }

    fn csv_source(role: ImportRole, file_name: &str, contents: &str) -> ImportSource {
        ImportSource {
            role,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
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
}
