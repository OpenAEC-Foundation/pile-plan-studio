use super::advice_merge::{merge_advice_values, SourcedCapacity};
use super::capacity_columns::{parse_capacity_columns, LocatedCapacity, ParsedAdviceTable};
use super::*;
use crate::{
    try_pile_tip_level_mm, PreviewProjectImportRequest, ProjectBearingCapacity,
    ProjectImportLogEntry,
};
use std::collections::{BTreeSet, HashSet};

#[derive(Debug)]
pub(super) struct AdviceAnalysis {
    pub values: Vec<ProjectBearingCapacity>,
    pub exact_duplicate_count: usize,
    pub logs: Vec<ProjectImportLogEntry>,
    pub sourced_values: Vec<SourcedCapacity>,
}

pub(super) fn diagnostic(error: &ImportError) -> ImportDiagnostic {
    if let ImportError::Advice(f) = error {
        if let Some(d) = f.diagnostics.first() {
            return d.clone();
        }
    }
    let mut d = super::pipeline::error_diagnostic(
        ImportDiagnosticCode::InvalidRequiredValue,
        error.to_string(),
    );
    match error {
        ImportError::InvalidValue { location, .. }
        | ImportError::MissingCell { location }
        | ImportError::InvalidConstraint { location, .. }
        | ImportError::InvalidRow { location, .. } => d.location = Some(location.into()),
        ImportError::InvalidPileTipLevels(values) => {
            d.code = ImportDiagnosticCode::InvalidPileTipLevelPrecision;
            d.count = values.len();
            d.pile_tip_levels = values
                .iter()
                .map(|v| ImportPileTipLevelDiagnostic {
                    location: (&v.location).into(),
                    value: v.value.clone(),
                    reason: v.reason,
                })
                .collect();
        }
        ImportError::Validation(_) => d.code = ImportDiagnosticCode::InvalidAdviceSelection,
        _ => {}
    }
    d
}
impl ImportError {
    pub fn to_source_import_failure(&self) -> SourceImportFailure {
        if let Self::Advice(f) = self {
            return f.clone();
        }
        SourceImportFailure {
            unique_value_count: 0,
            exact_duplicate_count: 0,
            message: self.to_string(),
            diagnostics: vec![diagnostic(self)],
            conflicts: vec![],
        }
    }
}
fn source_tables(source: &ImportSource) -> Result<Vec<SourceTable>, ImportError> {
    if source.role != ImportRole::BearingCapacities
        || ![
            ImportProfile::Auto,
            ImportProfile::StandardTable,
            ImportProfile::CapacityColumns,
        ]
        .contains(&source.profile)
        || (source.format == SourceFormat::Csv
            && (source.profile == ImportProfile::CapacityColumns
                || source.profile_options.advice_sheets.is_some()))
    {
        return Err(ImportError::Validation(
            "Unsupported foundation advice profile or format".into(),
        ));
    }
    match source.format {
        SourceFormat::Xlsx => table::read_xlsx_tables(&source.file_name, &source.bytes),
        SourceFormat::Csv => Ok(vec![read_source_table(
            &source.file_name,
            source.format,
            &source.bytes,
        )?]),
    }
}
fn normalized_advice_values(table: &SourceTable) -> SourceTable {
    let mut result = table.clone();
    for row in &mut result.rows {
        for cell in &mut row.cells {
            if let TableCell::Text(t) = cell {
                *t = t.trim().into();
            }
        }
    }
    result
}
fn parse_table(
    table: &SourceTable,
    profile: ImportProfile,
    format: SourceFormat,
) -> Result<(ImportProfile, ParsedAdviceTable), ImportError> {
    let original = table;
    let mut normalized;
    let table = if format == SourceFormat::Xlsx {
        use super::advice_layout::{classify_advice_table, resolve_advice_layout, AdviceLayout};
        let layout = resolve_advice_layout(classify_advice_table(table)?, profile, table)?;
        if let AdviceLayout::CapacityColumns { layout, .. } = layout {
            return parse_capacity_columns(table, &layout)
                .map(|p| (ImportProfile::CapacityColumns, p));
        }
        normalized = normalized_advice_values(table);
        if matches!(layout, AdviceLayout::Standard { header_row: None }) {
            normalized.rows.insert(
                0,
                SourceRow {
                    number: 0,
                    cells: ["ID", "Tip", "Size", "FRD"]
                        .into_iter()
                        .map(|v| TableCell::Text(v.into()))
                        .collect(),
                },
            );
        }
        &normalized
    } else {
        table
    };
    parse_standard_table(table).map_err(|e| {
        ImportError::Advice(SourceImportFailure {
            unique_value_count: 0,
            exact_duplicate_count: 0,
            message: e.to_string(),
            diagnostics: vec![super::advice_diagnostics::diagnostic_for_table(
                &e, original,
            )],
            conflicts: vec![],
        })
    })
}
fn parse_standard_table(
    table: &SourceTable,
) -> Result<(ImportProfile, ParsedAdviceTable), ImportError> {
    let parsed = super::roles::parse_bearing_capacities_with_diagnostics(table)?;
    let mut data_rows = table.rows.iter().skip(usize::from(
        table
            .rows
            .first()
            .and_then(|r| r.cells.first())
            .is_some_and(|c| c.as_text().parse::<f64>().is_err()),
    ));
    let mut result = ParsedAdviceTable {
        mapped_columns: capacity_columns()
            .iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect(),
        ..Default::default()
    };
    let mut values = parsed.bearing_capacities.into_iter();
    for row in &mut data_rows {
        let empty = row.cells.get(3).is_none_or(TableCell::is_empty);
        if empty && table.has_formula(row.number, 4) {
            return Err(ImportError::InvalidValue {
                location: table.location(Some(row.number), Some(4), None),
                value: String::new(),
                expected: "cached formula result",
            });
        }
        if empty {
            result.missing_cells.push((row.number, 4));
        } else if let Some(capacity) = values.next() {
            result.values.push(LocatedCapacity {
                capacity,
                row: row.number,
                column: 4,
            });
        }
    }
    Ok((ImportProfile::StandardTable, result))
}
fn summary(parsed: &ParsedAdviceTable) -> AdviceTableSummary {
    let tips: Vec<_> = parsed
        .values
        .iter()
        .filter_map(|v| try_pile_tip_level_mm(v.capacity.pile_tip_level_m).ok())
        .collect();
    AdviceTableSummary {
        item_count: parsed.values.len(),
        cpt_count: parsed
            .values
            .iter()
            .map(|v| v.capacity.cpt_id)
            .collect::<BTreeSet<_>>()
            .len(),
        pile_sizes_mm: parsed
            .values
            .iter()
            .map(|v| v.capacity.pile_size_mm)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        min_tip_level_mm: tips.iter().min().copied(),
        max_tip_level_mm: tips.iter().max().copied(),
        missing_cell_count: parsed.missing_cells.len(),
    }
}
pub fn preview_advice_source(source: &ImportSource) -> AdviceSourcePreview {
    let mut result = AdviceSourcePreview {
        source_id: source
            .source_id
            .clone()
            .unwrap_or_else(|| "legacy-source-0".into()),
        ..Default::default()
    };
    match source_tables(source) {
        Err(e) => result.diagnostics.push(diagnostic(&e)),
        Ok(tables) => {
            for table in tables {
                let name = table.sheet_name.clone().unwrap_or_default();
                let requested = source
                    .profile_options
                    .advice_sheets
                    .as_ref()
                    .and_then(|s| s.iter().find(|s| s.sheet_name == name))
                    .map(|s| s.profile)
                    .unwrap_or(source.profile);

                let mut preview = AdviceSheetPreview {
                    sheet_name: name,
                    status: AdviceSheetStatus::Unsupported,
                    detected_profile: None,
                    resolved_profile: None,
                    summary: Default::default(),
                    diagnostics: vec![],
                };
                if source.format == SourceFormat::Xlsx {
                    match super::advice_layout::classify_advice_table(&table) {
                        Ok(layout) => preview.detected_profile = Some(layout.profile()),
                        Err(e) => {
                            let d = super::advice_diagnostics::diagnostic_for_table(&e, &table);
                            preview.status =
                                if d.code == ImportDiagnosticCode::UnsupportedAdviceLayout {
                                    AdviceSheetStatus::Unsupported
                                } else {
                                    AdviceSheetStatus::Invalid
                                };
                            preview.diagnostics.push(d);
                            result.sheets.push(preview);
                            continue;
                        }
                    }
                } else {
                    preview.detected_profile = Some(ImportProfile::StandardTable);
                }
                match parse_table(&table, requested, source.format) {
                    Ok((profile, parsed)) => {
                        preview.status = AdviceSheetStatus::Ready;
                        preview.resolved_profile = Some(profile);
                        preview.summary = summary(&parsed);
                    }
                    Err(e) => {
                        let d = super::advice_diagnostics::diagnostic_for_table(&e, &table);
                        preview.status = if d.code == ImportDiagnosticCode::AdviceProfileRequired {
                            AdviceSheetStatus::NeedsProfile
                        } else {
                            AdviceSheetStatus::Invalid
                        };
                        preview.diagnostics.push(d);
                    }
                }
                result.sheets.push(preview);
            }
        }
    }
    let recognized: Vec<_> = result
        .sheets
        .iter()
        .filter(|s| s.status != AdviceSheetStatus::Unsupported)
        .collect();
    if recognized.len() == 1 && recognized[0].status == AdviceSheetStatus::Ready {
        result.suggested_selection.push(AdviceSheetSelection {
            sheet_name: recognized[0].sheet_name.clone(),
            profile: recognized[0].resolved_profile.unwrap(),
        });
    }
    result
}

