use rust_xlsxwriter::{Color, Format, Workbook};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ExportError;

/// A typed, flat interchange table. A missing source value stays null.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExportTable {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Value>>,
}

impl ExportTable {
    pub fn write_csv(&self) -> Result<Vec<u8>, ExportError> {
        self.validate()?;
        let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());
        writer.write_record(&self.headers).map_err(error)?;
        for row in &self.rows {
            writer
                .write_record(row.iter().map(|value| match value {
                    Value::Null => String::new(),
                    Value::String(text) => text.clone(),
                    other => other.to_string(),
                }))
                .map_err(error)?;
        }
        writer.into_inner().map_err(error)
    }

    pub fn write_xlsx(&self, sheet_name: &str) -> Result<Vec<u8>, ExportError> {
        self.validate()?;
        let mut book = Workbook::new();
        let sheet = book.add_worksheet();
        sheet.set_name(sheet_name).map_err(error)?;
        let header_format = Format::new()
            .set_bold()
            .set_font_color(Color::White)
            .set_background_color(Color::RGB(0xED7100));
        for (col, header) in self.headers.iter().enumerate() {
            sheet
                .write_string_with_format(0, col as u16, header, &header_format)
                .map_err(error)?;
            sheet
                .set_column_width(
                    col as u16,
                    (header.chars().count() + 3).clamp(14, 30) as f64,
                )
                .map_err(error)?;
        }
        for (index, row) in self.rows.iter().enumerate() {
            let r = index as u32 + 1;
            for (col, value) in row.iter().enumerate() {
                match value {
                    Value::Null => {}
                    Value::String(text) => {
                        sheet.write_string(r, col as u16, text).map_err(error)?;
                    }
                    Value::Bool(value) => {
                        sheet.write_boolean(r, col as u16, *value).map_err(error)?;
                    }
                    Value::Number(number) => {
                        sheet
                            .write_number(
                                r,
                                col as u16,
                                number.as_f64().ok_or_else(|| error("Invalid number"))?,
                            )
                            .map_err(error)?;
                    }
                    _ => return Err(error("Only scalar table cells are supported")),
                }
            }
        }
        sheet.set_freeze_panes(1, 0).map_err(error)?;
        if !self.headers.is_empty() {
            sheet
                .autofilter(
                    0,
                    0,
                    self.rows.len() as u32,
                    (self.headers.len() - 1) as u16,
                )
                .map_err(error)?;
        }
        book.save_to_buffer().map_err(error)
    }

    fn validate(&self) -> Result<(), ExportError> {
        if self.headers.is_empty() || self.headers.len() > 16_384 || self.rows.len() > 1_048_575 {
            return Err(error("Invalid table dimensions"));
        }
        for row in &self.rows {
            if row.len() != self.headers.len() || row.iter().any(|v| v.is_array() || v.is_object())
            {
                return Err(error("Invalid table row"));
            }
        }
        Ok(())
    }
}

fn error(value: impl std::fmt::Display) -> ExportError {
    ExportError(value.to_string())
}
