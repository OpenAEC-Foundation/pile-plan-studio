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
    {
        return Err(ImportError::Validation(
            "Unsupported foundation advice profile or format".into(),
        ));
    }
    match source.format {
        SourceFormat::Xlsx => table::read_xlsx_tables(&source.file_name, &source.bytes),
        SourceFormat::Csv => {
            let mut selected = source.clone();
            if let Some(table) = source.profile_options.advice_sheets.as_ref()
                .and_then(|sheets| sheets.first()).and_then(|sheet| sheet.table.as_ref()) {
                selected.profile_options.table = Some(table.clone());
            }
            Ok(vec![super::table_mapping::read_import_table(&selected)?.0])
        }
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
fn parse_selected_table(
    table: &SourceTable,
    profile: ImportProfile,
    format: SourceFormat,
    direction: crate::ResistanceDirection,
    tension_column: Option<usize>,
) -> Result<(ImportProfile, ParsedAdviceTable), ImportError> {
    let mut pressure_table = table.clone();
    if tension_column.is_some() {
        for row in &mut pressure_table.rows {
            row.cells.truncate(4);
        }
        pressure_table.formula_cells.retain(|(_, c)| *c <= 4);
    }
    let (resolved, mut parsed) = parse_table(&pressure_table, profile, format)?;
    for value in &mut parsed.values {
        value.capacity.direction = direction;
    }
    if let Some(column) = tension_column {
        if column < 5
            || resolved != ImportProfile::StandardTable
            || direction != crate::ResistanceDirection::Compression
        {
            return Err(ImportError::Validation("Combined resistance columns require a standard compression table and a tension column after column 4".into()));
        }
        let mut tension_table = table.clone();
        for row in &mut tension_table.rows {
            let value = row
                .cells
                .get(column - 1)
                .cloned()
                .unwrap_or(TableCell::Empty);
            if row.cells.len() >= 4 {
                row.cells[3] = value;
                row.cells.truncate(4);
            }
        }
        // The standard parser accepts positional columns; keep its FRD header.
        if let Some(row) = tension_table.rows.first_mut() {
            if row
                .cells
                .first()
                .is_some_and(|cell| super::parse_finite_number(&cell.as_text()).is_err())
                && row.cells.len() >= 4
            {
                row.cells[3] = TableCell::Text("FRD".into());
            }
        }
        tension_table.formula_cells.retain(|(_, c)| *c <= 4);
        let (_, mut tension) = parse_table(&tension_table, profile, format)?;
        if tension.values.is_empty(){return Err(ImportError::Validation(format!("Tension resistance column {column} contains no data")));}
        for value in &mut tension.values {
            value.capacity.direction = crate::ResistanceDirection::Tension;
            value.column = column;
        }
        parsed.values.extend(tension.values);
        parsed.missing_cells.extend(tension.missing_cells);
    }
    Ok((resolved, parsed))
}
fn retain_scoped_missing(table:&SourceTable, parsed:&mut ParsedAdviceTable, count:Option<u32>, direction:crate::ResistanceDirection, value_column:usize, source_column:usize)->Result<(),ImportError>{
    let Some(count)=count else {return Ok(());};
    if count==0{return Err(ImportError::Validation("Pile count must be greater than zero".into()));}
    for row in table.rows.iter().filter(|r|r.number>0){
        if row.cells.get(value_column-1).is_none_or(TableCell::is_empty){
            let text=|i:usize|row.cells.get(i).map(TableCell::as_text).unwrap_or_default();
            let cpt_id=super::parse_nonnegative_u32(&text(0)).map_err(|_|ImportError::Validation("Invalid CPT for missing scoped resistance".into()))?;
            let pile_tip_level_m=super::parse_finite_number(&text(1)).map_err(|_|ImportError::Validation("Invalid tip for missing scoped resistance".into()))?;
            let pile_size_mm=super::parse_nonnegative_u32(&text(2)).map_err(|_|ImportError::Validation("Invalid size for missing scoped resistance".into()))?;
            parsed.values.push(LocatedCapacity{capacity:ProjectBearingCapacity{pile_count:Some(count),missing:true,cpt_id,pile_tip_level_m,pile_size_mm,frd_kn:0.,direction},row:row.number,column:source_column});
        }
    }
    Ok(())
}
fn parse_mapped_advice(table:&SourceTable,profile:ImportProfile,direction:crate::ResistanceDirection,tension_column:Option<usize>,settings:&super::TableImportSettings)->Result<(ImportProfile,ParsedAdviceTable),ImportError>{
    let inspection=super::table_mapping::inspect_table(table,ImportRole::BearingCapacities,Some(settings),vec![]);
    let settings=&inspection.settings;
    if settings.pile_count==Some(0)||settings.fixed_pile_size_mm==Some(0){return Err(ImportError::Validation("Pile count and fixed pile size must be greater than zero".into()));}
    let columns=settings.columns.as_deref().unwrap_or(&[]);
    if profile==ImportProfile::CapacityColumns||columns.iter().any(|c|c.field=="resistance"&&c.pile_size_mm.is_some()){
        if tension_column.is_some()||columns.iter().any(|c|c.field=="tension"){return Err(ImportError::Validation("Matrix advice must use separate compression and tension worksheets".into()));}
        let id=columns.iter().find(|c|c.field=="id").ok_or_else(||ImportError::Validation("Missing CPT column mapping".into()))?;
        let tip=columns.iter().find(|c|c.field=="tip-level").ok_or_else(||ImportError::Validation("Missing tip level column mapping".into()))?;
        let mut sizes=HashSet::new();let mut used=HashSet::from([id.column,tip.column]);
        if id.column==0||tip.column==0||id.column==tip.column{return Err(ImportError::Validation("Invalid matrix column mapping".into()));}
        let mut result=ParsedAdviceTable::default();
        for col in columns.iter().filter(|c|c.field=="resistance"){
            let size=col.pile_size_mm.filter(|s|*s>0).ok_or_else(||ImportError::Validation("Choose a pile size for each resistance column".into()))?;
            if !sizes.insert(size)||col.column==0||!used.insert(col.column){return Err(ImportError::Validation("Duplicate pile size or matrix column".into()));}
            let mut mapped=table.clone();mapped.formula_cells.clear();
            mapped.rows=table.rows.iter().filter(|r|r.number>=settings.first_data_row.unwrap_or(1)).map(|r|{
                let cell=|c:usize|r.cells.get(c-1).cloned().unwrap_or(TableCell::Empty);
                let tipcell=cell(tip.column);
                let tipcell=if tip.unit.as_deref()==Some("mm"){super::parse_finite_number(&tipcell.as_text()).map(|n|TableCell::Number(n/1000.)).unwrap_or(tipcell)}else{tipcell};
                for (index,original) in [id.column,tip.column,usize::MAX,col.column].into_iter().enumerate(){if table.has_formula(r.number,original){mapped.formula_cells.insert((r.number,index+1));}}
                SourceRow{number:r.number,cells:vec![cell(id.column),tipcell,TableCell::Number(size as f64),cell(col.column)]}
            }).collect();
            mapped.rows.insert(0,SourceRow{number:0,cells:["ID","Tip","Size","FRD"].into_iter().map(|s|TableCell::Text(s.into())).collect()});
            let (_,mut parsed)=parse_standard_table(&mapped).map_err(|e|super::table_mapping::map_error(e,settings,ImportRole::BearingCapacities))?;
            if parsed.values.is_empty(){return Err(ImportError::Validation(format!("Resistance column {} contains no data",col.column)));}
            retain_scoped_missing(&mapped,&mut parsed,settings.pile_count,direction,4,col.column)?;
            for value in &mut parsed.values{value.capacity.direction=direction;value.capacity.pile_count=settings.pile_count;value.column=col.column;}
            result.values.extend(parsed.values);result.missing_cells.extend(parsed.missing_cells);
            result.mapped_columns.insert(format!("Column {}",col.column),format!("resistance {size} mm"));
        }
        if result.values.is_empty(){return Err(ImportError::Validation("Map at least one resistance column".into()));}
        return Ok((ImportProfile::CapacityColumns,result));
    }
    let has_pressure=columns.iter().any(|c|c.field=="resistance");let has_tension=columns.iter().any(|c|c.field=="tension");
    let mut normalized_settings=settings.clone();
    let only_tension=has_tension&&!has_pressure;
    if only_tension{for c in normalized_settings.columns.as_mut().unwrap(){if c.field=="tension"{c.field="resistance".into();}}}
    let mapped=super::table_mapping::normalize_table(table,ImportRole::BearingCapacities,&normalized_settings)?;
    let combined=has_pressure&&has_tension;
    let (profile,mut parsed)=parse_selected_table(&mapped,ImportProfile::StandardTable,SourceFormat::Csv,if only_tension{crate::ResistanceDirection::Tension}else{direction},if combined{Some(5)}else{None})
        .map_err(|e|super::table_mapping::map_error(e,&normalized_settings,ImportRole::BearingCapacities))?;
    for value in &mut parsed.values{
        let field=if only_tension||value.capacity.direction==crate::ResistanceDirection::Tension&&combined{"tension"}else{"resistance"};
        if let Some(col)=columns.iter().find(|c|c.field==field){value.column=col.column;}
    }
    for value in &mut parsed.values{value.capacity.pile_count=settings.pile_count;}
    let primary_direction=if only_tension{crate::ResistanceDirection::Tension}else{direction};
    let primary_field=if only_tension{"tension"}else{"resistance"};
    if let Some(col)=columns.iter().find(|c|c.field==primary_field){retain_scoped_missing(&mapped,&mut parsed,settings.pile_count,primary_direction,4,col.column)?;}
    if combined {if let Some(col)=columns.iter().find(|c|c.field=="tension"){retain_scoped_missing(&mapped,&mut parsed,settings.pile_count,crate::ResistanceDirection::Tension,5,col.column)?;}}
    parsed.mapped_columns=columns.iter().filter(|c|c.field!="ignore").map(|c|(format!("Column {}",c.column),c.field.clone())).collect();
    Ok((profile,parsed))
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

                let selected = source
                    .profile_options
                    .advice_sheets
                    .as_ref()
                    .and_then(|s| s.iter().find(|s| s.sheet_name == name));
                let direction = selected
                    .map(|s| s.direction)
                    .unwrap_or(source.profile_options.resistance_direction);
                let tension_column = selected
                    .and_then(|s| s.tension_column)
                    .or(source.profile_options.tension_column);
                let mut preview = AdviceSheetPreview {
                    table:None,
                    sheet_name: name,
                    status: AdviceSheetStatus::Unsupported,
                    detected_profile: None,
                    resolved_profile: None,
                    summary: Default::default(),
                    diagnostics: vec![],
                };
                let explicit=selected.and_then(|s|s.table.as_ref()).or(source.profile_options.table.as_ref());
                let mut inspection=super::table_mapping::inspect_table(&table,ImportRole::BearingCapacities,explicit,vec![]);
                let matrix_layout=super::capacity_columns::detect_capacity_columns(&table).ok().flatten().or_else(||super::capacity_columns::detect_positional_capacity_columns(&table).ok().flatten());
                let matrix=requested==ImportProfile::CapacityColumns || (requested==ImportProfile::Auto&&matrix_layout.is_some());
                if !matrix&&explicit.and_then(|s|s.columns.as_ref()).is_none(){
                    if let Some(column)=tension_column{if let Some(columns)=&mut inspection.settings.columns{for c in columns{if c.column==column{c.field="tension".into();}}}}
                    else if direction==crate::ResistanceDirection::Tension{if let Some(columns)=&mut inspection.settings.columns{for c in columns{if c.field=="resistance"{c.field="tension".into();}}}}
                }
                if matrix && explicit.and_then(|s|s.columns.as_ref()).is_none(){
                    if let Some(layout)=matrix_layout{
                        inspection.settings.has_headers=Some(true);inspection.settings.header_row=Some(layout.header_row);
                        inspection.settings.first_data_row=Some(super::table_mapping::data_start_after(&table,layout.header_row));
                        inspection.settings.columns=Some(inspection.columns.iter().map(|c|super::ImportColumnMapping{column:c.column,field:if c.column==layout.id_column{"id"}else if c.column==layout.tip_column{"tip-level"}else if layout.size_columns.iter().any(|(_,i)|*i==c.column){"resistance"}else{"ignore"}.into(),unit:(c.column==layout.tip_column).then(||"m".into()),pile_size_mm:layout.size_columns.iter().find(|(_,i)|*i==c.column).map(|(size,_)|*size)}).collect());
                    }
                }
                preview.table=Some(inspection.clone());
                let named_fields=inspection.columns.iter().filter_map(|c|super::table_mapping::header_field(&c.header,super::ImportRole::BearingCapacities)).collect::<std::collections::HashSet<_>>();
                let named_standard=["id","tip-level","pile-size"].iter().all(|field|named_fields.contains(field))&&(named_fields.contains("resistance")||named_fields.contains("tension"));
                let recognizable=named_standard || inspection.settings.fixed_pile_size_mm.is_some() || inspection.columns.iter().filter(|c|super::advice_layout::role_header(&c.header,1)||c.header.to_lowercase().contains("weerstand")||c.header.to_lowercase().contains("afmeting")||c.header.to_lowercase().contains("paalpunt")).count()>=2;
                if explicit.is_some()||(!matrix&&recognizable){
                    let profile=if matrix{ImportProfile::CapacityColumns}else{ImportProfile::StandardTable};
                    preview.detected_profile=Some(profile);
                    match parse_mapped_advice(&table,profile,direction,tension_column,&inspection.settings){
                        Ok((profile,parsed))=>{preview.status=AdviceSheetStatus::Ready;preview.resolved_profile=Some(profile);preview.summary=summary(&parsed);},
                        Err(e)=>{preview.status=AdviceSheetStatus::Invalid;preview.diagnostics.push(super::advice_diagnostics::diagnostic_for_table(&e,&table));}
                    }
                    if let Some(p)=&mut preview.table{super::table_mapping::include_diagnostic_rows(&table,p,&preview.diagnostics);}
                    result.sheets.push(preview);continue;
                }
                if source.format == SourceFormat::Xlsx {
                    let mut classified = table.clone();
                    if tension_column.is_some() {
                        for row in &mut classified.rows {
                            row.cells.truncate(4);
                        }
                        classified.formula_cells.retain(|(_, c)| *c <= 4);
                    }
                    match super::advice_layout::classify_advice_table(&classified) {
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
                match parse_selected_table(
                    &table,
                    requested,
                    source.format,
                    direction,
                    tension_column,
                ) {
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
            table:recognized[0].table.as_ref().map(|t|t.settings.clone()),
            sheet_name: recognized[0].sheet_name.clone(),
            profile: recognized[0].resolved_profile.unwrap(),
            direction: source.profile_options.resistance_direction,
            tension_column: source.profile_options.tension_column,
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
                table:source.profile_options.advice_sheets.as_ref().and_then(|ss|ss.first()).and_then(|s|s.table.clone()).or_else(||source.profile_options.table.clone()),
                sheet_name: String::new(),
                profile: source.profile,
                direction: source
                    .profile_options
                    .advice_sheets
                    .as_ref()
                    .and_then(|s| s.first())
                    .map(|s| s.direction)
                    .unwrap_or(source.profile_options.resistance_direction),
                tension_column: source
                    .profile_options
                    .advice_sheets
                    .as_ref()
                    .and_then(|s| s.first())
                    .and_then(|s| s.tension_column)
                    .or(source.profile_options.tension_column),
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
            let (profile, parsed) = if let Some(settings)=selected.table.as_ref(){parse_mapped_advice(table,selected.profile,selected.direction,selected.tension_column,settings)?}else{parse_selected_table(
                table,
                selected.profile,
                source.format,
                selected.direction,
                selected.tension_column,
            )?};
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
            if let Some(settings)=&selected.table{log.profile_details.insert("table_settings".into(),serde_json::to_string(settings).unwrap());}
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
            let inspected=super::table_mapping::inspect_table(table,ImportRole::BearingCapacities,selected.table.as_ref(),vec![]);
            log.profile_details.insert("source_headers".into(),serde_json::to_string(&inspected.columns.iter().map(|c|c.header.clone()).collect::<Vec<_>>()).unwrap());
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

fn parse_mapped_cpts(source: &ImportSource) -> Result<Vec<crate::ProjectCpt>, ImportError> {
    let table = super::table_mapping::mapped_table(source)?;
    parse_cpts(&table).map_err(|error| match &source.profile_options.table {
        Some(settings) => super::table_mapping::map_error(error, settings, ImportRole::Cpts),
        None => error,
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
                    parse_mapped_cpts(source)?
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
                    cpts = Some(parse_mapped_cpts(source)?);
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
                    table:None,
                    direction: Default::default(),
                    tension_column: None,
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