pub(super) fn analyze_advice_sources(
    sources: &[ImportSource],
) -> Result<AdviceAnalysis, ImportError> {
    let mut values = Vec::new();
    let mut logs = Vec::new();
    let mut ids = HashSet::new();
    for (index, source) in sources
        .iter()
        .enumerate()
        .filter(|(_, s)| s.role == ImportRole::BearingCapacities)
    {
        if source.format == SourceFormat::Xlsx
            && source
                .profile_options
                .advice_sheets
                .as_ref()
                .is_some_and(Vec::is_empty)
        {
            continue;
        }
        let source_id = source
            .source_id
            .clone()
            .unwrap_or_else(|| format!("legacy-source-{index}"));
        if !ids.insert(source_id.clone()) {
            return Err(ImportError::Validation("Duplicate advice source ID".into()));
        }
        let tables = source_tables(source)?;
        let selection = if source.format == SourceFormat::Csv {
            vec![AdviceSheetSelection {
                sheet_name: String::new(),
                profile: source.profile,
            }]
        } else if let Some(selection) = &source.profile_options.advice_sheets {
            selection.clone()
        } else {
            let discovery = preview_advice_source(source);
            if discovery.suggested_selection.len() != 1 {
                return Err(ImportError::Validation(
                    "Choose foundation advice worksheets explicitly".into(),
                ));
            }
            discovery.suggested_selection
        };
        let mut seen = HashSet::new();
        for selected in selection {
            if !seen.insert(selected.sheet_name.clone()) {
                return Err(ImportError::Validation(
                    "Duplicate worksheet selection".into(),
                ));
            }
            let table = tables
                .iter()
                .find(|t| t.sheet_name.as_deref().unwrap_or_default() == selected.sheet_name)
                .ok_or_else(|| {
                    ImportError::Validation(format!("Unknown worksheet: {}", selected.sheet_name))
                })?;
            let (profile, parsed) = parse_table(table, selected.profile, source.format)?;
            for value in &parsed.values {
                values.push(SourcedCapacity {
                    capacity: value.capacity.clone(),
                    location: AdviceValueLocation {
                        source_id: source_id.clone(),
                        file_name: source.file_name.clone(),
                        sheet_name: table.sheet_name.clone(),
                        row: Some(value.row),
                        column: Some(value.column),
                    },
                });
            }
            let mut log = provenance_entry(source, table.sheet_name.clone(), &[]);
            log.profile_details
                .insert("advice_id".into(), format!("advice-source-{index}"));
            log.profile_details.insert(
                "capacity_keys".into(),
                serde_json::to_string(
                    &parsed
                        .values
                        .iter()
                        .map(|v| super::advice_refresh::capacity_key(&v.capacity))
                        .collect::<Vec<_>>(),
                )
                .unwrap(),
            );
            log.source_profile = Some(profile);
            log.schema_version = Some(
                if profile == ImportProfile::CapacityColumns {
                    "capacity-columns-1"
                } else {
                    "fixed-1"
                }
                .into(),
            );
            log.mapped_columns = parsed.mapped_columns;
            if !parsed.missing_cells.is_empty() {
                log.warnings
                    .push(if profile == ImportProfile::StandardTable {
                        super::empty_frd_warning(
                            table,
                            &parsed.missing_cells.iter().map(|p| p.0).collect::<Vec<_>>(),
                        )
                    } else {
                        format!("Skipped {} empty FRD cell(s)", parsed.missing_cells.len())
                    });
            }
            log.profile_details.insert(
                "missing_cell_count".into(),
                parsed.missing_cells.len().to_string(),
            );
            logs.push((source_id.clone(), log));
        }
    }
    let merged = merge_advice_values(&values)?;
    if !merged.conflicts.is_empty() {
        let mut d = super::pipeline::error_diagnostic(
            ImportDiagnosticCode::ConflictingBearingCapacities,
            "Selected sources contain conflicting bearing capacities".into(),
        );
        d.count = merged.conflicts.len();
        return Err(ImportError::Advice(SourceImportFailure {
            unique_value_count: merged.unique_values.len() + merged.conflicts.len(),
            exact_duplicate_count: merged.exact_duplicate_count,
            message: d.fallback_message.clone(),
            diagnostics: vec![d],
            conflicts: merged.conflicts,
        }));
    }
    logs.sort_by(|a, b| (&a.0, &a.1.sheet_name).cmp(&(&b.0, &b.1.sheet_name)));
    let mut logs: Vec<_> = logs.into_iter().map(|(_, log)| log).collect();
    if let Some(first) = logs.first_mut() {
        if merged.exact_duplicate_count > 0 {
            first.warnings.push(format!(
                "Deduplicated {} exact bearing-capacity row(s)",
                merged.exact_duplicate_count
            ));
        }
        first.profile_details.insert(
            "combined_exact_duplicate_count".into(),
            merged.exact_duplicate_count.to_string(),
        );
    }
    Ok(AdviceAnalysis {
        values: merged.unique_values,
        exact_duplicate_count: merged.exact_duplicate_count,
        logs,
        sourced_values: values,
    })
}

