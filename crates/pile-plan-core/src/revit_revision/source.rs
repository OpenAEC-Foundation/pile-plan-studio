use super::inspection::{inspected_source, PileTableMapping};
use crate::import::{parse_finite_number, TableCell};
use crate::{
    try_pile_tip_level_mm, ExportError, ExportField, ExportTable, PileCostShape,
    PilePlanExportRequest, SourceFormat,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RevisionSource {
    pub file_name: String,
    pub format: SourceFormat,
    pub bytes: Vec<u8>,
    #[serde(default)]
    pub sheet_name: Option<String>,
    #[serde(default)]
    pub header_row: Option<usize>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RevisionLocation {
    pub id: u32,
    pub source_id: Option<u32>,
    pub export_id: Option<u32>,
    pub mark: Option<u32>,
    pub x_mm: f64,
    pub y_mm: f64,
    pub pile_size_mm: Option<u32>,
    pub shape: Option<PileCostShape>,
    pub tip_level_mm: Option<i64>,
    pub design_load_kn: Option<f64>,
    pub selected_cpts: Option<String>,
}
pub(super) struct ParsedPileTable {
    pub table: ExportTable,
    pub locations: Vec<RevisionLocation>,
    pub mapping: PileTableMapping,
}
pub(super) fn key(s: &str) -> String {
    s.trim_start_matches('\u{feff}')
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}
pub(super) fn error(code: &str) -> ExportError {
    ExportError(code.into())
}
pub(super) fn cell_value(cell: &TableCell) -> Value {
    match cell {
        TableCell::Empty => Value::Null,
        TableCell::Text(s) if s.is_empty() => Value::Null,
        TableCell::Text(s) => json!(s),
        TableCell::Number(n) => json!(n),
        TableCell::Bool(b) => json!(b),
    }
}
fn number(text: &str) -> Result<f64, ExportError> {
    parse_finite_number(text).map_err(|_| error("revision_invalid_row"))
}
fn integer(text: &str, positive: bool) -> Result<u32, ExportError> {
    let n = number(text)?;
    if n.fract() != 0.0 || n < f64::from(positive) || n > u32::MAX as f64 {
        return Err(error("revision_invalid_row"));
    }
    Ok(n as u32)
}

fn size(
    text: &str,
    known: &HashMap<u32, PileCostShape>,
    template: Option<&str>,
) -> Result<(u32, Option<PileCostShape>), ExportError> {
    let raw = text.trim().replace(['X', '×'], "x").replace(' ', "");
    let (n, shape) = if let Some(template) = template.filter(|s| !s.is_empty()) {
        let tokens = ["{size}", "{width}", "{height}", "{diameter}"];
        let position = tokens
            .iter()
            .filter_map(|token| template.find(token))
            .min()
            .ok_or_else(|| error("invalid_size_template"))?;
        let prefix = &template[..position];
        let tail = text
            .strip_prefix(prefix)
            .ok_or_else(|| error("revision_invalid_size"))?;
        let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
        let n = number(&digits)?;
        let mut reconstructed = template.to_string();
        for token in tokens {
            reconstructed = reconstructed.replace(token, &digits);
        }
        if reconstructed != text {
            return Err(error("revision_invalid_size"));
        }
        let shape = if template.contains('x') || template.contains('×') {
            Some(PileCostShape::Square)
        } else if template.contains('Ø') {
            Some(PileCostShape::Round)
        } else {
            None
        };
        (n, shape)
    } else if let Some((a, b)) = raw.split_once('x') {
        let n = number(a)?;
        if n != number(b)? {
            return Err(error("revision_invalid_size"));
        }
        (n, Some(PileCostShape::Square))
    } else if raw.starts_with(['Ø', 'ø', '⌀']) {
        (
            number(&raw.chars().skip(1).collect::<String>())?,
            Some(PileCostShape::Round),
        )
    } else {
        (number(&raw)?, None)
    };
    if n < 1.0 || n > u32::MAX as f64 || n.fract() != 0.0 {
        return Err(error("revision_invalid_size"));
    }
    let n = n as u32;
    Ok((n, shape.or_else(|| known.get(&n).cloned())))
}

pub(super) fn parse_pile_table(
    source: &RevisionSource,
    requested: Option<&PileTableMapping>,
    known: &HashMap<u32, PileCostShape>,
    new_plan: bool,
) -> Result<ParsedPileTable, ExportError> {
    let (table, head, inspection) = inspected_source(source)?;
    if inspection.ambiguous_sheet {
        return Err(error("revision_ambiguous_sheet"));
    }
    let mapping = requested.cloned().unwrap_or(inspection.mapping);
    if mapping
        .columns
        .values()
        .any(|i| *i >= inspection.headers.len())
    {
        return Err(error("revision_invalid_columns"));
    }
    let mut indices = HashSet::new();
    if mapping.columns.values().any(|i| !indices.insert(*i)) {
        return Err(error("revision_invalid_columns"));
    }
    for field in [ExportField::X, ExportField::Y] {
        if !mapping.columns.contains_key(&field) {
            return Err(error("revision_missing_coordinates"));
        }
    }
    if new_plan {
        if !mapping.columns.contains_key(&ExportField::LoadPointId)
            && !mapping.columns.contains_key(&ExportField::ExportId)
        {
            return Err(error("revision_incomplete_plan"));
        }
        for field in [ExportField::PileSize, ExportField::TipLevel] {
            if !mapping.columns.contains_key(&field) {
                return Err(error("revision_incomplete_plan"));
            }
        }
    }
    let no_shapes = HashMap::new();
    let mut locations = Vec::new();
    let mut rows = Vec::new();
    let mut marks = HashSet::new();
    let mut new_ids = HashSet::new();
    for row in &table.rows[head + 1..] {
        if row.cells.iter().all(|c| c.as_text().trim().is_empty()) {
            continue;
        }
        let text = |field: ExportField| {
            mapping
                .columns
                .get(&field)
                .and_then(|i| row.cells.get(*i))
                .map(TableCell::as_text)
                .filter(|s| !s.trim().is_empty())
        };
        let mark = text(ExportField::Mark)
            .map(|s| integer(&s, true))
            .transpose()?;
        if mark.is_some_and(|n| !marks.insert(n)) {
            return Err(error("revision_duplicate_mark"));
        }
        let export_id = text(ExportField::ExportId)
            .map(|s| integer(&s, false))
            .transpose()?;
        let source_id = text(ExportField::LoadPointId)
            .map(|s| integer(&s, false))
            .transpose()?;
        if new_plan
            && (export_id.or(source_id).is_none()
                || !new_ids.insert(export_id.or(source_id).unwrap()))
        {
            return Err(error("revision_duplicate_id"));
        }
        let x_mm = mapping.coordinate_unit.to_mm(number(
            &text(ExportField::X).ok_or_else(|| error("revision_missing_coordinates"))?,
        )?);
        let y_mm = mapping.coordinate_unit.to_mm(number(
            &text(ExportField::Y).ok_or_else(|| error("revision_missing_coordinates"))?,
        )?);
        if !x_mm.is_finite() || !y_mm.is_finite() {
            return Err(error("revision_invalid_row"));
        }
        let parsed_size = text(ExportField::PileSize)
            .map(|s| {
                size(
                    &s,
                    if new_plan && mapping.size_shape.is_none() {
                        known
                    } else {
                        &no_shapes
                    },
                    mapping.size_template.as_deref(),
                )
                .map(|(n, shape)| (n, shape.or_else(|| mapping.size_shape.clone())))
            })
            .transpose()?;
        let tip_level_mm = text(ExportField::TipLevel)
            .map(|s| {
                let mm = mapping.tip_unit.to_mm(number(&s)?);
                try_pile_tip_level_mm(mm / 1000.0).map_err(|_| error("revision_invalid_level"))
            })
            .transpose()?;
        if new_plan && (parsed_size.is_none() || tip_level_mm.is_none()) {
            return Err(error("revision_incomplete_plan"));
        }
        if new_plan && parsed_size.as_ref().is_some_and(|(_, s)| s.is_none()) {
            return Err(error("revision_unknown_shape"));
        }
        let design_load_kn = text(ExportField::DesignLoad)
            .map(|s| number(&s))
            .transpose()?;
        let selected_cpts = text(ExportField::SelectedCpts);
        let mut values: Vec<_> = (0..inspection.headers.len())
            .map(|i| row.cells.get(i).map(cell_value).unwrap_or_default())
            .collect();
        for (field, value) in [
            (ExportField::Mark, json!(mark)),
            (ExportField::LoadPointId, json!(source_id)),
            (ExportField::X, json!(mapping.coordinate_unit.from_mm(x_mm))),
            (ExportField::Y, json!(mapping.coordinate_unit.from_mm(y_mm))),
            (
                ExportField::TipLevel,
                json!(tip_level_mm.map(|n| mapping.tip_unit.from_mm(n as f64))),
            ),
            (ExportField::DesignLoad, json!(design_load_kn)),
        ] {
            if let Some(index) = mapping.columns.get(&field) {
                values[*index] = value;
            }
        }
        locations.push(RevisionLocation {
            id: 0,
            source_id,
            export_id,
            mark,
            x_mm,
            y_mm,
            pile_size_mm: parsed_size.as_ref().map(|s| s.0),
            shape: parsed_size.and_then(|s| s.1),
            tip_level_mm,
            design_load_kn,
            selected_cpts,
        });
        rows.push(values);
    }
    if locations.is_empty() {
        return Err(error("revision_empty_source"));
    }
    let mut next = marks.iter().max().copied().unwrap_or(0);
    for location in &mut locations {
        location.id = if new_plan {
            location.export_id.or(location.source_id).unwrap()
        } else if let Some(mark) = location.mark {
            mark
        } else {
            next = next.checked_add(1).ok_or_else(|| error("mark_overflow"))?;
            next
        };
    }
    Ok(ParsedPileTable {
        table: ExportTable {
            headers: inspection.headers,
            rows,
        },
        locations,
        mapping,
    })
}

pub(super) fn new_locations(
    plan: &PilePlanExportRequest,
) -> Result<Vec<RevisionLocation>, ExportError> {
    let mut ids = HashSet::new();
    plan.load_points
        .iter()
        .map(|point| {
            if !ids.insert(point.id) {
                return Err(error("revision_duplicate_id"));
            }
            let pile = plan
                .selected_piles
                .get(&point.id)
                .ok_or_else(|| error("revision_incomplete_plan"))?;
            let shape = plan
                .pile_shapes
                .get(&pile.pile_size_mm)
                .cloned()
                .ok_or_else(|| error("revision_unknown_shape"))?;
            if pile.pile_size_mm == 0 {
                return Err(error("revision_invalid_size"));
            }
            Ok(RevisionLocation {
                id: point.id,
                source_id: Some(point.id),
                export_id: Some(point.id),
                mark: None,
                x_mm: point.x_mm,
                y_mm: point.y_mm,
                pile_size_mm: Some(pile.pile_size_mm),
                shape: Some(shape),
                tip_level_mm: Some(pile.pile_tip_level_mm),
                design_load_kn: Some(point.design_load_kn),
                selected_cpts: Some(
                    plan.selected_cpts
                        .get(&point.id)
                        .map(|ids| {
                            ids.iter()
                                .map(u32::to_string)
                                .collect::<Vec<_>>()
                                .join(", ")
                        })
                        .unwrap_or_default(),
                ),
            })
        })
        .collect()
}
