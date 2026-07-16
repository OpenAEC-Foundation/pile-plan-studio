use std::collections::HashMap;

use crate::{PilePlanProject, ProjectImportLogEntry, ProjectLoadPoint};

use super::{
    available_profiles, build_imported_project, capacity_columns, import_warnings,
    parse_bearing_capacities_with_diagnostics, parse_cpts, parse_load_points, provenance_entry,
    read_source_table,
    rfem::{analyze_rfem_load_points, detect_rfem_sheets},
    source_for_role,
    table::read_xlsx_tables,
    ImportDiagnostic, ImportDiagnosticCode, ImportDiagnosticSeverity, ImportError,
    ImportPreviewDetails, ImportProfile, ImportProfileOptions, ImportRole, ImportSource,
    ImportSourcePreview, RfemPreviewDetails, SourceFormat,
};

pub fn preview_import_source(source: &ImportSource) -> ImportSourcePreview {
    let available = available_profiles(source.role, source.format);
    let resolved = resolve_profile(source);
    match resolved {
        Ok(ImportProfile::RfemExport) => preview_rfem_source(source, available),
        Ok(ImportProfile::StandardTable) => preview_standard_source(source, available),
        Ok(ImportProfile::Auto) => unreachable!("automatic profile must resolve"),
        Err(message) => ImportSourcePreview {
            role: source.role,
            requested_profile: source.profile,
            detected_profile: fallback_detected_profile(source),
            resolved_profile: None,
            available_profiles: available,
            resolved_options: source.profile_options.clone(),
            item_count: 0,
            diagnostics: vec![error_diagnostic(
                ImportDiagnosticCode::UnsupportedProfileFormat,
                message,
            )],
            details: None,
        },
    }
}

pub fn import_project_from_profiled_sources(
    project_name: &str,
    sources: &[ImportSource],
) -> Result<PilePlanProject, ImportError> {
    let load_source = source_for_role(sources, ImportRole::LoadPoints)?;
    let cpt_source = source_for_role(sources, ImportRole::Cpts)?;
    let capacity_source = source_for_role(sources, ImportRole::BearingCapacities)?;

    let (load_points, load_log) = parse_load_source(load_source)?;
    let cpt_table = read_source_table(&cpt_source.file_name, cpt_source.format, &cpt_source.bytes)?;
    let cpts = parse_cpts(&cpt_table)?;
    let capacity_table = read_source_table(
        &capacity_source.file_name,
        capacity_source.format,
        &capacity_source.bytes,
    )?;
    let capacity_parse = parse_bearing_capacities_with_diagnostics(&capacity_table)?;
    let reconciliation =
        super::reconcile_imported_inputs(&load_points, &cpts, capacity_parse.bearing_capacities)?;

    let mut cpt_log = provenance_entry(cpt_source, cpt_table.sheet_name, super::cpt_columns());
    cpt_log.source_profile = Some(ImportProfile::StandardTable);
    let mut capacity_log = provenance_entry(
        capacity_source,
        capacity_table.sheet_name.clone(),
        capacity_columns(),
    );
    capacity_log.source_profile = Some(ImportProfile::StandardTable);
    capacity_log.warnings = import_warnings(
        &capacity_table,
        &capacity_parse.empty_frd_rows,
        &reconciliation,
    );

    Ok(build_imported_project(
        project_name.to_string(),
        load_points,
        cpts,
        reconciliation.bearing_capacities,
        vec![load_log, cpt_log, capacity_log],
    ))
}

