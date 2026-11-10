use std::collections::{HashMap, HashSet};

use crate::import::{
    read_xlsx_tables_with_iso_dates,
    table_mapping::{inspect_table_layout, read_import_table},
    ImportColumnMapping, ImportProfile, ImportProfileOptions, ImportRole, ImportSource,
    SourceFormat, SourceRow, SourceTable, SourceTablePreview, TableCell, TableImportSettings,
};

use super::{column_key, PileDrivingImportError, PileDrivingSharedTable};

pub(super) struct DrivingTable {
    pub raw: SourceTable,
    pub preview: SourceTablePreview,
    pub diagnostic: Option<PileDrivingImportError>,
}

pub(super) fn read(
    file_name: &str,
    format: SourceFormat,
    bytes: &[u8],
    requested: Option<&TableImportSettings>,
    shared: Option<&PileDrivingSharedTable>,
) -> Result<DrivingTable, PileDrivingImportError> {
    let settings = requested.or(shared.map(|shared| &shared.settings));
    let (raw, sheets, mut diagnostic) = if format == SourceFormat::Csv {
        let source = ImportSource {
            source_id: None,
            advice_operation: None,
            role: ImportRole::LoadPoints,
            profile: ImportProfile::StandardTable,
            profile_options: ImportProfileOptions {
                table: settings.cloned(),
                ..Default::default()
            },
            file_name: file_name.to_owned(),
            format,
            bytes: bytes.to_vec(),
        };
        let (raw, sheets) =
            read_import_table(&source).map_err(|_| PileDrivingImportError::Unreadable)?;
        (raw, sheets, None)
    } else {
        let tables = read_xlsx_tables_with_iso_dates(file_name, bytes)
            .map_err(|_| PileDrivingImportError::Unreadable)?;
        let sheets = tables
            .iter()
            .filter_map(|table| table.sheet_name.clone())
            .collect();
        let mut diagnostic = None;
        let sheet = if let Some(name) = settings.and_then(|settings| settings.sheet_name.as_deref())
        {
            tables
                .iter()
                .position(|table| table.sheet_name.as_deref() == Some(name))
                .unwrap_or_else(|| {
                    diagnostic = Some(PileDrivingImportError::MissingWorksheet);
                    0
                })
        } else {
            let mut candidates = tables.iter().enumerate().filter(|(_, table)| {
                table.rows.iter().take(30).any(|row| {
                    row.cells
                        .iter()
                        .any(|cell| canonical_field(&cell.as_text()) == Some("paalnummer"))
                })
            });
            let sheet = candidates.next().map_or(0, |(index, _)| index);
            if candidates.next().is_some() {
                diagnostic = Some(PileDrivingImportError::MultiplePileNumberTables);
            }
            sheet
        };
        let raw = tables
            .into_iter()
            .nth(sheet)
            .ok_or(PileDrivingImportError::NoRecords)?;
        (raw, sheets, diagnostic)
    };
    let mut preview = inspect_table_layout(
        &raw,
        settings,
        sheets,
        |header| canonical_field(header).is_some(),
        1,
    );
    if let Some(columns) = &mut preview.settings.columns {
        if let Some(shared) = shared {
            let headers: Vec<_> = preview
                .columns
                .iter()
                .map(|column| column_key(&column.header))
                .collect();
            columns.retain_mut(|mapping| {
                let Some(index) = matching_column(mapping.column, &shared.headers, &headers) else {
                    return false;
                };
                mapping.column = index + 1;
                true
            });
            columns.sort_by_key(|mapping| mapping.column);
        }
    } else {
        let fields: Vec<_> = preview
            .columns
            .iter()
            .map(|column| canonical_field(&column.header))
            .collect();
        let mut counts = HashMap::new();
        for &field in fields.iter().flatten() {
            *counts.entry(field).or_insert(0) += 1;
        }
        if counts.get("paalnummer").is_some_and(|&count| count > 1) {
            diagnostic.get_or_insert(PileDrivingImportError::MultiplePileNumberColumns);
        }
        preview.settings.columns = Some(
            fields
                .into_iter()
                .enumerate()
                .map(|(index, field)| ImportColumnMapping {
                    column: index + 1,
                    field: field
                        .filter(|field| counts.get(field) == Some(&1))
                        .unwrap_or("ignore")
                        .into(),
                    unit: None,
                    pile_size_mm: None,
                })
                .collect(),
        );
    }
    Ok(DrivingTable {
        raw,
        preview,
        diagnostic,
    })
}

fn matching_column(column: usize, reference: &[String], headers: &[String]) -> Option<usize> {
    let index = column.checked_sub(1)?;
    let key = column_key(reference.get(index)?);
    if headers.get(index) == Some(&key) {
        return Some(index);
    }
    if key.is_empty() {
        return None;
    }
    let mut matches = headers
        .iter()
        .enumerate()
        .filter(|(_, header)| *header == &key);
    let (index, _) = matches.next()?;
    matches.next().is_none().then_some(index)
}

pub(super) fn normalize(
    mut raw: SourceTable,
    preview: &SourceTablePreview,
) -> Result<SourceTable, PileDrivingImportError> {
    let settings = &preview.settings;
    let mut fields = HashSet::new();
    let mut source_columns = HashSet::new();
    let mut mapping: Vec<_> = settings
        .columns
        .iter()
        .flatten()
        .filter(|column| column.field != "ignore")
        .collect();
    mapping.sort_by_key(|column| column.column);
    for column in &mapping {
        if column.column == 0
            || column.column > preview.columns.len()
            || canonical_field(&column.field) != Some(column.field.as_str())
            || !source_columns.insert(column.column)
            || !fields.insert(column.field.as_str())
        {
            return Err(PileDrivingImportError::InvalidColumnMapping);
        }
    }
    if !fields.contains("paalnummer") {
        return Err(PileDrivingImportError::MissingPileNumberColumn);
    }
    let first_data = settings.first_data_row.unwrap_or(1);
    raw.rows
        .retain(|row| row.number >= first_data && settings.header_row != Some(row.number));
    for row in &mut raw.rows {
        row.cells = mapping
            .iter()
            .map(|column| {
                row.cells
                    .get(column.column - 1)
                    .cloned()
                    .unwrap_or(TableCell::Empty)
            })
            .collect();
    }
    raw.rows.insert(
        0,
        SourceRow {
            number: 0,
            cells: mapping
                .iter()
                .map(|column| TableCell::Text(column.field.clone()))
                .collect(),
        },
    );
    Ok(raw)
}

fn canonical_field(header: &str) -> Option<&'static str> {
    Some(match column_key(header).as_str() {
        "paalnummer" | "pilenumber" => "paalnummer",
        "diktecm" | "paalafmetingcm" | "diametercm" => "dikte_cm",
        "lengtecm" | "paallengtecm" => "lengte_cm",
        "referentieniveau" => "referentieniveau",
        "tochtnummer" | "tocht" => "tochtnummer",
        "ppnnap" | "puntniveaumnap" => "ppn_nap",
        "slagen" | "aantalslagen" => "slagen",
        "mmzakkingpertocht" | "zakkingpertochtmm" => "mm_zakking_per_tocht",
        "energieperslagkj" | "slagenergiekj" => "energie_per_slag_kj",
        "paalid" => "paal_id",
        "datum" => "datum",
        "stelling" => "stelling",
        "starttijd" => "starttijd",
        "projectnummer" => "projectnummer",
        "bloknummer" => "bloknummer",
        "kavelnummer" => "kavelnummer",
        "ppdgewenst" => "ppd_gewenst",
        "opmerkingen" => "opmerkingen",
        _ => return None,
    })
}
