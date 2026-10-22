use std::collections::BTreeSet;
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
    pub formula_cells: BTreeSet<(usize, usize)>,
    pub file_name: String,
    pub sheet_name: Option<String>,
    pub rows: Vec<SourceRow>,
}

impl SourceTable {
    pub fn has_formula(&self, row: usize, column: usize) -> bool {
        self.formula_cells.contains(&(row, column))
    }
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
        formula_cells: BTreeSet::new(),
        file_name: file_name.to_string(),
        sheet_name: None,
        rows,
    })
}

fn read_xlsx(file_name: &str, bytes: &[u8]) -> Result<SourceTable, ImportError> {
    read_xlsx_tables(file_name, bytes)?
        .into_iter()
        .next()
        .ok_or_else(|| ImportError::MissingWorksheet(file_name.to_string()))
}

pub fn read_xlsx_tables(file_name: &str, bytes: &[u8]) -> Result<Vec<SourceTable>, ImportError> {
    if bytes.is_empty() {
        return Err(ImportError::EmptySource(file_name.to_string()));
    }

    let mut workbook: Xlsx<_> =
        Xlsx::new(Cursor::new(bytes)).map_err(|error| ImportError::Excel {
            file_name: file_name.to_string(),
            message: error.to_string(),
        })?;
    let mut tables = Vec::new();
    for sheet_name in workbook.sheet_names().to_vec() {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| ImportError::Excel {
                file_name: file_name.to_string(),
                message: error.to_string(),
            })?;
        let formulas =
            workbook
                .worksheet_formula(&sheet_name)
                .map_err(|error| ImportError::Excel {
                    file_name: file_name.to_owned(),
                    message: error.to_string(),
                })?;
        let formula_cells: BTreeSet<_> = formulas
            .used_cells()
            .filter(|(_, _, formula)| !formula.is_empty())
            .map(|(r, c, _)| {
                let (sr, sc) = formulas.start().unwrap_or_default();
                (sr as usize + r + 1, sc as usize + c + 1)
            })
            .collect();
        let max_row = range
            .end()
            .map(|p| p.0 as usize + 1)
            .unwrap_or(0)
            .max(formula_cells.iter().map(|p| p.0).max().unwrap_or(0));
        let max_col = range
            .end()
            .map(|p| p.1 as usize + 1)
            .unwrap_or(0)
            .max(formula_cells.iter().map(|p| p.1).max().unwrap_or(0));
        let mut rows = Vec::new();
        for r in 0..max_row {
            let cells: Vec<_> = (0..max_col)
                .map(|c| {
                    range
                        .get_value((r as u32, c as u32))
                        .map(from_excel_cell)
                        .unwrap_or(TableCell::Empty)
                })
                .collect();
            if cells.iter().any(|cell| !cell.is_empty())
                || formula_cells.iter().any(|p| p.0 == r + 1)
            {
                rows.push(SourceRow {
                    number: r + 1,
                    cells,
                });
            }
        }
        if !rows.is_empty() {
            tables.push(SourceTable {
                formula_cells,
                file_name: file_name.to_string(),
                sheet_name: Some(sheet_name),
                rows,
            });
        }
    }

    if tables.is_empty() {
        Err(ImportError::MissingWorksheet(file_name.to_string()))
    } else {
        Ok(tables)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xlsx_preserves_physical_offsets() {
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.write_string(6, 2, "Sondering").unwrap();
        sheet.write_number(8, 3, 123.0).unwrap();
        let tables = read_xlsx_tables("offset.xlsx", &book.save_to_buffer().unwrap()).unwrap();
        assert_eq!(tables[0].rows[0].number, 7);
        assert_eq!(tables[0].rows[0].cells[2].as_text(), "Sondering");
        assert_eq!(tables[0].rows[1].number, 9);
        assert_eq!(tables[0].rows[1].cells[3], TableCell::Number(123.0));
    }

    #[test]
    fn reads_every_non_empty_rfem_worksheet() {
        let tables = read_xlsx_tables(
            "Export RFEM.xlsx",
            include_bytes!("../../../../sample_project/Export RFEM.xlsx"),
        )
        .unwrap();

        assert!(tables
            .iter()
            .any(|table| table.sheet_name.as_deref() == Some("1.1 Knopen")));
        assert!(tables.iter().any(|table| {
            table
                .sheet_name
                .as_deref()
                .is_some_and(|name| name.contains("Reactiekrach"))
        }));
    }
}
