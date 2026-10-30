use super::*;
use crate::import::{table_mapping, ImportProfile, ImportProfileOptions, ImportRole, ImportSource};
pub(super) fn inspect(
    request: &PilePlanImportRequest,
) -> Result<
    (
        SourceTable,
        crate::SourceTablePreview,
        PilePlanImportProfile,
    ),
    PilePlanImportDiagnostic,
> {
    let source = ImportSource {
        source_id: None,
        advice_operation: None,
        role: ImportRole::LoadPoints,
        profile: ImportProfile::StandardTable,
        profile_options: ImportProfileOptions {
            table: request.options.table.clone(),
            ..Default::default()
        },
        file_name: request.file_name.clone(),
        format: request.format,
        bytes: request.bytes.clone(),
    };
    let (mut table, sheets) =
        table_mapping::read_import_table(&source).map_err(|e| fatal_source(e.to_string()))?;
    if request.format == SourceFormat::Xlsx
        && request
            .options
            .table
            .as_ref()
            .and_then(|t| t.sheet_name.as_ref())
            .is_none()
    {
        let tables = read_xlsx_tables(&request.file_name, &request.bytes)
            .map_err(|e| fatal_source(e.to_string()))?;
        let is_legacy = |t: &&SourceTable| {
            t.sheet_name
                .as_deref()
                .is_some_and(|n| n.eq_ignore_ascii_case("Vergrendeld"))
        };
        let score = |t: &SourceTable| {
            t.rows
                .iter()
                .take(30)
                .map(|r| {
                    r.cells
                        .iter()
                        .filter(|c| field(&c.as_text()) != "ignore")
                        .count()
                })
                .max()
                .unwrap_or(0)
        };
        let legacy_table = tables.iter().find(is_legacy);
        let standard_table = tables
            .iter()
            .filter(|t| !is_legacy(t))
            .max_by_key(|t| score(t));
        let chosen = match request.profile {
            PilePlanImportProfile::Legacy => legacy_table,
            PilePlanImportProfile::Automatic if legacy_table.is_some() => {
                if standard_table.is_some_and(|t| score(t) >= 3) {
                    return Err(profile_error("The workbook contains both standard and Legacy tables; choose a profile or worksheet."));
                }
                legacy_table
            }
            _ => standard_table.or(legacy_table),
        };
        if let Some(chosen) = chosen {
            table = chosen.clone();
        }
    }
    let legacy = request.profile == PilePlanImportProfile::Legacy
        || request.profile == PilePlanImportProfile::Automatic
            && table
                .sheet_name
                .as_deref()
                .is_some_and(|n| n.eq_ignore_ascii_case("Vergrendeld"));
    if request.profile == PilePlanImportProfile::Legacy && request.format != SourceFormat::Xlsx {
        return Err(profile_error("Legacy requires an XLSX workbook."));
    }
    let profile = if legacy {
        PilePlanImportProfile::Legacy
    } else {
        PilePlanImportProfile::StandardTable
    };
    let mut preview = table_mapping::inspect_table(
        &table,
        ImportRole::Cpts,
        request.options.table.as_ref(),
        sheets,
    );
    if request
        .options
        .table
        .as_ref()
        .and_then(|s| s.columns.as_ref())
        .is_none()
    {
        let positions = if legacy {
            vec![
                "id",
                "pile-count",
                "tip-level",
                "pile-size",
                "ignore",
                "x",
                "y",
            ]
        } else {
            vec![
                "id",
                "x",
                "y",
                "ignore",
                "pile-size",
                "tip-level",
                "selected-cpts",
            ]
        };
        preview.settings.columns = Some(
            preview
                .columns
                .iter()
                .map(|c| {
                    let meaning = if preview.settings.has_headers == Some(true) {
                        field(&c.header)
                    } else {
                        positions.get(c.column - 1).copied().unwrap_or("ignore")
                    };
                    let label = c.header.to_lowercase();
                    crate::ImportColumnMapping {
                        column: c.column,
                        field: meaning.into(),
                        unit: if ["x", "y", "tip-level"].contains(&meaning) {
                            Some(
                                if label.contains("[mm]") || label.contains("(mm)") {
                                    "mm"
                                } else if label.contains("[m]")
                                    || label.contains("(m)")
                                    || meaning == "tip-level"
                                {
                                    "m"
                                } else {
                                    "mm"
                                }
                                .into(),
                            )
                        } else {
                            None
                        },
                        pile_size_mm: None,
                    }
                })
                .collect(),
        );
    }
    Ok((table, preview, profile))
}
fn field(label: &str) -> &'static str {
    let token = label
        .split('[')
        .next()
        .unwrap_or(label)
        .split('(')
        .next()
        .unwrap_or(label)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    match token.as_str() {
        "id" | "locatieid" | "locationid" | "loadpointid" | "belastinglocatie"
        | "belastinglocatieid" | "knoop" | "knoopnummer" => "id",
        "x" | "xcoordinaat" | "xcoördinaat" | "xcoordinate" => "x",
        "y" | "ycoordinaat" | "ycoördinaat" | "ycoordinate" => "y",
        "afmeting" | "paalafmeting" | "pilesize" | "size" | "diameter" => "pile-size",
        "puntniveau" | "paalpuntniveau" | "piletiplevel" | "tiplevel" | "tip" => "tip-level",
        "selectedcpts" | "geselecteerdesonderingen" | "sonderingen" | "cpts" => "selected-cpts",
        "pilecount" | "aantalpalen" => "pile-count",
        _ => "ignore",
    }
}
pub(super) fn parse(
    table: &SourceTable,
    settings: &crate::TableImportSettings,
    profile: PilePlanImportProfile,
    options: &PilePlanImportOptions,
) -> Result<ParsedPilePlanSource, PilePlanImportDiagnostic> {
    let columns = settings.columns.as_deref().unwrap_or(&[]);
    let mut used = HashSet::new();
    for c in columns {
        if c.column == 0
            || !matches!(
                c.field.as_str(),
                "ignore"
                    | "id"
                    | "x"
                    | "y"
                    | "pile-size"
                    | "tip-level"
                    | "selected-cpts"
                    | "pile-count"
            )
            || c.field != "ignore" && !used.insert(c.field.as_str())
        {
            return Err(mapping_error("Invalid or duplicate column mapping."));
        }
        if let Some(unit) = &c.unit {
            if !["m", "mm"].contains(&unit.as_str()) {
                return Err(mapping_error("Unsupported length unit."));
            }
        }
    }
    let mapping = |name: &str| columns.iter().find(|c| c.field == name);
    let has = |name: &str| mapping(name).is_some();
    if !has("id") && !(has("x") && has("y"))
        || has("x") != has("y")
        || options.import_pile_assignments && has("pile-size") != has("tip-level")
    {
        return Err(mapping_error(
            "Map a location ID or X/Y pair, and both pile size and tip level.",
        ));
    }
    let mut rows = vec![];
    let mut diagnostics = vec![];
    for row in table.rows.iter().filter(|r| {
        r.number >= settings.first_data_row.unwrap_or(1)
            && !(settings.has_headers == Some(true) && Some(r.number) == settings.header_row)
    }) {
        let get = |name: &str| -> Result<Option<&TableCell>, PilePlanImportDiagnostic> {
            mapping(name)
                .map(|m| cell(table, row.number, m.column - 1))
                .transpose()
        };
        let err = |name: &str, message: String| {
            invalid_cell(
                table,
                row.number,
                mapping(name).unwrap().column - 1,
                message,
            )
        };
        let id = match get("id")? {
            Some(c) if !c.is_empty() => Some(if profile == PilePlanImportProfile::Legacy {
                parse_legacy_load_point_id_cell(
                    table,
                    row.number,
                    mapping("id").unwrap().column - 1,
                )?
            } else {
                parse_u32(c).map_err(|e| err("id", e))?
            }),
            _ => None,
        };
        let number = |name: &str| -> Result<Option<f64>, PilePlanImportDiagnostic> {
            get(name)?
                .filter(|c| !c.is_empty())
                .map(|c| {
                    parse_f64(c)
                        .map(|n| {
                            if mapping(name).and_then(|m| m.unit.as_deref()) == Some("m") {
                                n * 1000.
                            } else {
                                n
                            }
                        })
                        .and_then(|n| n.is_finite().then_some(n).ok_or_else(|| "Coordinate is outside the supported range after unit conversion.".to_string()))
                        .map_err(|e| err(name, e))
                })
                .transpose()
        };
        let x = number("x")?;
        let y = number("y")?;
        if x.is_some() != y.is_some() || id.is_none() && x.is_none() {
            return Err(invalid_cell(
                table,
                row.number,
                0,
                "A location ID or complete X/Y pair is required.".into(),
            ));
        }
        if let Some(c) = if options.import_pile_assignments {
            get("pile-count")?
        } else {
            None
        } {
            let n = parse_u32(c).map_err(|e| err("pile-count", e))?;
            if n != 1 {
                diagnostics.push(PilePlanImportDiagnostic {
                    severity: PilePlanImportDiagnosticSeverity::Warning,
                    code: PilePlanImportDiagnosticCode::UnsupportedPileCount,
                    message: format!("Pile count {n} is unsupported."),
                    location: Some(location(
                        table,
                        row.number,
                        mapping("pile-count").map(|c| c.column),
                    )),
                });
                continue;
            }
        }
        let pile = if !options.import_pile_assignments {
            PilePlanImportedValue::Preserve
        } else {
            match (get("pile-size")?, get("tip-level")?) {
                (None, None) => PilePlanImportedValue::Preserve,
                (Some(size), Some(tip)) if size.is_empty() && tip.is_empty() => {
                    PilePlanImportedValue::Clear
                }
                (Some(size), Some(tip)) if !size.is_empty() && !tip.is_empty() => {
                    let tip_mm =
                        if mapping("tip-level").and_then(|m| m.unit.as_deref()) == Some("mm") {
                            parse_f64(tip).map_err(|e| err("tip-level", e))?
                        } else {
                            parse_f64(tip).map_err(|e| err("tip-level", e))? * 1000.
                        };
                    if !tip_mm.is_finite()
                        || tip_mm.fract().abs() > 1e-6
                        || tip_mm < i64::MIN as f64
                        || tip_mm > i64::MAX as f64
                    {
                        return Err(err(
                            "tip-level",
                            "Pile tip level must resolve to whole millimeters.".into(),
                        ));
                    }
                    PilePlanImportedValue::Set(PileConfigurationKey {
                        pile_size_mm: parse_standard_pile_size(size)
                            .map_err(|e| err("pile-size", e))?,
                        pile_tip_level_mm: tip_mm.round() as i64,
                    })
                }
                _ => {
                    diagnostics.push(PilePlanImportDiagnostic{severity:PilePlanImportDiagnosticSeverity::Warning,code:PilePlanImportDiagnosticCode::InvalidRow,message:"Pile size and tip level must both be filled or empty; assignment preserved.".into(),location:Some(location(table,row.number,None))});
                    PilePlanImportedValue::Preserve
                }
            }
        };
        let manual_cpt_ids =
            if profile == PilePlanImportProfile::Legacy || !options.import_cpt_selections {
                PilePlanImportedValue::Preserve
            } else {
                match get("selected-cpts")? {
                    None => PilePlanImportedValue::Preserve,
                    Some(c) if c.is_empty() => PilePlanImportedValue::Clear,
                    Some(c) => PilePlanImportedValue::Set(
                        parse_cpt_ids(&c.as_text()).map_err(|e| err("selected-cpts", e))?,
                    ),
                }
            };
        rows.push(ParsedPilePlanRow {
            source_id: id,
            x_mm: x,
            y_mm: y,
            pile,
            manual_cpt_ids,
            sheet_name: table.sheet_name.clone(),
            row: row.number,
        });
    }
    Ok(ParsedPilePlanSource {
        profile,
        supports_cpt_selections: profile != PilePlanImportProfile::Legacy && has("selected-cpts"),
        source_rows: rows.len()
            + diagnostics
                .iter()
                .filter(|d| d.code == PilePlanImportDiagnosticCode::UnsupportedPileCount)
                .count(),
        rows,
        diagnostics,
    })
}