fn parse_load_source(
    source: &ImportSource,
) -> Result<(Vec<ProjectLoadPoint>, ProjectImportLogEntry), ImportError> {
    match resolve_profile(source).map_err(ImportError::Validation)? {
        ImportProfile::StandardTable => {
            let table = read_source_table(&source.file_name, source.format, &source.bytes)?;
            let load_points = parse_load_points(&table)?;
            let mut log = provenance_entry(source, table.sheet_name, super::load_point_columns());
            log.source_profile = Some(ImportProfile::StandardTable);
            Ok((load_points, log))
        }
        ImportProfile::RfemExport => {
            let analysis = analyze_rfem_load_points(source)?;
            let warnings = rfem_warnings(&analysis);
            let mut mapped_columns = HashMap::new();
            mapped_columns.insert("RFEM node No.".to_string(), "id".to_string());
            mapped_columns.insert("RFEM X [m]".to_string(), "x_mm".to_string());
            mapped_columns.insert("RFEM Y [m]".to_string(), "y_mm".to_string());
            mapped_columns.insert("RFEM Min PZ'".to_string(), "design_load_kn".to_string());
            Ok((
                analysis.load_points,
                ProjectImportLogEntry {
                    source_file: source.file_name.clone(),
                    imported_at: None,
                    sheet_name: Some(analysis.reaction_sheet.clone()),
                    mapped_columns,
                    warnings,
                    source_role: Some(ImportRole::LoadPoints),
                    source_format: Some(source.format),
                    schema_version: Some("rfem-export-1".to_string()),
                    source_profile: Some(ImportProfile::RfemExport),
                    profile_details: HashMap::from([
                        ("coordinate_sheet".to_string(), analysis.coordinate_sheet),
                        ("reaction_sheet".to_string(), analysis.reaction_sheet),
                        ("load_rule".to_string(), "abs-min-pz-prime".to_string()),
                    ]),
                },
            ))
        }
        ImportProfile::Auto => unreachable!("automatic profile must resolve"),
    }
}

fn preview_standard_source(
    source: &ImportSource,
    available_profiles: Vec<ImportProfile>,
) -> ImportSourcePreview {
    let result =
        read_source_table(&source.file_name, source.format, &source.bytes).and_then(|table| {
            let item_count = match source.role {
                ImportRole::LoadPoints => parse_load_points(&table)?.len(),
                ImportRole::Cpts => parse_cpts(&table)?.len(),
                ImportRole::BearingCapacities => parse_bearing_capacities_with_diagnostics(&table)?
                    .bearing_capacities
                    .len(),
            };
            Ok((item_count, table.sheet_name))
        });
    match result {
        Ok((item_count, sheet_name)) => ImportSourcePreview {
            role: source.role,
            requested_profile: source.profile,
            detected_profile: ImportProfile::StandardTable,
            resolved_profile: Some(ImportProfile::StandardTable),
            available_profiles,
            resolved_options: ImportProfileOptions::default(),
            item_count,
            diagnostics: vec![],
            details: Some(ImportPreviewDetails::StandardTable { sheet_name }),
        },
        Err(error) => invalid_preview(
            source,
            ImportProfile::StandardTable,
            available_profiles,
            error,
        ),
    }
}

fn preview_rfem_source(
    source: &ImportSource,
    available_profiles: Vec<ImportProfile>,
) -> ImportSourcePreview {
    let tables = match read_xlsx_tables(&source.file_name, &source.bytes) {
        Ok(tables) => tables,
        Err(error) => {
            return invalid_preview(source, ImportProfile::RfemExport, available_profiles, error)
        }
    };
    let detection = detect_rfem_sheets(&tables);
    let selected_coordinate_sheet = selected_sheet(
        &detection.coordinate_candidates,
        source.profile_options.coordinate_sheet.as_deref(),
    );
    let selected_reaction_sheet = selected_sheet(
        &detection.reaction_candidates,
        source.profile_options.reaction_sheet.as_deref(),
    );
    let resolved_options = ImportProfileOptions {
        coordinate_sheet: selected_coordinate_sheet.clone(),
        reaction_sheet: selected_reaction_sheet.clone(),
    };
    let details = Some(ImportPreviewDetails::RfemExport(RfemPreviewDetails {
        coordinate_sheet_candidates: detection.coordinate_candidates.clone(),
        reaction_sheet_candidates: detection.reaction_candidates.clone(),
        selected_coordinate_sheet,
        selected_reaction_sheet,
        load_rule: "abs-min-pz-prime".to_string(),
    }));
    let mut diagnostics = sheet_diagnostics(&detection, &resolved_options);
    if diagnostics
        .iter()
        .any(|item| item.severity == ImportDiagnosticSeverity::Error)
    {
        return ImportSourcePreview {
            role: source.role,
            requested_profile: source.profile,
            detected_profile: ImportProfile::RfemExport,
            resolved_profile: None,
            available_profiles,
            resolved_options,
            item_count: 0,
            diagnostics,
            details,
        };
    }

    let mut resolved_source = source.clone();
    resolved_source.profile = ImportProfile::RfemExport;
    resolved_source.profile_options = resolved_options.clone();
    match analyze_rfem_load_points(&resolved_source) {
        Ok(analysis) => {
            diagnostics.extend(rfem_diagnostics(&analysis));
            ImportSourcePreview {
                role: source.role,
                requested_profile: source.profile,
                detected_profile: ImportProfile::RfemExport,
                resolved_profile: Some(ImportProfile::RfemExport),
                available_profiles,
                resolved_options,
                item_count: analysis.load_points.len(),
                diagnostics,
                details,
            }
        }
        Err(error) => invalid_preview_with_details(
            source,
            ImportProfile::RfemExport,
            available_profiles,
            resolved_options,
            details,
            error,
        ),
    }
}

