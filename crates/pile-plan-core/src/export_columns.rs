use crate::{ExportError, ExportTable, PileCostShape};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportField {
    LoadPointId,
    Mark,
    X,
    Y,
    DesignLoad,
    PileSize,
    TipLevel,
    TipCode,
    SelectedCpts,
    ChangeCode,
    Source,
    Literal,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportLengthUnit {
    Mm,
    M,
}

impl ExportLengthUnit {
    pub fn to_mm(self, value: f64) -> f64 {
        if self == Self::M {
            value * 1000.0
        } else {
            value
        }
    }
    pub fn from_mm(self, value: f64) -> f64 {
        if self == Self::M {
            value / 1000.0
        } else {
            value
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PileSizeNotation {
    Numeric,
    Dimensions,
    Custom,
}

fn enabled() -> bool {
    true
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExportColumn {
    pub key: String,
    pub field: ExportField,
    pub header: String,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub use_default_header: bool,
    #[serde(default)]
    pub source_index: Option<usize>,
    #[serde(default)]
    pub size_format: Option<PileSizeNotation>,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub unit: Option<ExportLengthUnit>,
    #[serde(default)]
    pub value: String,
}

impl ExportColumn {
    pub(crate) fn new(
        field: ExportField,
        header: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self {
            key: key.into(),
            field,
            header: header.into(),
            enabled: true,
            use_default_header: false,
            source_index: None,
            size_format: None,
            template: None,
            unit: None,
            value: String::new(),
        }
    }
}

pub(crate) struct ColumnRecord {
    /// Coordinates and tip levels are canonical millimetres; IDs/loads retain their own units.
    pub values: HashMap<ExportField, Value>,
    pub pile_size: Option<(u32, Option<PileCostShape>)>,
    pub source: Vec<Value>,
}

pub(crate) fn validate_columns(columns: &[ExportColumn]) -> Result<(), ExportError> {
    let mut keys = HashSet::new();
    let mut headers = HashSet::new();
    let mut count = 0;
    for column in columns {
        if column.key.is_empty() || !keys.insert(&column.key) {
            return Err(error("invalid_export_columns"));
        }
        if !column.enabled {
            continue;
        }
        count += 1;
        if column.header.trim().is_empty() || !headers.insert(column.header.trim().to_lowercase()) {
            return Err(error("invalid_export_headers"));
        }
        if column.unit.is_some()
            && !matches!(
                column.field,
                ExportField::X | ExportField::Y | ExportField::TipLevel
            )
        {
            return Err(error("invalid_export_columns"));
        }
        if column.size_format.is_some() && column.field != ExportField::PileSize {
            return Err(error("invalid_export_columns"));
        }
        if column.field == ExportField::Source && column.source_index.is_none() {
            return Err(error("invalid_export_columns"));
        }
        if column.size_format == Some(PileSizeNotation::Custom) {
            format_size(290, Some(PileCostShape::Square), column)?;
        }
    }
    if count == 0 {
        return Err(error("export_no_columns"));
    }
    Ok(())
}

pub(crate) fn project_columns(
    columns: &[ExportColumn],
    records: &[ColumnRecord],
) -> Result<ExportTable, ExportError> {
    validate_columns(columns)?;
    let active: Vec<_> = columns.iter().filter(|c| c.enabled).collect();
    let rows = records
        .iter()
        .map(|record| {
            active
                .iter()
                .map(|column| column_value(column, record))
                .collect()
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ExportTable {
        headers: active.iter().map(|c| c.header.clone()).collect(),
        rows,
    })
}

fn column_value(column: &ExportColumn, record: &ColumnRecord) -> Result<Value, ExportError> {
    if column.field == ExportField::Literal {
        return Ok(json!(column.value));
    }
    if let Some(index) = column.source_index {
        if column.field != ExportField::ChangeCode
            && column.size_format.is_none()
            && column.unit.is_none()
        {
            return record
                .source
                .get(index)
                .cloned()
                .ok_or_else(|| error("invalid_export_columns"));
        }
    }
    if column.field == ExportField::Source {
        return Err(error("invalid_export_columns"));
    }
    if column.field == ExportField::PileSize {
        return record
            .pile_size
            .as_ref()
            .map(|(size, shape)| format_size(*size, shape.clone(), column))
            .unwrap_or(Ok(Value::Null));
    }
    let value = record
        .values
        .get(&column.field)
        .cloned()
        .unwrap_or_default();
    if matches!(
        column.field,
        ExportField::X | ExportField::Y | ExportField::TipLevel
    ) {
        let unit = column
            .unit
            .unwrap_or(if column.field == ExportField::TipLevel {
                ExportLengthUnit::M
            } else {
                ExportLengthUnit::Mm
            });
        return Ok(value
            .as_f64()
            .map(|n| json!(unit.from_mm(n)))
            .unwrap_or(Value::Null));
    }
    Ok(value)
}

pub(crate) fn format_size(
    size: u32,
    shape: Option<PileCostShape>,
    column: &ExportColumn,
) -> Result<Value, ExportError> {
    match column.size_format.unwrap_or(PileSizeNotation::Numeric) {
        PileSizeNotation::Numeric => Ok(json!(size)),
        PileSizeNotation::Dimensions => Ok(match shape {
            Some(PileCostShape::Square) => json!(format!("{size}x{size}")),
            Some(PileCostShape::Round) => json!(format!("Ø{size}")),
            None => json!(size),
        }),
        PileSizeNotation::Custom => {
            let mut text = column.template.clone().unwrap_or_default();
            if text.trim().is_empty() {
                return Err(error("invalid_size_template"));
            }
            for token in ["{size}", "{width}", "{height}", "{diameter}"] {
                text = text.replace(token, &size.to_string());
            }
            if text.contains(['{', '}']) {
                return Err(error("invalid_size_template"));
            }
            Ok(json!(text))
        }
    }
}

fn error(code: &str) -> ExportError {
    ExportError(code.into())
}
