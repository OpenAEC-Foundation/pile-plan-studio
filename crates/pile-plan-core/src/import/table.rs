use std::io::Cursor;

use calamine::{Data, Reader, Xlsx};
use serde::{Deserialize, Serialize};

use super::ImportError;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Csv,
    Xlsx,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TableCell {
    Empty,
    Text(String),
    Number(f64),
    Bool(bool),
}

impl TableCell {
    pub fn as_text(&self) -> String {
        match self {
            Self::Empty => String::new(),
            Self::Text(value) => value.clone(),
            Self::Number(value) => value.to_string(),
            Self::Bool(value) => value.to_string(),
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        matches!(self, Self::Empty) || matches!(self, Self::Text(value) if value.trim().is_empty())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SourceLocation {
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub row: Option<usize>,
    pub column: Option<usize>,
    pub column_name: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SourceRow {
    pub number: usize,
    pub cells: Vec<TableCell>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SourceTable {
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub rows: Vec<SourceRow>,
}

impl SourceTable {
    pub fn location(
        &self,
        row: Option<usize>,
        column: Option<usize>,
        column_name: Option<&'static str>,
    ) -> SourceLocation {
        SourceLocation {
            file_name: self.file_name.clone(),
            sheet_name: self.sheet_name.clone(),
            row,
            column,
            column_name,
        }
    }
}

pub fn read_source_table(
    file_name: &str,
    format: SourceFormat,
    bytes: &[u8],
) -> Result<SourceTable, ImportError> {
    match format {
        SourceFormat::Csv => read_csv(file_name, bytes),
        SourceFormat::Xlsx => read_xlsx(file_name, bytes),
    }
}

fn read_csv(file_name: &str, bytes: &[u8]) -> Result<SourceTable, ImportError> {
    if bytes.is_empty() {
        return Err(ImportError::EmptySource(file_name.to_string()));
    }

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(bytes);
    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|error| ImportError::Csv {
            file_name: file_name.to_string(),
            message: error.to_string(),
        })?;
        let row_number = record
            .position()
            .map(|position| {
                let mut start = position.byte() as usize;
                while matches!(bytes.get(start), Some(b'\r' | b'\n')) {
                    start += 1;
                }
                bytes[..start].iter().filter(|&&byte| byte == b'\n').count() + 1
            })
            .unwrap_or(rows.len() + 1);
        let row: Vec<_> = record
            .iter()
            .map(|value| TableCell::Text(value.to_string()))
            .collect();
        if !row.iter().all(TableCell::is_empty) {
            rows.push(SourceRow {
                number: row_number,
                cells: row,
            });
        }
    }

    if rows.is_empty() {
        return Err(ImportError::EmptySource(file_name.to_string()));
    }

    Ok(SourceTable {
        file_name: file_name.to_string(),
        sheet_name: None,
        rows,
    })
}

fn read_xlsx(file_name: &str, bytes: &[u8]) -> Result<SourceTable, ImportError> {
    if bytes.is_empty() {
        return Err(ImportError::EmptySource(file_name.to_string()));
    }

    let mut workbook: Xlsx<_> =
        Xlsx::new(Cursor::new(bytes)).map_err(|error| ImportError::Excel {
            file_name: file_name.to_string(),
            message: error.to_string(),
        })?;
    for sheet_name in workbook.sheet_names().to_vec() {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| ImportError::Excel {
                file_name: file_name.to_string(),
                message: error.to_string(),
            })?;
        let rows: Vec<SourceRow> = range
            .rows()
            .enumerate()
            .map(|(index, row)| SourceRow {
                number: index + 1,
                cells: row.iter().map(from_excel_cell).collect(),
            })
            .filter(|row| !row.cells.iter().all(TableCell::is_empty))
            .collect();
        if !rows.is_empty() {
            return Ok(SourceTable {
                file_name: file_name.to_string(),
                sheet_name: Some(sheet_name),
                rows,
            });
        }
    }

    Err(ImportError::MissingWorksheet(file_name.to_string()))
}

fn from_excel_cell(cell: &Data) -> TableCell {
    match cell {
        Data::Empty => TableCell::Empty,
        Data::String(value) => TableCell::Text(value.clone()),
        Data::Float(value) => TableCell::Number(*value),
        Data::Int(value) => TableCell::Number(*value as f64),
        Data::Bool(value) => TableCell::Bool(*value),
        other => TableCell::Text(other.to_string()),
    }
}