fn resolve_profile(source: &ImportSource) -> Result<ImportProfile, String> {
    match source.profile {
        ImportProfile::Auto => match (source.role, source.format) {
            (ImportRole::LoadPoints, SourceFormat::Xlsx) => {
                let tables = read_xlsx_tables(&source.file_name, &source.bytes)
                    .map_err(|error| error.to_string())?;
                let detection = detect_rfem_sheets(&tables);
                if !detection.coordinate_candidates.is_empty()
                    || !detection.reaction_candidates.is_empty()
                {
                    Ok(ImportProfile::RfemExport)
                } else {
                    Ok(ImportProfile::StandardTable)
                }
            }
            _ => Ok(ImportProfile::StandardTable),
        },
        ImportProfile::RfemExport
            if source.role != ImportRole::LoadPoints || source.format != SourceFormat::Xlsx =>
        {
            Err("RFEM export requires an XLSX load-point source.".to_string())
        }
        profile => Ok(profile),
    }
}

fn fallback_detected_profile(source: &ImportSource) -> ImportProfile {
    if source.profile == ImportProfile::RfemExport {
        ImportProfile::RfemExport
    } else {
        ImportProfile::StandardTable
    }
}

fn selected_sheet(candidates: &[String], selected: Option<&str>) -> Option<String> {
    if let Some(selected) = selected {
        return candidates
            .iter()
            .find(|candidate| candidate.as_str() == selected)
            .cloned();
    }
    match candidates {
        [candidate] => Some(candidate.clone()),
        _ => None,
    }
}

fn sheet_diagnostics(
    detection: &super::rfem::RfemSheetDetection,
    options: &ImportProfileOptions,
) -> Vec<ImportDiagnostic> {
    let mut diagnostics = Vec::new();
    if detection.coordinate_candidates.is_empty() {
        diagnostics.push(error_diagnostic(
            ImportDiagnosticCode::MissingCoordinateSheet,
            "No RFEM coordinate worksheet was found.".to_string(),
        ));
    } else if options.coordinate_sheet.is_none() {
        diagnostics.push(error_diagnostic(
            ImportDiagnosticCode::AmbiguousCoordinateSheet,
            "Multiple RFEM coordinate worksheets were found.".to_string(),
        ));
    }
    if detection.reaction_candidates.is_empty() {
        diagnostics.push(error_diagnostic(
            ImportDiagnosticCode::MissingReactionSheet,
            "No RFEM reaction worksheet was found.".to_string(),
        ));
    } else if options.reaction_sheet.is_none() {
        diagnostics.push(error_diagnostic(
            ImportDiagnosticCode::AmbiguousReactionSheet,
            "Multiple RFEM reaction worksheets were found.".to_string(),
        ));
    }
    diagnostics
}

