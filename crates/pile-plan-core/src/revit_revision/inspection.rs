use super::source::{cell_value, error, key, RevisionSource};
use crate::import::{read_source_table, read_xlsx_tables, SourceTable, TableCell};
use crate::{ExportColumn, ExportError, ExportField, ExportLengthUnit, ExportTable, SourceFormat};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PileTableMapping {
    pub columns: HashMap<ExportField, usize>,
    pub coordinate_unit: ExportLengthUnit,
    pub tip_unit: ExportLengthUnit,
    pub size_template: Option<String>,
    pub size_shape: Option<crate::PileCostShape>,
}
impl Default for PileTableMapping {
    fn default() -> Self {
        Self {
            columns: HashMap::new(),
            coordinate_unit: ExportLengthUnit::Mm,
            tip_unit: ExportLengthUnit::M,
            size_template: None,
            size_shape: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InspectPileTableRequest {
    pub source: RevisionSource,
}
#[derive(Clone, Debug, Serialize)]
pub struct PileTableInspection {
    pub sheet_names: Vec<String>,
    pub sheet_name: Option<String>,
    pub header_row: usize,
    pub ambiguous_sheet: bool,
    pub headers: Vec<String>,
    pub mapping: PileTableMapping,
    pub table: ExportTable,
    pub source_columns: Vec<ExportColumn>,
}

pub(super) fn suggested_field(header: &str) -> Option<ExportField> {
    let k = key(header).replace(['_', '-'], "");
    Some(match k.as_str() {
        "loadpointid" | "locationid" | "locatieid" | "node" | "nodeid" | "knoop"
        | "knoopnummer" => ExportField::LoadPointId,
        "mark" | "paalnummer" | "paalnr" | "pilenumber" | "pilenr" => ExportField::Mark,
        "x" | "x[mm]" | "x[m]" | "x(mm)" | "x(m)" | "xcoördinaat" | "xcoordinate" => {
            ExportField::X
        }
        "y" | "y[mm]" | "y[m]" | "y(mm)" | "y(m)" | "ycoördinaat" | "ycoordinate" => {
            ExportField::Y
        }
        "fed" | "fed[kn]" | "fed(kn)" | "designload" | "belasting" => ExportField::DesignLoad,
        "type" | "pilesize[mm]" | "pilesize" | "paalafmeting" | "afmeting" | "maat" | "size" => {
            ExportField::PileSize
        }
        "leveltovnap" | "piletiplevel[m]" | "piletiplevel[mm]" | "inheiniveau" | "puntniveau"
        | "tiplevel" => ExportField::TipLevel,
        "inheicode" | "tipcode" => ExportField::TipCode,
        "selectedcpts" | "cpts" | "geselecteerdesonderingen" => ExportField::SelectedCpts,
        "wijzigingscode" | "wijziging" | "changecode" | "changecodes" => ExportField::ChangeCode,
        _ => return None,
    })
}

fn header_index(table: &SourceTable, requested: Option<usize>) -> Result<usize, ExportError> {
    if let Some(row) = requested {
        return table
            .rows
            .iter()
            .position(|r| r.number == row)
            .ok_or_else(|| error("revision_invalid_header_row"));
    }
    table
        .rows
        .iter()
        .enumerate()
        .max_by_key(|(i, row)| {
            (
                row.cells
                    .iter()
                    .filter(|c| suggested_field(&c.as_text()).is_some())
                    .count(),
                row.cells
                    .iter()
                    .filter(|c| matches!(c,TableCell::Text(s) if !s.trim().is_empty()))
                    .count(),
                usize::MAX - *i,
            )
        })
        .map(|(i, _)| i)
        .ok_or_else(|| error("revision_empty_source"))
}

pub(super) fn inspected_source(
    source: &RevisionSource,
) -> Result<(SourceTable, usize, PileTableInspection), ExportError> {
    let tables = match source.format {
        SourceFormat::Csv => {
            vec![
                read_source_table(&source.file_name, source.format, &source.bytes)
                    .map_err(|_| error("revision_invalid_source"))?,
            ]
        }
        SourceFormat::Xlsx => read_xlsx_tables(&source.file_name, &source.bytes)
            .map_err(|_| error("revision_invalid_source"))?,
    };
    let sheet_names = tables.iter().filter_map(|t| t.sheet_name.clone()).collect();
    let mut candidates = Vec::new();
    for (index, table) in tables.iter().enumerate() {
        if source
            .sheet_name
            .as_ref()
            .is_some_and(|name| table.sheet_name.as_ref() != Some(name))
        {
            continue;
        }
        let header = match header_index(table, source.header_row) {
            Ok(header) => header,
            Err(_) if source.sheet_name.is_none() && source.header_row.is_none() => continue,
            Err(error) => return Err(error),
        };
        let score = table.rows[header]
            .cells
            .iter()
            .filter(|c| suggested_field(&c.as_text()).is_some())
            .count();
        candidates.push((index, header, score));
    }
    candidates.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
    let (index, head, score) = *candidates
        .first()
        .ok_or_else(|| error("revision_missing_sheet"))?;
    let ambiguous_sheet =
        source.sheet_name.is_none() && candidates.iter().skip(1).any(|c| c.2 == score);
    let table = tables[index].clone();
    let mut headers: Vec<_> = table.rows[head]
        .cells
        .iter()
        .map(TableCell::as_text)
        .collect();
    while headers.last().is_some_and(|s| s.trim().is_empty()) {
        headers.pop();
    }
    if headers.is_empty() {
        return Err(error("revision_invalid_columns"));
    }
    let mut occurrences: HashMap<_, Vec<_>> = HashMap::new();
    for (i, header) in headers.iter().enumerate() {
        if let Some(field) = suggested_field(header) {
            occurrences.entry(field).or_default().push(i);
        }
    }
    let mut mapping = PileTableMapping::default();
    for (field, indices) in occurrences {
        if indices.len() == 1 {
            mapping.columns.insert(field, indices[0]);
        }
    }
    for field in [ExportField::X, ExportField::Y, ExportField::TipLevel] {
        if let Some(index) = mapping.columns.get(&field) {
            let header = key(&headers[*index]);
            let unit = if header.contains("[mm]") || header.contains("(mm)") {
                Some(ExportLengthUnit::Mm)
            } else if header.contains("[m]") || header.contains("(m)") {
                Some(ExportLengthUnit::M)
            } else {
                None
            };
            if let Some(unit) = unit {
                if field == ExportField::TipLevel {
                    mapping.tip_unit = unit;
                } else {
                    mapping.coordinate_unit = unit;
                }
            }
        }
    }
    let rows = table.rows[head + 1..]
        .iter()
        .filter(|r| r.cells.iter().any(|c| !c.as_text().trim().is_empty()))
        .take(8)
        .map(|r| {
            (0..headers.len())
                .map(|i| r.cells.get(i).map(cell_value).unwrap_or_default())
                .collect()
        })
        .collect();
    let mut source_columns = source_output_columns(&headers, &mapping);
    if !source_columns
        .iter()
        .any(|c| c.field == ExportField::ChangeCode)
    {
        let mut column = ExportColumn::new(ExportField::ChangeCode, "Change code", "change");
        column.use_default_header = true;
        source_columns.push(column);
    }
    let inspection = PileTableInspection {
        source_columns,
        sheet_names,
        sheet_name: table.sheet_name.clone(),
        header_row: table.rows[head].number,
        ambiguous_sheet,
        headers: headers.clone(),
        mapping,
        table: ExportTable { headers, rows },
    };
    Ok((table, head, inspection))
}
pub fn inspect_pile_table(
    request: &InspectPileTableRequest,
) -> Result<PileTableInspection, ExportError> {
    Ok(inspected_source(&request.source)?.2)
}

pub(super) fn source_output_columns(
    headers: &[String],
    mapping: &PileTableMapping,
) -> Vec<ExportColumn> {
    headers
        .iter()
        .enumerate()
        .map(|(i, header)| {
            let field = mapping
                .columns
                .iter()
                .find(|(_, index)| **index == i)
                .map(|(field, _)| *field)
                .unwrap_or(ExportField::Source);
            let mut column = ExportColumn::new(field, header, format!("source:{i}"));
            column.source_index = Some(i);
            column
        })
        .collect()
}
