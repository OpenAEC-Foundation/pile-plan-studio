use crate::{ExportError, ExportTable, PileCostShape};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportField {
    LoadPointId,
    ExportId,
    OriginalLocations,
    ProposalCode,
    TensionLoad,
    TensionResistance,
    TensionUtilization,
    GoverningTensionCpt,
    CompressionStatus,
    TensionStatus,
    AssessmentScope,
    CompressionResistance,
    CompressionUtilization,
    GoverningCpt,
    PileCost,
    PileLength,
    TechnicalStatus,
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

/// Presentation values only; engineering status is supplied by the core analysis.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ExportStatusValues {
    pub valid: String,
    pub insufficient: String,
    pub missing: String,
    pub no_cpts: String,
    pub unassigned: String,
    pub no_load: Option<String>,
    pub not_assessed: Option<String>,
    pub missing_demand: Option<String>,
}
impl ExportStatusValues {
    fn value(&self, code: &str) -> Option<&str> {
        Some(match code {
            "no_load" => return self.no_load.as_deref(),
            "not_assessed" => return self.not_assessed.as_deref(),
            "missing_demand" => return self.missing_demand.as_deref(),
            "valid" => &self.valid,
            "insufficient" => &self.insufficient,
            "missing" => &self.missing,
            "no_cpts" => &self.no_cpts,
            "unassigned" => &self.unassigned,
            _ => return None,
        })
    }
}

fn enabled() -> bool {
    true
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportCoordinateSource {
    #[default]
    OldWithinTolerance,
    New,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExportColumn {
    #[serde(default)]
    pub coordinate_source: Option<ExportCoordinateSource>,
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
    #[serde(default)]
    pub status_values: Option<ExportStatusValues>,
}

impl ExportColumn {
    pub(crate) fn new(
        field: ExportField,
        header: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self {
            coordinate_source: None,
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
            status_values: None,
        }
    }
}

pub(crate) struct ColumnRecord {
    pub previous_coordinates: Option<(f64, f64)>,
    pub source_coordinate_unit: Option<ExportLengthUnit>,
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
        if column.coordinate_source.is_some()
            && !matches!(column.field, ExportField::X | ExportField::Y)
        {
            return Err(error("invalid_export_columns"));
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
        if column.status_values.is_some()
            && !matches!(
                column.field,
                ExportField::TechnicalStatus
                    | ExportField::CompressionStatus
                    | ExportField::TensionStatus
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
    if matches!(column.field, ExportField::X | ExportField::Y) {
        let previous = if column.coordinate_source.unwrap_or_default()
            == ExportCoordinateSource::OldWithinTolerance
        {
            record
                .previous_coordinates
                .map(|(x, y)| if column.field == ExportField::X { x } else { y })
        } else {
            None
        };
        let value = previous.or_else(|| record.values.get(&column.field).and_then(Value::as_f64));
        let unit = column
            .unit
            .or_else(|| column.source_index.and(record.source_coordinate_unit))
            .unwrap_or(ExportLengthUnit::Mm);
        return Ok(value.map(|n| json!(unit.from_mm(n))).unwrap_or(Value::Null));
    }
    if matches!(
        column.field,
        ExportField::TechnicalStatus | ExportField::CompressionStatus | ExportField::TensionStatus
    ) {
        if let Some(status) = record
            .values
            .get(&column.field)
            .filter(|value| value.is_object())
        {
            let code = status
                .get("code")
                .and_then(Value::as_str)
                .ok_or_else(|| error("invalid_export_status"))?;
            return match &column.status_values {
                Some(values) => values
                    .value(code)
                    .map(|value| json!(value))
                    .or_else(|| status.get("label").cloned().map(|v| v))
                    .ok_or_else(|| error("invalid_export_status")),
                None => Ok(status.get("label").cloned().unwrap_or(Value::Null)),
            };
        }
    }
    if column.field == ExportField::Literal {
        return Ok(json!(column.value));
    }
    if matches!(
        column.field,
        ExportField::LoadPointId
            | ExportField::ExportId
            | ExportField::OriginalLocations
            | ExportField::ProposalCode
            | ExportField::TensionLoad
            | ExportField::TensionResistance
            | ExportField::TensionUtilization
            | ExportField::GoverningTensionCpt
            | ExportField::CompressionStatus
            | ExportField::TensionStatus
            | ExportField::AssessmentScope
            | ExportField::CompressionResistance
            | ExportField::CompressionUtilization
            | ExportField::GoverningCpt
            | ExportField::PileCost
            | ExportField::PileLength
            | ExportField::TechnicalStatus
    ) {
        if let Some(value) = record.values.get(&column.field) {
            return Ok(value.clone());
        }
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