fn rfem_diagnostics(analysis: &super::rfem::AnalyzedRfemLoadPoints) -> Vec<ImportDiagnostic> {
    let mut diagnostics = Vec::new();
    push_warning(
        &mut diagnostics,
        ImportDiagnosticCode::ReactionNodesWithoutCoordinates,
        &analysis.reaction_nodes_without_coordinates,
        "RFEM reaction nodes without usable coordinates were skipped.",
    );
    push_warning(
        &mut diagnostics,
        ImportDiagnosticCode::CoordinateNodesWithoutReactions,
        &analysis.coordinate_nodes_without_reactions,
        "RFEM coordinate nodes without Min PZ' reactions were skipped.",
    );
    push_warning(
        &mut diagnostics,
        ImportDiagnosticCode::ExactCoordinateDuplicates,
        &analysis.exact_coordinate_duplicates,
        "Identical RFEM coordinate rows were deduplicated.",
    );
    push_warning(
        &mut diagnostics,
        ImportDiagnosticCode::ExactReactionDuplicates,
        &analysis.exact_reaction_duplicates,
        "Identical RFEM reaction rows were deduplicated.",
    );
    diagnostics
}

fn rfem_warnings(analysis: &super::rfem::AnalyzedRfemLoadPoints) -> Vec<String> {
    rfem_diagnostics(analysis)
        .into_iter()
        .map(|item| item.fallback_message)
        .collect()
}

fn push_warning(
    diagnostics: &mut Vec<ImportDiagnostic>,
    code: ImportDiagnosticCode,
    ids: &[u32],
    message: &str,
) {
    if ids.is_empty() {
        return;
    }
    diagnostics.push(ImportDiagnostic {
        severity: ImportDiagnosticSeverity::Warning,
        code,
        count: ids.len(),
        node_ids: ids.iter().copied().take(10).collect(),
        location: None,
        fallback_message: format!("{message} Count: {}.", ids.len()),
    });
}

fn invalid_preview(
    source: &ImportSource,
    detected_profile: ImportProfile,
    available_profiles: Vec<ImportProfile>,
    error: ImportError,
) -> ImportSourcePreview {
    invalid_preview_with_details(
        source,
        detected_profile,
        available_profiles,
        source.profile_options.clone(),
        None,
        error,
    )
}

fn invalid_preview_with_details(
    source: &ImportSource,
    detected_profile: ImportProfile,
    available_profiles: Vec<ImportProfile>,
    resolved_options: ImportProfileOptions,
    details: Option<ImportPreviewDetails>,
    error: ImportError,
) -> ImportSourcePreview {
    ImportSourcePreview {
        role: source.role,
        requested_profile: source.profile,
        detected_profile,
        resolved_profile: None,
        available_profiles,
        resolved_options,
        item_count: 0,
        diagnostics: vec![error_diagnostic(
            ImportDiagnosticCode::InvalidRequiredValue,
            error.to_string(),
        )],
        details,
    }
}

