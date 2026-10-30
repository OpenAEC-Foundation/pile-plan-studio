use std::collections::HashMap;

use crate::{PilePlanProject, ProjectImportLogEntry, ProjectLoadPoint};

use super::{
    available_profiles, build_imported_project, parse_bearing_capacities_with_diagnostics,
    parse_cpts, provenance_entry,
    rfem::{analyze_rfem_load_points, detect_rfem_sheets},
    source_for_role,
    table::read_xlsx_tables,
    ImportDiagnostic, ImportDiagnosticCode, ImportDiagnosticSeverity, ImportError,
    ImportPileTipLevelDiagnostic, ImportPreviewDetails, ImportProfile, ImportProfileOptions,
    ImportRole, ImportSource, ImportSourcePreview, RfemPreviewDetails, SourceFormat,
};

pub fn preview_import_source(source: &ImportSource) -> ImportSourcePreview {
    let mut preview=preview_import_source_raw(source);
    if source.role==ImportRole::BearingCapacities{return preview;}
    if preview.detected_profile==ImportProfile::RfemExport{
        let mut resolved=source.clone();resolved.profile_options=preview.resolved_options.clone();
        if let Ok(analysis)=analyze_rfem_load_points(&resolved){
            let show_tension=resolved.profile_options.import_tension;
            let headers=if show_tension{vec!["ID","X [mm]","Y [mm]","FEd [kN]","FtEd [kN]"]}else{vec!["ID","X [mm]","Y [mm]","FEd [kN]"]};
            preview.table=Some(super::SourceTablePreview{
                sheets:vec![],settings:Default::default(),processed:true,row_count:analysis.load_points.len(),
                columns:headers.iter().enumerate().map(|(i,h)|super::SourceColumnPreview{column:i+1,header:h.to_string(),nonempty_count:analysis.load_points.len(),numeric_count:analysis.load_points.len()}).collect(),
                rows:analysis.load_points.iter().take(25).enumerate().map(|(i,p)|{let mut cells=vec![p.id.to_string(),p.x_mm.to_string(),p.y_mm.to_string(),p.design_load_kn.to_string()];if show_tension{cells.push(match p.tension{crate::TensionDemand::Known{value_kn}=>value_kn.to_string(),_=>String::new()});}super::SourcePreviewRow{number:i+1,cells}}).collect(),
            });
        }
        return preview;
    }
    match super::table_mapping::read_import_table(source){
        Ok((table,sheets))=>{
            let mut inspection=super::table_mapping::inspect_table(&table,source.role,source.profile_options.table.as_ref(),sheets);
            let mut resolved=source.clone();resolved.profile_options.table=Some(inspection.settings.clone());
            resolved.profile_options.import_tension=inspection.settings.columns.as_ref().is_some_and(|cols|cols.iter().any(|c|c.field=="tension"));
            resolved.profile_options.tension_column=resolved.profile_options.import_tension.then_some(5);
            preview=preview_import_source_raw(&resolved);
            super::table_mapping::include_diagnostic_rows(&table,&mut inspection,&preview.diagnostics);
            preview.table=Some(inspection);preview
        },
        Err(_)=>preview,
    }
}
fn preview_import_source_raw(source: &ImportSource) -> ImportSourcePreview {
    if source.role == ImportRole::BearingCapacities {
        let mut discovery = super::preview_advice_source(source);
        if source.format == SourceFormat::Csv {
            discovery
                .diagnostics
                .extend(discovery.sheets.iter().flat_map(|s| s.diagnostics.clone()));
        }
        let requested = source.profile;
        return ImportSourcePreview {
            table:None,
            role: source.role,
            requested_profile: requested,
            detected_profile: discovery
                .sheets
                .iter()
                .find_map(|s| s.detected_profile)
                .unwrap_or(ImportProfile::StandardTable),
            resolved_profile: if discovery.sheets.len() == 1 {
                discovery.sheets[0].resolved_profile
            } else {
                None
            },
            available_profiles: available_profiles(source.role, source.format),
            resolved_options: source.profile_options.clone(),
            item_count: discovery.sheets.iter().map(|s| s.summary.item_count).sum(),
            diagnostics: discovery.diagnostics.clone(),
            details: Some(ImportPreviewDetails::FoundationAdvice(discovery)),
        };
    }
    let available = available_profiles(source.role, source.format);
    let resolved = resolve_profile(source);
    match resolved {
        Ok(ImportProfile::RfemExport) => preview_rfem_source(source, available),
        Ok(ImportProfile::CapacityColumns) | Ok(ImportProfile::StandardTable) => {
            preview_standard_source(source, available)
        }
        Ok(ImportProfile::Auto) => unreachable!("automatic profile must resolve"),
        Err(message) => ImportSourcePreview {
            table:None,
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

pub fn import_project_from_sources(
    project_name: &str,
    sources: &[ImportSource],
    pile_head_level_m: Option<f64>,
    currency_code: &str,
) -> Result<PilePlanProject, ImportError> {
    let load_source = source_for_role(sources, ImportRole::LoadPoints)?;
    let cpt_source = source_for_role(sources, ImportRole::Cpts)?;
    if sources.iter().any(|s| {
        matches!(
            s.advice_operation,
            Some(super::AdviceImportOperation::Replace { .. })
        )
    }) {
        return Err(ImportError::Validation(
            "No existing advice to replace".into(),
        ));
    }
    let mut advice = super::advice::analyze_advice_sources(sources)?;
    if advice.logs.is_empty() {
        return Err(ImportError::Validation(
            "Select at least one foundation advice table".into(),
        ));
    }

    let (load_points, load_log) = parse_load_source(load_source)?;
    let cpt_table = super::table_mapping::mapped_table(cpt_source)?;
    let cpts = parse_cpts(&cpt_table).map_err(|e|if let Some(s)=&cpt_source.profile_options.table{super::table_mapping::map_error(e,s,cpt_source.role)}else{e})?;
    let reconciliation = super::reconcile_imported_inputs(&load_points, &cpts, advice.values)?;
    let mut cpt_log = provenance_entry(cpt_source, cpt_table.sheet_name, super::cpt_columns());
    cpt_log.source_profile = Some(ImportProfile::StandardTable);
    advice.logs[0]
        .warnings
        .extend(super::reconciliation_warnings(&reconciliation));
    let mut logs = vec![load_log, cpt_log];
    logs.extend(advice.logs);

    build_imported_project(
        project_name.to_string(),
        load_points,
        cpts,
        reconciliation.bearing_capacities,
        logs,
        pile_head_level_m,
        currency_code,
    )
}

pub(crate) fn parse_load_source(
    source: &ImportSource,
) -> Result<(Vec<ProjectLoadPoint>, ProjectImportLogEntry), ImportError> {
    match resolve_profile(source).map_err(ImportError::Validation)? {
        ImportProfile::StandardTable => {
            let table = super::table_mapping::mapped_table(source)?;
            let mut options=source.profile_options.clone();
            if let Some(settings)=&options.table{options.import_tension=settings.columns.as_ref().is_some_and(|cols|cols.iter().any(|c|c.field=="tension"));options.tension_column=Some(5);}
            let load_points = super::roles::parse_load_points_with_options(&table, &options).map_err(|e|if let Some(s)=&options.table{super::table_mapping::map_error(e,s,source.role)}else{e})?;
            crate::validate_unique_load_point_positions(&load_points)
                .map_err(ImportError::DuplicateLoadPointPositions)?;
            let mut log = provenance_entry(source, table.sheet_name, super::load_point_columns());
            log.source_profile = Some(ImportProfile::StandardTable);
            log.profile_details.insert(
                "import_tension".into(),
                source.profile_options.import_tension.to_string(),
            );
            if source.profile_options.import_tension {
                log.mapped_columns.insert(
                    format!(
                        "Column {}",
                        source.profile_options.tension_column.unwrap_or(5)
                    ),
                    "tension".into(),
                );
            }
            Ok((load_points, log))
        }
        ImportProfile::RfemExport => {
            let analysis = analyze_rfem_load_points(source)?;
            crate::validate_unique_load_point_positions(&analysis.load_points)
                .map_err(ImportError::DuplicateLoadPointPositions)?;
            let warnings = rfem_warnings(&analysis);
            let mut mapped_columns = HashMap::new();
            mapped_columns.insert("RFEM node No.".to_string(), "id".to_string());
            mapped_columns.insert("RFEM X [m]".to_string(), "x_mm".to_string());
            mapped_columns.insert("RFEM Y [m]".to_string(), "y_mm".to_string());
            mapped_columns.insert("RFEM Min PZ'".to_string(), "design_load_kn".to_string());
            if source.profile_options.import_tension {
                mapped_columns.insert("RFEM Max PZ'".into(), "tension".into());
            }
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
                        (
                            "vertical_reaction_evidence".into(),
                            serde_json::to_string(&analysis.reaction_evidence).unwrap(),
                        ),
                        (
                            "import_tension".into(),
                            source.profile_options.import_tension.to_string(),
                        ),
                        ("reaction_sheet".to_string(), analysis.reaction_sheet),
                        (
                            "load_rule".to_string(),
                            "signed-vertical-envelope".to_string(),
                        ),
                    ]),
                },
            ))
        }
        ImportProfile::CapacityColumns => Err(ImportError::Validation(
            "Capacity columns requires an advice source".into(),
        )),
        ImportProfile::Auto => unreachable!("automatic profile must resolve"),
    }
}