pub fn preview_project_import(request: &PreviewProjectImportRequest) -> ProjectImportPreview {
    let mut result = ProjectImportPreview::default();
    if let Some(current) = &request.current_project {
        result.existing_sources = super::advice_refresh::stored_advice_sources(current);
    }
    let prepared = (|| {
        let analysis = analyze_advice_sources(&request.sources)?;
        if let Some(current) = &request.current_project {
            let new_cpts =
                if let Some(source) = request.sources.iter().find(|s| s.role == ImportRole::Cpts) {
                    parse_cpts(&read_source_table(
                        &source.file_name,
                        source.format,
                        &source.bytes,
                    )?)?
                } else {
                    current.inputs.cpts.clone()
                };
            let mapping = super::refresh::match_cpts(&current.inputs.cpts, &new_cpts);
            if !analysis.logs.is_empty() {
                return super::advice_refresh::combine_advice_refresh(
                    current,
                    &request.sources,
                    analysis,
                    &mapping,
                );
            }
        } else if request.sources.iter().any(|s| {
            matches!(
                s.advice_operation,
                Some(AdviceImportOperation::Replace { .. })
            )
        }) {
            return Err(ImportError::Validation(
                "No existing advice to replace".into(),
            ));
        }
        Ok(analysis)
    })();
    let analysis = match prepared {
        Ok(v) => v,
        Err(e) => {
            let f = e.to_source_import_failure();
            result.unique_value_count = f.unique_value_count;
            result.exact_duplicate_count = f.exact_duplicate_count;
            result.diagnostics = f.diagnostics;
            result.conflicts = f.conflicts;
            return result;
        }
    };
    result.unique_value_count = analysis.values.len();
    result.exact_duplicate_count = analysis.exact_duplicate_count;
    let checked = (|| -> Result<(), ImportError> {
        let mut loads = request
            .current_project
            .as_ref()
            .map(|p| p.inputs.load_points.clone());
        let mut cpts = request
            .current_project
            .as_ref()
            .map(|p| p.inputs.cpts.clone());
        for role in [ImportRole::LoadPoints, ImportRole::Cpts] {
            let matches: Vec<_> = request.sources.iter().filter(|s| s.role == role).collect();
            if matches.len() > 1 {
                return Err(ImportError::Validation(format!(
                    "Multiple import sources for {role:?}"
                )));
            }
            if let Some(source) = matches.first() {
                if role == ImportRole::LoadPoints {
                    loads = Some(super::pipeline::parse_load_source(source)?.0);
                } else {
                    cpts = Some(parse_cpts(&read_source_table(
                        &source.file_name,
                        source.format,
                        &source.bytes,
                    )?)?);
                }
            }
        }
        let loads =
            loads.ok_or_else(|| ImportError::Validation("Missing load-point source".into()))?;
        let cpts = cpts.ok_or_else(|| ImportError::Validation("Missing CPT source".into()))?;
        if request.current_project.is_none() && analysis.logs.is_empty() {
            return Err(ImportError::Validation(
                "Select at least one foundation advice table".into(),
            ));
        }
        let (effective_loads, effective_cpts, effective_values) = if analysis.logs.is_empty() {
            if let Some(current) = &request.current_project {
                let candidate =
                    super::refresh_project_from_profiled_sources(current, &request.sources)?;
                result.unique_value_count = candidate.inputs.bearing_capacities.len();
                // A load-only replacement carries the existing advice through unchanged.
                // Re-import reconciliation would reject supported legacy projects for
                // pre-existing duplicate advice values unrelated to this operation.
                if request
                    .sources
                    .iter()
                    .any(|s| s.role == ImportRole::LoadPoints)
                    && !request.sources.iter().any(|s| s.role == ImportRole::Cpts)
                {
                    result.counts_available = true;
                    result.imported_value_count = candidate.inputs.bearing_capacities.len();
                    return Ok(());
                }
                (
                    candidate.inputs.load_points,
                    candidate.inputs.cpts,
                    candidate.inputs.bearing_capacities,
                )
            } else {
                (loads, cpts, analysis.values.clone())
            }
        } else {
            (loads, cpts, analysis.values.clone())
        };
        let reconciliation =
            reconcile_imported_inputs(&effective_loads, &effective_cpts, effective_values)?;
        result.counts_available = true;
        result.imported_value_count = reconciliation.bearing_capacities.len();
        result.orphan_value_count = reconciliation.ignored_orphan_rows;
        if reconciliation.ignored_orphan_rows > 0 {
            let mut d = super::pipeline::error_diagnostic(
                ImportDiagnosticCode::AdviceOrphanValues,
                "Advice without known CPT coordinates".into(),
            );
            d.severity = ImportDiagnosticSeverity::Warning;
            d.count = reconciliation.ignored_orphan_rows;
            d.node_ids = reconciliation.ignored_orphan_cpt_ids.clone();
            result.diagnostics.push(d);
        }
        if !reconciliation.cpt_ids_without_capacities.is_empty() {
            let mut d = super::pipeline::error_diagnostic(
                ImportDiagnosticCode::AdviceCptsWithoutValues,
                "CPTs without advice".into(),
            );
            d.severity = ImportDiagnosticSeverity::Warning;
            d.count = reconciliation.cpt_ids_without_capacities.len();
            d.node_ids = reconciliation.cpt_ids_without_capacities.clone();
            result.diagnostics.push(d);
        }
        if !analysis.logs.is_empty() && result.imported_value_count == 0 {
            let mut d = super::pipeline::error_diagnostic(
                ImportDiagnosticCode::AdviceNoValues,
                "No bearing capacities will be imported".into(),
            );
            d.severity = ImportDiagnosticSeverity::Warning;
            result.diagnostics.push(d);
        }
        if request.sources.is_empty() {
            return Err(ImportError::Validation("Select at least one source".into()));
        }
        Ok(())
    })();
    if let Err(e) = checked {
        result.diagnostics.push(diagnostic(&e));
    } else {
        result.can_apply = true;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn workbook(sheets: &[(&str, &str)]) -> ImportSource {
        let mut book = rust_xlsxwriter::Workbook::new();
        for (name, text) in sheets {
            let sheet = book.add_worksheet();
            sheet.set_name(*name).unwrap();
            for (r, line) in text.lines().enumerate() {
                for (c, value) in line.split(',').enumerate() {
                    if value.is_empty() {
                        continue;
                    }
                    if let Ok(number) = value.parse::<f64>() {
                        sheet.write_number(r as u32, c as u16, number).unwrap();
                    } else {
                        sheet.write_string(r as u32, c as u16, value).unwrap();
                    }
                }
            }
        }
        ImportSource {
            advice_operation: None,
            source_id: Some("a".into()),
            role: ImportRole::BearingCapacities,
            profile: ImportProfile::Auto,
            profile_options: Default::default(),
            file_name: "advies.xlsx".into(),
            format: SourceFormat::Xlsx,
            bytes: book.save_to_buffer().unwrap(),
        }
    }
    fn selection(names: &[&str]) -> Option<Vec<AdviceSheetSelection>> {
        Some(
            names
                .iter()
                .map(|n| AdviceSheetSelection {
                    sheet_name: (*n).into(),
                    profile: ImportProfile::Auto,
                })
                .collect(),
        )
    }
    #[test]
    fn advice_selection_is_explicit() {
        let mut source = workbook(&[
            ("diep", "Sondering,PPN,#290\n1,-18,500"),
            ("hoog", "Sondering,PPN,#290\n1,-15,600"),
        ]);
        assert!(preview_advice_source(&source)
            .suggested_selection
            .is_empty());
        assert!(analyze_advice_sources(&[source.clone()]).is_err());
        source.profile_options.advice_sheets = selection(&["diep", "hoog"]);
        assert_eq!(
            analyze_advice_sources(&[source.clone()])
                .unwrap()
                .values
                .len(),
            2
        );
        source.profile_options.advice_sheets = Some(vec![]);
        assert!(analyze_advice_sources(&[source]).unwrap().logs.is_empty());
    }
    #[test]
    fn advice_excluded_invalid_sheet_does_not_block() {
        let mut source = workbook(&[
            ("ok", "Sondering,PPN,#290\n1,-18,500"),
            ("bad", "Sondering,PPN,#290\n1,-15,wrong"),
        ]);
        assert!(preview_advice_source(&source)
            .suggested_selection
            .is_empty());
        source.profile_options.advice_sheets = selection(&["ok"]);
        assert_eq!(analyze_advice_sources(&[source]).unwrap().values.len(), 1);
    }
    #[test]
    fn advice_conflicts_precede_orphan_filtering() {
        let mut source = workbook(&[
            ("first", "Sondering,PPN,#290\n999,-18,500"),
            ("second", "Sondering,PPN,#290\n999,-18,600"),
        ]);
        source.profile_options.advice_sheets = selection(&["first", "second"]);
        let error = analyze_advice_sources(&[source]).unwrap_err();
        assert_eq!(error.to_source_import_failure().conflicts.len(), 1);
    }
    #[test]
    fn advice_standard_csv_duplicates_block() {
        let source = ImportSource {
            advice_operation: None,
            source_id: None,
            role: ImportRole::BearingCapacities,
            profile: ImportProfile::StandardTable,
            profile_options: Default::default(),
            file_name: "advice.csv".into(),
            format: SourceFormat::Csv,
            bytes: b"ID,Tip,Size,FRD\n1,-18,290,500\n1,-18,290,600".to_vec(),
        };
        assert_eq!(
            analyze_advice_sources(&[source])
                .unwrap_err()
                .to_source_import_failure()
                .conflicts
                .len(),
            1
        );
    }
    #[test]
    fn preview_reports_duplicate_counts_even_when_conflicts_block() {
        let source = workbook(&[(
            "data",
            "Sondering,PPN,#290\n1,-18,500\n1,-18,500\n1,-18,600\n1,-18,600\n1,-18,600",
        )]);
        let preview = preview_project_import(&PreviewProjectImportRequest {
            sources: vec![source],
            current_project: None,
        });
        assert!(!preview.can_apply);
        assert_eq!(preview.conflicts.len(), 1);
        assert_eq!(preview.exact_duplicate_count, 3);
        assert_eq!(preview.unique_value_count, 1);
    }
}