fn error_diagnostic(code: ImportDiagnosticCode, message: String) -> ImportDiagnostic {
    ImportDiagnostic {
        severity: ImportDiagnosticSeverity::Error,
        code,
        count: 1,
        node_ids: vec![],
        location: None,
        fallback_message: message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::{
        ImportProfile, ImportProfileOptions, ImportRole, ImportSource, SourceFormat,
    };

    #[test]
    fn automatic_profile_detects_rfem_fixture() {
        let preview = preview_import_source(&rfem_auto_source());

        assert_eq!(preview.detected_profile, ImportProfile::RfemExport);
        assert_eq!(preview.resolved_profile, Some(ImportProfile::RfemExport));
        assert!(preview.item_count > 0);
        assert!(!preview.has_errors());
    }

    #[test]
    fn automatic_profile_keeps_standard_csv_load_points() {
        let preview = preview_import_source(&csv_source(
            ImportRole::LoadPoints,
            "loads.csv",
            "1,0,0,100\n",
        ));

        assert_eq!(preview.resolved_profile, Some(ImportProfile::StandardTable));
        assert_eq!(preview.item_count, 1);
        assert!(!preview.has_errors());
    }

    #[test]
    fn preview_count_matches_final_rfem_import() {
        let load_source = rfem_auto_source();
        let preview = preview_import_source(&load_source);
        let project = import_project_from_profiled_sources(
            "RFEM Project",
            &[
                load_source,
                xlsx_source(
                    ImportRole::Cpts,
                    "Sonderingen.xlsx",
                    include_bytes!("../../../../sample_project/Sonderingen.xlsx"),
                ),
                xlsx_source(
                    ImportRole::BearingCapacities,
                    "Draagvermogens.xlsx",
                    include_bytes!("../../../../sample_project/Draagvermogens.xlsx"),
                ),
            ],
        )
        .unwrap();

        assert_eq!(preview.item_count, project.inputs.load_points.len());
    }

    #[test]
    fn rfem_import_records_profile_and_mapping_provenance() {
        let project = import_project_from_profiled_sources(
            "RFEM Project",
            &[
                rfem_auto_source(),
                xlsx_source(
                    ImportRole::Cpts,
                    "Sonderingen.xlsx",
                    include_bytes!("../../../../sample_project/Sonderingen.xlsx"),
                ),
                xlsx_source(
                    ImportRole::BearingCapacities,
                    "Draagvermogens.xlsx",
                    include_bytes!("../../../../sample_project/Draagvermogens.xlsx"),
                ),
            ],
        )
        .unwrap();
        let log = project
            .import_log
            .iter()
            .find(|entry| entry.source_role == Some(ImportRole::LoadPoints))
            .unwrap();

        assert_eq!(log.source_profile, Some(ImportProfile::RfemExport));
        assert_eq!(
            log.profile_details.get("load_rule").map(String::as_str),
            Some("abs-min-pz-prime")
        );
        assert!(log.profile_details.contains_key("coordinate_sheet"));
        assert!(log.profile_details.contains_key("reaction_sheet"));
    }

    #[test]
    fn rfem_provenance_survives_ifcpp_round_trip() {
        let project = import_project_from_profiled_sources(
            "RFEM Project",
            &[
                rfem_auto_source(),
                xlsx_source(
                    ImportRole::Cpts,
                    "Sonderingen.xlsx",
                    include_bytes!("../../../../sample_project/Sonderingen.xlsx"),
                ),
                xlsx_source(
                    ImportRole::BearingCapacities,
                    "Draagvermogens.xlsx",
                    include_bytes!("../../../../sample_project/Draagvermogens.xlsx"),
                ),
            ],
        )
        .unwrap();

        let json = crate::write_ifcpp_string(&project).unwrap();
        let reopened = crate::read_ifcpp_str(&json).unwrap();
        let log = reopened
            .import_log
            .iter()
            .find(|entry| entry.source_role == Some(ImportRole::LoadPoints))
            .unwrap();

        assert_eq!(log.source_profile, Some(ImportProfile::RfemExport));
        assert_eq!(
            log.profile_details.get("load_rule").map(String::as_str),
            Some("abs-min-pz-prime")
        );
        assert_eq!(
            log.profile_details.get("coordinate_sheet"),
            project.import_log[0]
                .profile_details
                .get("coordinate_sheet")
        );
        assert_eq!(
            log.profile_details.get("reaction_sheet"),
            project.import_log[0].profile_details.get("reaction_sheet")
        );
    }

    fn rfem_auto_source() -> ImportSource {
        ImportSource {
            role: ImportRole::LoadPoints,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
            file_name: "Export RFEM.xlsx".to_string(),
            format: SourceFormat::Xlsx,
            bytes: include_bytes!("../../../../sample_project/Export RFEM.xlsx").to_vec(),
        }
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

    fn xlsx_source(role: ImportRole, file_name: &str, contents: &[u8]) -> ImportSource {
        ImportSource {
            role,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
            file_name: file_name.to_string(),
            format: SourceFormat::Xlsx,
            bytes: contents.to_vec(),
        }
    }
}