fn preview_standard_source(
    source: &ImportSource,
    available_profiles: Vec<ImportProfile>,
) -> ImportSourcePreview {
    let result =
        super::table_mapping::mapped_table(source).and_then(|table| {
            let (item_count, diagnostics) = match source.role {
                ImportRole::LoadPoints => {
                    let load_points = super::roles::parse_load_points_with_options(
                        &table,
                        &source.profile_options,
                    )?;
                    (load_points.len(), {
                        let mut diagnostics = duplicate_position_diagnostics(&load_points);
                        diagnostics.extend(tension_diagnostics(&load_points));
                        diagnostics
                    })
                }
                ImportRole::Cpts => (parse_cpts(&table)?.len(), Vec::new()),
                ImportRole::BearingCapacities => (
                    parse_bearing_capacities_with_diagnostics(&table)?
                        .bearing_capacities
                        .len(),
                    Vec::new(),
                ),
            };
            Ok((item_count, table.sheet_name, diagnostics))
        }).map_err(|e|if let Some(settings)=&source.profile_options.table{super::table_mapping::map_error(e,settings,source.role)}else{e});
    match result {
        Ok((item_count, sheet_name, diagnostics)) => ImportSourcePreview {
            table:None,
            role: source.role,
            requested_profile: source.profile,
            detected_profile: ImportProfile::StandardTable,
            resolved_profile: Some(ImportProfile::StandardTable),
            available_profiles,
            resolved_options: source.profile_options.clone(),
            item_count,
            diagnostics,
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
        table:None,
        import_tension: source.profile_options.import_tension,
        clear_tension: source.profile_options.clear_tension,
        tension_column: source.profile_options.tension_column,
        resistance_direction: source.profile_options.resistance_direction,
        advice_sheets: None,
        coordinate_sheet: selected_coordinate_sheet.clone(),
        reaction_sheet: selected_reaction_sheet.clone(),
    };
    let details = Some(ImportPreviewDetails::RfemExport(RfemPreviewDetails {
        coordinate_sheet_candidates: detection.coordinate_candidates.clone(),
        reaction_sheet_candidates: detection.reaction_candidates.clone(),
        selected_coordinate_sheet,
        selected_reaction_sheet,
        load_rule: "signed-vertical-envelope".to_string(),
    }));
    let mut diagnostics = sheet_diagnostics(&detection, &resolved_options);
    if diagnostics
        .iter()
        .any(|item| item.severity == ImportDiagnosticSeverity::Error)
    {
        return ImportSourcePreview {
            table:None,
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
                table:None,
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
        ImportProfile::CapacityColumns => {
            Err("Capacity columns requires an XLSX foundation advice source".into())
        }
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
    diagnostics.extend(tension_diagnostics(&analysis.load_points));
    diagnostics.extend(duplicate_position_diagnostics(&analysis.load_points));
    diagnostics
}

fn tension_diagnostics(points: &[ProjectLoadPoint]) -> Vec<ImportDiagnostic> {
    let ids = points
        .iter()
        .filter(|p| p.tension == crate::TensionDemand::Missing)
        .map(|p| p.id)
        .collect::<Vec<_>>();
    let mut result = vec![];
    push_warning(
        &mut result,
        ImportDiagnosticCode::MissingTensionDemand,
        &ids,
        "Tension import selected, but tension demand is missing for these locations.",
    );
    result
}
fn duplicate_position_diagnostics(load_points: &[ProjectLoadPoint]) -> Vec<ImportDiagnostic> {
    crate::duplicate_load_point_positions(load_points)
        .into_iter()
        .map(|duplicate| {
            let node_ids = duplicate
                .load_points
                .iter()
                .map(|member| member.id)
                .collect::<Vec<_>>();
            let load_point_names = duplicate
                .load_points
                .iter()
                .map(|member| member.name.clone())
                .collect::<Vec<_>>();
            ImportDiagnostic {
                severity: ImportDiagnosticSeverity::Error,
                code: ImportDiagnosticCode::DuplicateLoadPointPosition,
                count: node_ids.len(),
                advice: None,
                fallback_message: format!(
                    "Load points {} share position ({}, {}) mm. Every load point must have a unique position.",
                    node_ids.iter().map(u32::to_string).collect::<Vec<_>>().join(", "),
                    duplicate.x_mm,
                    duplicate.y_mm,
                ),
                node_ids,
                load_point_names,
                x_mm: Some(duplicate.x_mm),
                y_mm: Some(duplicate.y_mm),
                location: None,
                pile_tip_levels: vec![],
            }
        })
        .collect()
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
        load_point_names: vec![],
        x_mm: None,
        y_mm: None,
        location: None,
        pile_tip_levels: vec![],
        advice: None,
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
        table:None,
        role: source.role,
        requested_profile: source.profile,
        detected_profile,
        resolved_profile: None,
        available_profiles,
        resolved_options,
        item_count: 0,
        diagnostics: vec![import_error_diagnostic(error)],
        details,
    }
}

fn import_error_diagnostic(error: ImportError) -> ImportDiagnostic {
    let fallback_message = error.to_string();
    match error {
        ImportError::InvalidPileTipLevels(values) => ImportDiagnostic {
            advice: None,
            severity: ImportDiagnosticSeverity::Error,
            code: ImportDiagnosticCode::InvalidPileTipLevelPrecision,
            count: values.len(),
            node_ids: vec![],
            load_point_names: vec![],
            x_mm: None,
            y_mm: None,
            location: values.first().map(|item| (&item.location).into()),
            pile_tip_levels: values
                .iter()
                .map(|item| ImportPileTipLevelDiagnostic {
                    location: (&item.location).into(),
                    value: item.value.clone(),
                    reason: item.reason,
                })
                .collect(),
            fallback_message,
        },
        error => {
            let location=match &error{
                ImportError::InvalidValue{location,..}|ImportError::MissingCell{location}|ImportError::InvalidConstraint{location,..}|ImportError::InvalidRow{location,..}=>Some(location.into()),_=>None
            };
            let mut diagnostic=error_diagnostic(ImportDiagnosticCode::InvalidRequiredValue,fallback_message);diagnostic.location=location;diagnostic
        },
    }
}

pub(super) fn error_diagnostic(code: ImportDiagnosticCode, message: String) -> ImportDiagnostic {
    ImportDiagnostic {
        severity: ImportDiagnosticSeverity::Error,
        code,
        count: 1,
        node_ids: vec![],
        load_point_names: vec![],
        x_mm: None,
        y_mm: None,
        location: None,
        pile_tip_levels: vec![],
        advice: None,
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
    fn standard_preview_reports_each_duplicate_load_point_position() {
        let preview = preview_import_source(&csv_source(
            ImportRole::LoadPoints,
            "loads.csv",
            "8,10000,20000,100\n2,10000.0,20000.000,200\n",
        ));

        assert_eq!(preview.resolved_profile, Some(ImportProfile::StandardTable));
        assert_eq!(preview.item_count, 2);
        assert!(preview.has_errors());
        let diagnostic = &preview.diagnostics[0];
        assert_eq!(
            diagnostic.code,
            ImportDiagnosticCode::DuplicateLoadPointPosition
        );
        assert_eq!(diagnostic.node_ids, vec![2, 8]);
        assert_eq!(diagnostic.x_mm, Some(10_000.0));
        assert_eq!(diagnostic.y_mm, Some(20_000.0));
        assert_eq!(
            diagnostic.load_point_names,
            vec!["Load point 2", "Load point 8"]
        );
    }

    #[test]
    fn standard_preview_reports_every_submillimetre_tip_level() {
        let preview = preview_import_source(&csv_source(
            ImportRole::BearingCapacities,
            "capacities.csv",
            "CPT ID,Tip,Size,FRD\n61,-18.5004,290,700\n61,-18.25,290,710\n61,-19.0006,290,720\n",
        ));

        assert!(preview.has_errors());
        let diagnostic = &preview.diagnostics[0];
        assert_eq!(
            diagnostic.code,
            ImportDiagnosticCode::InvalidPileTipLevelPrecision
        );
        assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Error);
        assert_eq!(diagnostic.count, 2);
        assert_eq!(diagnostic.pile_tip_levels.len(), 2);
        assert_eq!(diagnostic.pile_tip_levels[0].value, "-18.5004");
        assert_eq!(diagnostic.pile_tip_levels[0].location.row, Some(2));
        assert_eq!(diagnostic.pile_tip_levels[1].value, "-19.0006");
        assert_eq!(diagnostic.pile_tip_levels[1].location.row, Some(4));
    }

    #[test]
    fn rfem_diagnostics_distinguish_position_conflicts_from_repeated_rows() {
        let analysis = super::super::rfem::AnalyzedRfemLoadPoints {
            reaction_evidence: vec![],
            load_points: vec![
                ProjectLoadPoint {
                    id: 8,
                    name: "Load point 8".to_string(),
                    x_mm: 10_000.0,
                    y_mm: 20_000.0,
                    design_load_kn: 100.0,
                    tension: Default::default(),
                },
                ProjectLoadPoint {
                    id: 2,
                    name: "Load point 2".to_string(),
                    x_mm: 10_000.0,
                    y_mm: 20_000.0,
                    design_load_kn: 200.0,
                    tension: Default::default(),
                },
            ],
            coordinate_sheet: "Coordinates".to_string(),
            reaction_sheet: "Reactions".to_string(),
            coordinate_nodes_without_reactions: vec![],
            reaction_nodes_without_coordinates: vec![],
            exact_coordinate_duplicates: vec![8],
            exact_reaction_duplicates: vec![],
        };

        let diagnostics = rfem_diagnostics(&analysis);

        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == ImportDiagnosticCode::ExactCoordinateDuplicates
                && diagnostic.severity == ImportDiagnosticSeverity::Warning
                && diagnostic.node_ids == vec![8]
        }));
        assert!(diagnostics.iter().any(|diagnostic| {
            diagnostic.code == ImportDiagnosticCode::DuplicateLoadPointPosition
                && diagnostic.severity == ImportDiagnosticSeverity::Error
                && diagnostic.node_ids == vec![2, 8]
        }));
    }

    #[test]
    fn preview_count_matches_final_rfem_import() {
        let load_source = rfem_auto_source();
        let preview = preview_import_source(&load_source);
        let project = import_project_from_sources(
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
                    &super::super::test_support::capacity_workbook(),
                ),
            ],
            None,
            "EUR",
        )
        .unwrap();

        assert_eq!(preview.item_count, project.inputs.load_points.len());
    }

    #[test]
    fn rfem_import_records_profile_and_mapping_provenance() {
        let project = import_project_from_sources(
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
                    &super::super::test_support::capacity_workbook(),
                ),
            ],
            None,
            "EUR",
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
            Some("signed-vertical-envelope")
        );
        assert!(log.profile_details.contains_key("coordinate_sheet"));
        assert!(log.profile_details.contains_key("reaction_sheet"));
    }

    #[test]
    fn rfem_provenance_survives_ifcpp_round_trip() {
        let project = import_project_from_sources(
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
                    &super::super::test_support::capacity_workbook(),
                ),
            ],
            None,
            "EUR",
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
            Some("signed-vertical-envelope")
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
            advice_operation: None,
            source_id: None,
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
            advice_operation: None,
            source_id: None,
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
            advice_operation: None,
            source_id: None,
            role,
            profile: ImportProfile::Auto,
            profile_options: ImportProfileOptions::default(),
            file_name: file_name.to_string(),
            format: SourceFormat::Xlsx,
            bytes: contents.to_vec(),
        }
    }
}
