use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    build_pile_plan_export_rows, ExportError, ExportTable, PilePlanExportRequest,
    PILE_PLAN_EXPORT_HEADERS,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberingAxis {
    X,
    #[default]
    Y,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberingDirection {
    Ascending,
    #[default]
    Descending,
}

fn ascending() -> NumberingDirection {
    NumberingDirection::Ascending
}
fn one_mm() -> f64 {
    1.0
}
fn one() -> u32 {
    1
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PileNumberingRule {
    pub axis: NumberingAxis,
    #[serde(default = "ascending")]
    pub x_direction: NumberingDirection,
    pub y_direction: NumberingDirection,
    #[serde(default = "one_mm")]
    pub tolerance_mm: f64,
}

impl Default for PileNumberingRule {
    fn default() -> Self {
        Self {
            axis: NumberingAxis::Y,
            x_direction: ascending(),
            y_direction: NumberingDirection::Descending,
            tolerance_mm: 1.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RevisionMarkMode {
    #[default]
    Preserve,
    Renumber,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PileMarkOptions {
    pub revision_mode: RevisionMarkMode,
    pub enabled: bool,
    #[serde(default = "one")]
    pub start: u32,
    pub rule: PileNumberingRule,
}

impl Default for PileMarkOptions {
    fn default() -> Self {
        Self {
            enabled: false,
            revision_mode: RevisionMarkMode::Preserve,
            start: 1,
            rule: PileNumberingRule::default(),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TipCodeSequence {
    #[default]
    Letters,
    Numbers,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct TipCodeRule {
    pub enabled: bool,
    pub sequence: TipCodeSequence,
    pub direction: NumberingDirection,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PilePlanExportOptions {
    pub include_proposals: bool,
    pub proposal_code: String,
    pub language: String,
    pub mark: PileMarkOptions,
    pub tip_code: TipCodeRule,
    pub columns: Option<Vec<crate::ExportColumn>>,
    pub change_codes: Option<crate::ChangeCodeOptions>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfiguredPilePlanExportRequest {
    pub plan: PilePlanExportRequest,
    #[serde(default)]
    pub export_options: PilePlanExportOptions,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NumberingPoint {
    pub id: u32,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileExportAnnotation {
    pub load_point_id: u32,
    pub mark: Option<u32>,
    pub tip_code: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TipLevelCode {
    pub level_mm: i64,
    pub code: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PilePlanExportPreview {
    pub replaced_count: usize,
    pub proposed_count: usize,
    pub table: ExportTable,
    pub annotations: Vec<PileExportAnnotation>,
    pub tip_codes: Vec<TipLevelCode>,
}

/// Form bounded groups before sorting their members: approximate comparison
/// between arbitrary point pairs would not define a transitive sort order.
pub fn order_numbering_locations(
    points: &[NumberingPoint],
    rule: &PileNumberingRule,
) -> Result<Vec<usize>, ExportError> {
    if !rule.tolerance_mm.is_finite() || rule.tolerance_mm < 0.0 {
        return Err(ExportError("invalid_numbering_tolerance".into()));
    }
    let mut ids = HashSet::new();
    for point in points {
        if !point.x_mm.is_finite() || !point.y_mm.is_finite() || !ids.insert(point.id) {
            return Err(ExportError("invalid_numbering_location".into()));
        }
    }
    let main = |i: usize| match rule.axis {
        NumberingAxis::X => points[i].x_mm,
        NumberingAxis::Y => points[i].y_mm,
    };
    let secondary = |i: usize| match rule.axis {
        NumberingAxis::X => points[i].y_mm,
        NumberingAxis::Y => points[i].x_mm,
    };
    let (main_dir, secondary_dir) = match rule.axis {
        NumberingAxis::X => (rule.x_direction, rule.y_direction),
        NumberingAxis::Y => (rule.y_direction, rule.x_direction),
    };
    let compare = |a: f64, b: f64, direction| {
        if direction == NumberingDirection::Ascending {
            a.total_cmp(&b)
        } else {
            b.total_cmp(&a)
        }
    };
    let mut indices: Vec<_> = (0..points.len()).collect();
    indices.sort_by(|a, b| {
        compare(main(*a), main(*b), main_dir).then(points[*a].id.cmp(&points[*b].id))
    });
    let mut start = 0;
    while start < indices.len() {
        let anchor = main(indices[start]);
        let mut end = start + 1;
        while end < indices.len() && (main(indices[end]) - anchor).abs() <= rule.tolerance_mm {
            end += 1;
        }
        indices[start..end].sort_by(|a, b| {
            compare(secondary(*a), secondary(*b), secondary_dir)
                .then_with(|| compare(main(*a), main(*b), main_dir))
                .then(points[*a].id.cmp(&points[*b].id))
        });
        start = end;
    }
    Ok(indices)
}

pub fn build_tip_level_codes(
    levels: impl IntoIterator<Item = i64>,
    rule: &TipCodeRule,
) -> Vec<TipLevelCode> {
    let levels: BTreeSet<_> = levels.into_iter().collect();
    let mut levels: Vec<_> = levels.into_iter().collect();
    if rule.direction == NumberingDirection::Descending {
        levels.reverse();
    }
    levels
        .into_iter()
        .enumerate()
        .map(|(i, level_mm)| TipLevelCode {
            level_mm,
            code: match rule.sequence {
                TipCodeSequence::Numbers => (i + 1).to_string(),
                TipCodeSequence::Letters => letter_code(i + 1),
            },
        })
        .collect()
}

fn letter_code(mut index: usize) -> String {
    let mut chars = Vec::new();
    while index > 0 {
        index -= 1;
        chars.push((b'A' + (index % 26) as u8) as char);
        index /= 26;
    }
    chars.into_iter().rev().collect()
}

pub fn preview_configured_pile_plan_export(
    request: &ConfiguredPilePlanExportRequest,
) -> Result<PilePlanExportPreview, ExportError> {
    let prepared = crate::export_context::prepare(&request.plan, &request.export_options)?;
    let request = &ConfiguredPilePlanExportRequest {
        plan: prepared.plan.clone(),
        export_options: request.export_options.clone(),
    };
    let options = &request.export_options;
    if options.mark.start == 0 {
        return Err(ExportError("invalid_mark_start".into()));
    }
    let all_points: Vec<_> = request
        .plan
        .load_points
        .iter()
        .map(|p| NumberingPoint {
            id: p.id,
            x_mm: p.x_mm,
            y_mm: p.y_mm,
        })
        .collect();
    order_numbering_locations(&all_points, &options.mark.rule)?;
    let points: Vec<_> = all_points
        .into_iter()
        .filter(|p| request.plan.selected_piles.contains_key(&p.id))
        .collect();
    let mut marks = HashMap::new();
    let mark_enabled = options
        .columns
        .as_ref()
        .map_or(options.mark.enabled, |columns| {
            columns
                .iter()
                .any(|c| c.enabled && c.field == crate::ExportField::Mark)
        });
    let code_enabled = options
        .columns
        .as_ref()
        .map_or(options.tip_code.enabled, |columns| {
            columns
                .iter()
                .any(|c| c.enabled && c.field == crate::ExportField::TipCode)
        });
    if mark_enabled {
        for (offset, index) in order_numbering_locations(&points, &options.mark.rule)?
            .into_iter()
            .enumerate()
        {
            let mark = options
                .mark
                .start
                .checked_add(
                    u32::try_from(offset).map_err(|_| ExportError("mark_overflow".into()))?,
                )
                .ok_or_else(|| ExportError("mark_overflow".into()))?;
            marks.insert(points[index].id, mark);
        }
    }
    let rows = build_pile_plan_export_rows(&request.plan)?;
    let tip_codes = if code_enabled {
        build_tip_level_codes(
            rows.iter()
                .filter_map(|row| request.plan.selected_piles.get(&row.load_point_id))
                .map(|p| p.pile_tip_level_mm),
            &options.tip_code,
        )
    } else {
        vec![]
    };
    let codes: HashMap<_, _> = tip_codes
        .iter()
        .map(|code| (code.level_mm, code.code.clone()))
        .collect();
    let mut table = ExportTable {
        headers: PILE_PLAN_EXPORT_HEADERS
            .iter()
            .map(|s| s.to_string())
            .collect(),
        rows: Vec::new(),
    };
    if options.mark.enabled {
        table.headers.push("Mark".into());
    }
    if options.tip_code.enabled {
        table.headers.push("Inheicode".into());
    }
    let mut annotations = Vec::new();
    let mut records = Vec::new();
    for row in rows {
        let mark = marks.get(&row.load_point_id).copied();
        let tip_code = request
            .plan
            .selected_piles
            .get(&row.load_point_id)
            .and_then(|p| codes.get(&p.pile_tip_level_mm))
            .cloned();
        let size = row
            .pile_size_mm
            .map(|size| {
                crate::export::pile_size_dimensions(&request.plan, size)
                    .map_or(json!(size), |s| json!(s))
            })
            .unwrap_or_default();
        let mut values = vec![
            json!(row.load_point_id),
            json!(row.x_mm),
            json!(row.y_mm),
            json!(row.design_load_kn),
            size,
            json!(row.pile_tip_level_m),
            json!(row.selected_cpts),
        ];
        if options.mark.enabled {
            values.push(json!(mark));
        }
        if options.tip_code.enabled {
            values.push(json!(tip_code));
        }
        let fields = [
            (crate::ExportField::LoadPointId, json!(row.load_point_id)),
            (crate::ExportField::Mark, json!(mark)),
            (crate::ExportField::X, json!(row.x_mm)),
            (crate::ExportField::Y, json!(row.y_mm)),
            (crate::ExportField::DesignLoad, json!(row.design_load_kn)),
            (
                crate::ExportField::TipLevel,
                json!(request
                    .plan
                    .selected_piles
                    .get(&row.load_point_id)
                    .map(|p| p.pile_tip_level_mm)),
            ),
            (crate::ExportField::TipCode, json!(tip_code)),
            (crate::ExportField::SelectedCpts, json!(row.selected_cpts)),
        ];
        let mut fields: HashMap<_, _> = fields.into_iter().collect();
        if let Some(facts) = prepared.facts.get(&row.load_point_id) {
            fields.extend(facts.clone());
        }
        records.push(crate::export_columns::ColumnRecord {
            previous_coordinates: None,
            source_coordinate_unit: None,
            values: fields,
            pile_size: row
                .pile_size_mm
                .map(|size| (size, request.plan.pile_shapes.get(&size).cloned())),
            source: vec![],
        });
        table.rows.push(values);
        annotations.push(PileExportAnnotation {
            load_point_id: row.load_point_id,
            mark,
            tip_code,
        });
    }
    if let Some(columns) = &options.columns {
        table = crate::export_columns::project_columns(columns, &records)?;
    }
    Ok(PilePlanExportPreview {
        replaced_count: prepared.replaced.len(),
        proposed_count: prepared.proposed.len(),
        table,
        annotations,
        tip_codes,
    })
}

pub fn write_configured_pile_plan_csv(
    request: &ConfiguredPilePlanExportRequest,
) -> Result<Vec<u8>, ExportError> {
    preview_configured_pile_plan_export(request)?
        .table
        .write_csv()
}

pub fn write_configured_pile_plan_xlsx(
    request: &ConfiguredPilePlanExportRequest,
) -> Result<Vec<u8>, ExportError> {
    preview_configured_pile_plan_export(request)?
        .table
        .write_xlsx("Pile Plan")
}
