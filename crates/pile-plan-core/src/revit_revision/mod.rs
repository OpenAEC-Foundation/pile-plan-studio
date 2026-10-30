mod inspection;
mod source;
use crate::export_columns::{format_size, project_columns, ColumnRecord};
use crate::{
    build_tip_level_codes, detect_numbering_rule, order_numbering_locations, reconcile_locations,
    ExportColumn, ExportError, ExportField, ExportTable, LocationBulkAction, LocationDecisions,
    LocationMatchingRequest, LocationMatchingResult, NumberingPoint, NumberingRuleDetection,
    PilePlanExportOptions, PilePlanExportRequest, PileSizeNotation, TipLevelCode,
};
pub use inspection::{
    inspect_pile_table, InspectPileTableRequest, PileTableInspection, PileTableMapping,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use source::{error, new_locations, parse_pile_table};
pub use source::{RevisionLocation, RevisionSource};
use std::collections::HashMap;

fn matching_tolerance() -> f64 {
    99.0
}
fn truth() -> bool {
    true
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ChangeCodeRule {
    #[serde(default = "truth")]
    pub enabled: bool,
    #[serde(default)]
    pub text: String,
}
fn rule(text: &str) -> ChangeCodeRule {
    ChangeCodeRule {
        enabled: true,
        text: text.into(),
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChangeCodeOptions {
    pub moved: ChangeCodeRule,
    pub size: ChangeCodeRule,
    pub level: ChangeCodeRule,
    pub added: ChangeCodeRule,
    pub removed: ChangeCodeRule,
    pub separator: String,
    pub movement_threshold_mm: f64,
}
impl Default for ChangeCodeOptions {
    fn default() -> Self {
        Self {
            moved: rule("M"),
            size: rule("S"),
            level: rule("L"),
            added: rule("A"),
            removed: rule("R"),
            separator: ",".into(),
            movement_threshold_mm: 99.0,
        }
    }
}
impl ChangeCodeOptions {
    fn validate(&self) -> Result<(), ExportError> {
        if !self.movement_threshold_mm.is_finite() || self.movement_threshold_mm < 0.0 {
            return Err(error("invalid_change_threshold"));
        }
        if [
            &self.moved,
            &self.size,
            &self.level,
            &self.added,
            &self.removed,
        ]
        .iter()
        .any(|r| r.enabled && r.text.trim().is_empty())
        {
            return Err(error("invalid_change_code"));
        }
        Ok(())
    }
    fn render(&self, flags: &[&ChangeCodeRule]) -> String {
        let mut tokens = Vec::new();
        for r in flags {
            if r.enabled && !tokens.contains(&r.text.as_str()) {
                tokens.push(r.text.as_str());
            }
        }
        tokens.join(&self.separator)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RevitRevisionRequest {
    pub old_source: RevisionSource,
    pub new_plan: PilePlanExportRequest,
    #[serde(default)]
    pub new_source: Option<RevisionSource>,
    #[serde(default)]
    pub old_mapping: Option<PileTableMapping>,
    #[serde(default)]
    pub new_mapping: Option<PileTableMapping>,
    #[serde(default)]
    pub output_columns: Option<Vec<ExportColumn>>,
    #[serde(default)]
    pub change_codes: ChangeCodeOptions,
    #[serde(default)]
    pub export_options: PilePlanExportOptions,
    #[serde(default = "matching_tolerance")]
    pub tolerance_mm: f64,
    #[serde(default)]
    pub decisions: Option<LocationDecisions>,
    #[serde(default)]
    pub source_decisions: Option<LocationDecisions>,
    #[serde(default)]
    pub bulk_action: Option<LocationBulkAction>,
    #[serde(default = "truth")]
    pub use_detected_numbering: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct RevitRevisionPreview {
    pub source_matching: Option<LocationMatchingResult>,
    pub source_locations: Vec<NumberingPoint>,
    pub forced_added: Vec<u32>,
    pub forced_removed: Vec<u32>,
    pub old_locations: Vec<RevisionLocation>,
    pub new_locations: Vec<RevisionLocation>,
    pub matching: LocationMatchingResult,
    pub numbering: NumberingRuleDetection,
    pub first_new_mark: u32,
    pub generated_mark_count: usize,
    pub table: Option<ExportTable>,
    pub tip_codes: Vec<TipLevelCode>,
    pub source_columns: Vec<ExportColumn>,
    pub missing_comparisons: Vec<ExportField>,
}
fn point(p: &RevisionLocation) -> NumberingPoint {
    NumberingPoint {
        id: p.id,
        x_mm: p.x_mm,
        y_mm: p.y_mm,
    }
}
fn values(
    p: &RevisionLocation,
    mark: Option<u32>,
    code: Value,
    change: &str,
) -> HashMap<ExportField, Value> {
    [
        (ExportField::LoadPointId, json!(p.source_id)),
        (ExportField::ExportId, json!(p.export_id.or(p.source_id))),
        (ExportField::Mark, json!(mark)),
        (ExportField::X, json!(p.x_mm)),
        (ExportField::Y, json!(p.y_mm)),
        (ExportField::DesignLoad, json!(p.design_load_kn)),
        (ExportField::TipLevel, json!(p.tip_level_mm)),
        (ExportField::TipCode, code),
        (ExportField::SelectedCpts, json!(p.selected_cpts)),
        (ExportField::ChangeCode, json!(change)),
    ]
    .into_iter()
    .collect()
}

pub fn preview_revit_revision(
    request: &RevitRevisionRequest,
) -> Result<RevitRevisionPreview, ExportError> {
    if request.output_columns.as_ref().map_or(true, |cols| {
        cols.iter()
            .any(|c| c.enabled && c.field == ExportField::ChangeCode)
    }) {
        request.change_codes.validate()?;
    }
    if request.export_options.mark.start == 0 {
        return Err(error("invalid_mark_start"));
    }
    let mut plan_input = request.new_plan.clone();
    if request.new_source.is_some() {
        plan_input.project_context = None;
    }
    let prepared = crate::export_context::prepare(&plan_input, &request.export_options)?;
    let mut effective = request.clone();
    effective.new_plan = prepared.plan.clone();
    let request = &effective;
    let old = parse_pile_table(
        &request.old_source,
        request.old_mapping.as_ref(),
        &request.new_plan.pile_shapes,
        false,
    )?;
    let new = if let Some(source) = &request.new_source {
        parse_pile_table(
            source,
            request.new_mapping.as_ref(),
            &request.new_plan.pile_shapes,
            true,
        )?
        .locations
    } else {
        new_locations(&request.new_plan)?
    };
    if new.is_empty() {
        return Err(error("revision_empty_new_plan"));
    }
    let old_points: Vec<_> = old.locations.iter().map(point).collect();
    let new_points: Vec<_> = new.iter().map(point).collect();
    let numbered_points: Vec<_> = old
        .locations
        .iter()
        .filter(|p| p.mark.is_some())
        .map(point)
        .collect();
    let numbering = detect_numbering_rule(
        &numbered_points,
        request.export_options.mark.rule.tolerance_mm,
    )?;
    let numbering_rule = if request.use_detected_numbering && !numbered_points.is_empty() {
        &numbering.rule
    } else {
        &request.export_options.mark.rule
    };
    let mut marks: HashMap<u32, u32> = old
        .locations
        .iter()
        .filter_map(|p| p.mark.map(|m| (p.id, m)))
        .collect();
    let renumber = request.export_options.mark.revision_mode == crate::RevisionMarkMode::Renumber;
    let unnumbered: Vec<_> = old_points
        .iter()
        .filter(|p| !marks.contains_key(&p.id))
        .cloned()
        .collect();
    let mut next_mark = request.export_options.mark.start;
    if !renumber {
        next_mark = marks
            .values()
            .max()
            .copied()
            .map(|n| n.checked_add(1).ok_or_else(|| error("mark_overflow")))
            .transpose()?
            .unwrap_or(next_mark);
        for index in order_numbering_locations(&unnumbered, numbering_rule)? {
            marks.insert(unnumbered[index].id, next_mark);
            next_mark = next_mark
                .checked_add(1)
                .ok_or_else(|| error("mark_overflow"))?;
        }
    }
    let forced_new = &prepared.proposed;
    let source_ids: std::collections::HashSet<_> = prepared.replaced.iter().map(|p| p.id).collect();
    let mut forced_old = std::collections::HashSet::new();
    let source_locations: Vec<_> = request
        .new_plan
        .load_points
        .iter()
        .filter(|p| !forced_new.contains(&p.id))
        .chain(prepared.replaced.iter())
        .map(|p| NumberingPoint {
            id: p.id,
            x_mm: p.x_mm,
            y_mm: p.y_mm,
        })
        .collect();
    let needs_source_review =
        !prepared.replaced.is_empty() && old.locations.iter().any(|p| p.source_id.is_none());
    let source_matching = if needs_source_review {
        Some(reconcile_locations(&LocationMatchingRequest {
            old_locations: old_points.clone(),
            new_locations: source_locations.clone(),
            tolerance_mm: request.tolerance_mm,
            decisions: request.source_decisions.clone(),
            bulk_action: None,
        })?)
    } else {
        None
    };
    for previous in &old.locations {
        let original_id = previous.source_id.or_else(|| {
            source_matching
                .as_ref()?
                .links
                .iter()
                .find(|l| l.old_id == previous.id)
                .map(|l| l.new_id)
        });
        if original_id.is_some_and(|id| source_ids.contains(&id)) {
            forced_old.insert(previous.id);
        }
    }
    let source_pending = source_matching.as_ref().is_some_and(|m| !m.complete);
    let mut decisions = request.decisions.clone().unwrap_or_default();
    if decisions
        .links
        .iter()
        .any(|l| forced_old.contains(&l.old_id) || forced_new.contains(&l.new_id))
    {
        return Err(error("invalid_location_mapping"));
    }
    decisions.added.retain(|id| !forced_new.contains(id));
    decisions.removed.retain(|id| !forced_old.contains(id));
    let mut matching = reconcile_locations(&LocationMatchingRequest {
        old_locations: old_points
            .into_iter()
            .filter(|p| !forced_old.contains(&p.id))
            .collect(),
        new_locations: new_points
            .iter()
            .filter(|p| !forced_new.contains(&p.id))
            .cloned()
            .collect(),
        tolerance_mm: request.tolerance_mm,
        decisions: if request.decisions.is_some() {
            Some(decisions)
        } else {
            None
        },
        bulk_action: request.bulk_action,
    })?;
    if source_pending {
        matching.complete = false;
    }
    matching.added.extend(forced_new.iter().copied());
    matching.removed.extend(forced_old.iter().copied());
    matching.added.sort_unstable();
    matching.removed.sort_unstable();
    let mut active_marks = HashMap::new();
    if !renumber {
        for link in &matching.links {
            active_marks.insert(link.new_id, marks[&link.old_id]);
        }
    }
    let numbered_new: Vec<_> = new_points
        .iter()
        .filter(|p| renumber || matching.added.contains(&p.id))
        .cloned()
        .collect();
    for (offset, index) in order_numbering_locations(&numbered_new, numbering_rule)?
        .into_iter()
        .enumerate()
    {
        let mark = next_mark
            .checked_add(u32::try_from(offset).map_err(|_| error("mark_overflow"))?)
            .ok_or_else(|| error("mark_overflow"))?;
        active_marks.insert(numbered_new[index].id, mark);
    }
    let first_new_mark = matching
        .added
        .iter()
        .filter_map(|id| active_marks.get(id))
        .min()
        .copied()
        .unwrap_or(next_mark);
    let tip_codes = build_tip_level_codes(
        new.iter().filter_map(|p| p.tip_level_mm),
        &request.export_options.tip_code,
    );
    let codes: HashMap<_, _> = tip_codes
        .iter()
        .map(|c| (c.level_mm, json!(c.code)))
        .collect();
    let mut headers = old.table.headers.clone();
    let mut source_columns = inspection::source_output_columns(&headers, &old.mapping);
    let change_index = if let Some(index) = old.mapping.columns.get(&ExportField::ChangeCode) {
        *index
    } else {
        headers.push("Wijzigingscode".into());
        let mut column = ExportColumn::new(ExportField::ChangeCode, "Wijzigingscode", "change");
        column.source_index = Some(headers.len() - 1);
        column.use_default_header = true;
        source_columns.push(column);
        headers.len() - 1
    };
    let mut missing_comparisons = Vec::new();
    if old
        .locations
        .iter()
        .any(|p| p.pile_size_mm.is_none() || p.shape.is_none())
    {
        missing_comparisons.push(ExportField::PileSize);
    }
    if old.locations.iter().any(|p| p.tip_level_mm.is_none()) {
        missing_comparisons.push(ExportField::TipLevel);
    }
    let default_size = old
        .mapping
        .columns
        .get(&ExportField::PileSize)
        .and_then(|i| {
            old.table
                .rows
                .iter()
                .filter_map(|r| r.get(*i))
                .find(|v| !v.is_null())
        });
    let size_format = if old.mapping.size_template.is_some() {
        PileSizeNotation::Custom
    } else if default_size
        .and_then(Value::as_str)
        .is_some_and(|s| s.contains(['x', 'X', '×', 'Ø', 'ø', '⌀']))
    {
        PileSizeNotation::Dimensions
    } else {
        PileSizeNotation::Numeric
    };
    let mut size_column = ExportColumn::new(ExportField::PileSize, "", "size");
    size_column.size_format = Some(size_format);
    size_column.template = old.mapping.size_template.clone();
    let update =
        |row: &mut Vec<Value>, p: &RevisionLocation, mark: u32| -> Result<(), ExportError> {
            let code = p
                .tip_level_mm
                .and_then(|level| codes.get(&level).cloned())
                .unwrap_or_default();
            for (field, value) in values(p, Some(mark), code, "") {
                if field == ExportField::ChangeCode {
                    continue;
                }
                if let Some(index) = old.mapping.columns.get(&field) {
                    row[*index] = if matches!(field, ExportField::X | ExportField::Y) {
                        value
                            .as_f64()
                            .map(|n| json!(old.mapping.coordinate_unit.from_mm(n)))
                            .unwrap_or_default()
                    } else if field == ExportField::TipLevel {
                        value
                            .as_f64()
                            .map(|n| json!(old.mapping.tip_unit.from_mm(n)))
                            .unwrap_or_default()
                    } else {
                        value
                    };
                }
            }
            if let Some(index) = old.mapping.columns.get(&ExportField::PileSize) {
                row[*index] = p
                    .pile_size_mm
                    .map(|size| format_size(size, p.shape.clone(), &size_column))
                    .transpose()?
                    .unwrap_or_default();
            }
            Ok(())
        };
    let table = if matching.complete {
        let new_by_id: HashMap<_, _> = new.iter().map(|p| (p.id, p)).collect();
        let links: HashMap<_, _> = matching.links.iter().map(|l| (l.old_id, l)).collect();
        let mut records = Vec::new();
        let rules = &request.change_codes;
        for (source_row, previous) in old.table.rows.iter().zip(&old.locations) {
            let mut row = source_row.clone();
            row.resize(headers.len(), Value::Null);
            let mark = links
                .get(&previous.id)
                .map(|link| active_marks[&link.new_id])
                .or_else(|| marks.get(&previous.id).copied());
            let (p, code, change) = if let Some(link) = links.get(&previous.id) {
                let p = new_by_id[&link.new_id];
                update(&mut row, p, mark.expect("linked new location has a number"))?;
                let mut flags = Vec::new();
                if link.distance_mm > rules.movement_threshold_mm {
                    flags.push(&rules.moved);
                }
                if previous.pile_size_mm.is_some()
                    && (previous.pile_size_mm != p.pile_size_mm
                        || (previous.shape.is_some() && previous.shape != p.shape))
                {
                    flags.push(&rules.size);
                }
                if previous.tip_level_mm.is_some() && previous.tip_level_mm != p.tip_level_mm {
                    flags.push(&rules.level);
                }
                (
                    p,
                    p.tip_level_mm
                        .and_then(|level| codes.get(&level).cloned())
                        .unwrap_or_default(),
                    rules.render(&flags),
                )
            } else {
                let code = old
                    .mapping
                    .columns
                    .get(&ExportField::TipCode)
                    .and_then(|i| row.get(*i))
                    .cloned()
                    .unwrap_or_default();
                (previous, code, rules.render(&[&rules.removed]))
            };
            row[change_index] = json!(change);
            records.push(ColumnRecord {
                previous_coordinates: links
                    .get(&previous.id)
                    .filter(|link| link.distance_mm <= request.tolerance_mm)
                    .map(|_| (previous.x_mm, previous.y_mm)),
                source_coordinate_unit: Some(old.mapping.coordinate_unit),
                values: {
                    let mut v = values(p, mark, code, &change);
                    if links.contains_key(&previous.id) {
                        if let Some(facts) = prepared.facts.get(&p.id) {
                            v.extend(facts.clone());
                        }
                    }
                    v
                },
                pile_size: p.pile_size_mm.map(|n| (n, p.shape.clone())),
                source: row,
            });
        }
        let added_points: Vec<_> = new_points
            .iter()
            .filter(|p| matching.added.contains(&p.id))
            .cloned()
            .collect();
        for index in order_numbering_locations(&added_points, numbering_rule)? {
            let p = new_by_id[&added_points[index].id];
            let mark = active_marks[&p.id];
            let mut row = vec![Value::Null; headers.len()];
            update(&mut row, p, mark)?;
            let change = rules.render(&[&rules.added]);
            row[change_index] = json!(change);
            let code = p
                .tip_level_mm
                .and_then(|level| codes.get(&level).cloned())
                .unwrap_or_default();
            records.push(ColumnRecord {
                previous_coordinates: None,
                source_coordinate_unit: Some(old.mapping.coordinate_unit),
                values: {
                    let mut v = values(p, Some(mark), code, &change);
                    if let Some(facts) = prepared.facts.get(&p.id) {
                        v.extend(facts.clone());
                    }
                    v
                },
                pile_size: p.pile_size_mm.map(|n| (n, p.shape.clone())),
                source: row,
            });
        }
        Some(project_columns(
            request.output_columns.as_deref().unwrap_or(&source_columns),
            &records,
        )?)
    } else {
        None
    };
    Ok(RevitRevisionPreview {
        source_matching,
        source_locations,
        forced_added: {
            let mut v: Vec<_> = forced_new.iter().copied().collect();
            v.sort_unstable();
            v
        },
        forced_removed: {
            let mut v: Vec<_> = forced_old.iter().copied().collect();
            v.sort_unstable();
            v
        },
        old_locations: old.locations,
        new_locations: new,
        matching,
        numbering,
        first_new_mark,
        generated_mark_count: if renumber { 0 } else { unnumbered.len() },
        table,
        tip_codes,
        source_columns,
        missing_comparisons,
    })
}

pub fn write_revit_revision_xlsx(request: &RevitRevisionRequest) -> Result<Vec<u8>, ExportError> {
    preview_revit_revision(request)?
        .table
        .ok_or_else(|| error("revision_unresolved"))?
        .write_xlsx("Change table")
}
pub fn write_revit_revision_csv(request: &RevitRevisionRequest) -> Result<Vec<u8>, ExportError> {
    preview_revit_revision(request)?
        .table
        .ok_or_else(|| error("revision_unresolved"))?
        .write_csv()
}
