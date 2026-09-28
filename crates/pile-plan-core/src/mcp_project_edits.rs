use std::collections::{BTreeSet, HashSet};

use serde::{Deserialize, Serialize};

use crate::project::ProjectLegendSettings;
use crate::{
    build_load_point_topology, read_project_document, try_pile_tip_level_mm,
    validate_unique_load_point_positions, write_project_document, IlpCandidateSource,
    IlpOptimizationSettings, ProjectBearingCapacity, ProjectCpt, ProjectDocumentDraft,
    ProjectLoadPoint, ValidatedPilePlanProject,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct McpProjectEditInput {
    pub draft: ProjectDocumentDraft,
    pub edit: McpProjectEdit,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum McpProjectEdit {
    OptimizationSettings {
        settings: IlpOptimizationSettings,
    },
    ActiveConfigurations {
        plan_id: String,
        pile_sizes_mm: Vec<u32>,
        pile_tip_levels_mm: Vec<i64>,
    },
    LegendSettings {
        legend: ProjectLegendSettings,
        show_tip_level_regions: Option<bool>,
    },
    ProjectProperties {
        name: String,
        pile_head_level_m: f64,
        currency_code: String,
    },
    LoadPoints {
        actions: Vec<LoadPointAction>,
    },
    Cpts {
        actions: Vec<CptAction>,
    },
    BearingCapacities {
        actions: Vec<BearingCapacityAction>,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum LoadPointAction {
    Add { item: ProjectLoadPoint },
    Update { item: ProjectLoadPoint },
    Remove { id: u32 },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CptAction {
    Add { item: ProjectCpt },
    Update { item: ProjectCpt },
    Remove { id: u32 },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum BearingCapacityAction {
    Add {
        item: ProjectBearingCapacity,
    },
    Update {
        item: ProjectBearingCapacity,
    },
    Remove {
        cpt_id: u32,
        pile_size_mm: u32,
        pile_tip_level_mm: i64,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum McpProjectEditResult {
    Applied {
        changed: bool,
        document: ValidatedPilePlanProject,
    },
    Blocked {
        reason: String,
        action_index: Option<usize>,
    },
}

fn blocked(reason: &str, action_index: Option<usize>) -> McpProjectEditResult {
    McpProjectEditResult::Blocked {
        reason: reason.into(),
        action_index,
    }
}

pub fn evaluate_mcp_project_edit(input: &McpProjectEditInput) -> McpProjectEditResult {
    let mut draft = input.draft.clone();
    let source_edit = matches!(
        &input.edit,
        McpProjectEdit::LoadPoints { .. }
            | McpProjectEdit::Cpts { .. }
            | McpProjectEdit::BearingCapacities { .. }
    );
    match &input.edit {
        McpProjectEdit::OptimizationSettings { settings } => {
            if !settings.is_valid() || settings.custom_configurations.len() > 500 {
                return blocked("invalid_optimization_settings", None);
            }
            let available: HashSet<(u32, i64)> = draft
                .inputs
                .bearing_capacities
                .iter()
                .filter_map(|v| advice_key(v).map(|(_, size, tip)| (size, tip)))
                .collect();
            let custom: Vec<(u32, i64)> = settings
                .custom_configurations
                .iter()
                .map(|v| (v.pile_size_mm, v.pile_tip_level_mm))
                .collect();
            if !all_unique(&custom)
                || (settings.candidate_source == IlpCandidateSource::Custom
                    && custom.iter().any(|v| !available.contains(v)))
            {
                return blocked("unknown_or_duplicate_configuration", None);
            }
            draft.settings.ilp_optimization = Some(settings.clone());
        }
        McpProjectEdit::ActiveConfigurations {
            plan_id,
            pile_sizes_mm,
            pile_tip_levels_mm,
        } => {
            let Some(plan) = draft
                .user_state
                .pile_plans
                .iter_mut()
                .find(|p| &p.id == plan_id)
            else {
                return blocked("unknown_plan", None);
            };
            let sizes: HashSet<u32> = draft
                .inputs
                .bearing_capacities
                .iter()
                .map(|v| v.pile_size_mm)
                .collect();
            let tips: HashSet<i64> = draft
                .inputs
                .bearing_capacities
                .iter()
                .filter_map(|v| try_pile_tip_level_mm(v.pile_tip_level_m).ok())
                .collect();
            if pile_sizes_mm.iter().any(|value| !sizes.contains(value))
                || pile_tip_levels_mm.iter().any(|value| !tips.contains(value))
                || !all_unique(pile_sizes_mm)
                || !all_unique(pile_tip_levels_mm)
            {
                return blocked("unknown_or_duplicate_configuration", None);
            }
            plan.active_pile_sizes = pile_sizes_mm.clone();
            plan.active_pile_sizes.sort_unstable();
            plan.active_pile_tip_levels = pile_tip_levels_mm
                .iter()
                .map(|v| *v as f64 / 1000.0)
                .collect();
            plan.active_pile_tip_levels.sort_by(|a, b| b.total_cmp(a));
        }
        McpProjectEdit::LegendSettings {
            legend,
            show_tip_level_regions,
        } => {
            if !valid_legend(legend, &draft) {
                return blocked("invalid_legend", None);
            }
            draft.settings.pile_legend = Some(legend.clone());
            if let Some(show) = show_tip_level_regions {
                draft.settings.viewer.show_tip_level_regions = *show;
            }
        }
        McpProjectEdit::ProjectProperties {
            name,
            pile_head_level_m,
            currency_code,
        } => {
            let name = name.trim();
            let currency = currency_code.trim().to_ascii_uppercase();
            if name.is_empty()
                || name.len() > 120
                || !pile_head_level_m.is_finite()
                || currency.len() != 3
                || !currency.bytes().all(|b| b.is_ascii_uppercase())
            {
                return blocked("invalid_project_properties", None);
            }
            draft.metadata.name = name.into();
            draft.settings.pile_head_level_m = Some(*pile_head_level_m);
            draft.units.costs = currency;
        }
        McpProjectEdit::LoadPoints { actions } => {
            if actions.is_empty() || actions.len() > 500 {
                return blocked("invalid_batch_size", None);
            }
            let mut seen = HashSet::new();
            for (index, action) in actions.iter().enumerate() {
                let id = match action {
                    LoadPointAction::Add { item } | LoadPointAction::Update { item } => item.id,
                    LoadPointAction::Remove { id } => *id,
                };
                if !seen.insert(id) {
                    return blocked("duplicate_target", Some(index));
                }
                match action {
                    LoadPointAction::Add { item } => {
                        if draft.inputs.load_points.iter().any(|v| v.id == id) {
                            return blocked("id_exists", Some(index));
                        }
                        if !valid_load_point(item) {
                            return blocked("invalid_load_point", Some(index));
                        }
                        draft.inputs.load_points.push(item.clone());
                    }
                    LoadPointAction::Update { item } => {
                        let Some(existing) =
                            draft.inputs.load_points.iter_mut().find(|v| v.id == id)
                        else {
                            return blocked("unknown_id", Some(index));
                        };
                        if !valid_load_point(item) {
                            return blocked("invalid_load_point", Some(index));
                        }
                        *existing = item.clone();
                    }
                    LoadPointAction::Remove { id } => {
                        let before = draft.inputs.load_points.len();
                        draft.inputs.load_points.retain(|v| v.id != *id);
                        if before == draft.inputs.load_points.len() {
                            return blocked("unknown_id", Some(index));
                        }
                        draft.settings.cpt_selection_by_load_point.remove(id);
                        draft.user_state.manual_cpt_selections.remove(id);
                        draft.active_selected_piles.remove(id);
                        for plan in &mut draft.user_state.pile_plans {
                            plan.selected_piles.remove(id);
                            plan.locked_load_point_ids.retain(|v| v != id);
                            plan.optimization_unassigned.remove(id);
                        }
                    }
                }
            }
            if validate_unique_load_point_positions(&draft.inputs.load_points).is_err() {
                return blocked("duplicate_load_point_position", None);
            }
            if draft.inputs.load_points != input.draft.inputs.load_points {
                reconcile_groups_after_load_point_edit(&mut draft);
            }
        }
        McpProjectEdit::Cpts { actions } => {
            if actions.is_empty() || actions.len() > 500 {
                return blocked("invalid_batch_size", None);
            }
            let mut seen = HashSet::new();
            for (index, action) in actions.iter().enumerate() {
                let id = match action {
                    CptAction::Add { item } | CptAction::Update { item } => item.id,
                    CptAction::Remove { id } => *id,
                };
                if !seen.insert(id) {
                    return blocked("duplicate_target", Some(index));
                }
                match action {
                    CptAction::Add { item } => {
                        if draft.inputs.cpts.iter().any(|v| v.id == id) {
                            return blocked("id_exists", Some(index));
                        }
                        if !valid_cpt(item) {
                            return blocked("invalid_cpt", Some(index));
                        }
                        draft.inputs.cpts.push(item.clone());
                    }
                    CptAction::Update { item } => {
                        let Some(existing) = draft.inputs.cpts.iter_mut().find(|v| v.id == id)
                        else {
                            return blocked("unknown_id", Some(index));
                        };
                        if !valid_cpt(item) {
                            return blocked("invalid_cpt", Some(index));
                        }
                        *existing = item.clone();
                    }
                    CptAction::Remove { id } => {
                        let before = draft.inputs.cpts.len();
                        draft.inputs.cpts.retain(|v| v.id != *id);
                        if before == draft.inputs.cpts.len() {
                            return blocked("unknown_id", Some(index));
                        }
                        draft.inputs.bearing_capacities.retain(|v| v.cpt_id != *id);
                        draft
                            .user_state
                            .manual_cpt_selections
                            .retain(|_, selected| {
                                let explicitly_empty = selected.is_empty();
                                selected.retain(|v| v != id);
                                explicitly_empty || !selected.is_empty()
                            });
                    }
                }
            }
        }
        McpProjectEdit::BearingCapacities { actions } => {
            if actions.is_empty() || actions.len() > 500 {
                return blocked("invalid_batch_size", None);
            }
            let mut seen = HashSet::new();
            for (index, action) in actions.iter().enumerate() {
                let key = match action {
                    BearingCapacityAction::Add { item }
                    | BearingCapacityAction::Update { item } => advice_key(item),
                    BearingCapacityAction::Remove {
                        cpt_id,
                        pile_size_mm,
                        pile_tip_level_mm,
                    } => Some((*cpt_id, *pile_size_mm, *pile_tip_level_mm)),
                };
                let Some(key) = key else {
                    return blocked("invalid_tip_level", Some(index));
                };
                if !seen.insert(key) {
                    return blocked("duplicate_target", Some(index));
                }
                match action {
                    BearingCapacityAction::Add { item } => {
                        if !valid_advice(item, &draft) {
                            return blocked("invalid_advice", Some(index));
                        }
                        if draft
                            .inputs
                            .bearing_capacities
                            .iter()
                            .any(|v| advice_key(v) == Some(key))
                        {
                            return blocked("key_exists", Some(index));
                        }
                        draft.inputs.bearing_capacities.push(item.clone());
                    }
                    BearingCapacityAction::Update { item } => {
                        if !valid_advice(item, &draft) {
                            return blocked("invalid_advice", Some(index));
                        }
                        let Some(existing) = draft
                            .inputs
                            .bearing_capacities
                            .iter_mut()
                            .find(|v| advice_key(v) == Some(key))
                        else {
                            return blocked("unknown_key", Some(index));
                        };
                        *existing = item.clone();
                    }
                    BearingCapacityAction::Remove { .. } => {
                        let before = draft.inputs.bearing_capacities.len();
                        draft
                            .inputs
                            .bearing_capacities
                            .retain(|v| advice_key(v) != Some(key));
                        if before == draft.inputs.bearing_capacities.len() {
                            return blocked("unknown_key", Some(index));
                        }
                    }
                }
            }
        }
    }
    if source_edit && draft != input.draft {
        if draft.inputs.bearing_capacities != input.draft.inputs.bearing_capacities {
            reconcile_active_configurations(&input.draft, &mut draft);
        }
        for plan in &mut draft.user_state.pile_plans {
            plan.ilp_result = None;
        }
    }
    let changed = draft != input.draft;
    let contents = match write_project_document(draft) {
        Ok(value) => value,
        Err(_) => return blocked("invalid_project", None),
    };
    match read_project_document(&contents) {
        Ok(document) => McpProjectEditResult::Applied { changed, document },
        Err(_) => blocked("invalid_project", None),
    }
}

fn all_unique<T: Eq + std::hash::Hash>(items: &[T]) -> bool {
    items.iter().collect::<HashSet<_>>().len() == items.len()
}
fn valid_load_point(value: &ProjectLoadPoint) -> bool {
    !value.name.trim().is_empty()
        && value.x_mm.is_finite()
        && value.y_mm.is_finite()
        && value.design_load_kn.is_finite()
}
fn valid_cpt(value: &ProjectCpt) -> bool {
    !value.name.trim().is_empty() && value.x_mm.is_finite() && value.y_mm.is_finite()
}
fn advice_key(value: &ProjectBearingCapacity) -> Option<(u32, u32, i64)> {
    try_pile_tip_level_mm(value.pile_tip_level_m)
        .ok()
        .map(|tip| (value.cpt_id, value.pile_size_mm, tip))
}
fn valid_advice(value: &ProjectBearingCapacity, draft: &ProjectDocumentDraft) -> bool {
    value.pile_size_mm > 0
        && value.frd_kn.is_finite()
        && advice_key(value).is_some()
        && draft.inputs.cpts.iter().any(|cpt| cpt.id == value.cpt_id)
}
fn valid_legend(value: &ProjectLegendSettings, draft: &ProjectDocumentDraft) -> bool {
    const MODES: &[&str] = &["size-symbol", "tip-symbol", "size-color-tip-region"];
    const SCHEMES: &[&str] = &[
        "tableau-extended",
        "even-hue",
        "colorblind-friendly",
        "rainbow",
        "light-dark",
        "cool-warm",
    ];
    const SHAPES: &[&str] = &[
        "circle",
        "square",
        "diamond",
        "triangle-up",
        "triangle-down",
        "triangle-left",
        "triangle-right",
        "rectangle-horizontal",
        "rectangle-vertical",
    ];
    const FILLS: &[&str] = &[
        "full",
        "top-half",
        "bottom-half",
        "left-half",
        "right-half",
        "diagonal-half",
    ];
    if !MODES.contains(&value.encoding_mode.as_str())
        || !SCHEMES.contains(&value.color_scheme.as_str())
        || value
            .pile_size_color_scheme
            .as_ref()
            .is_some_and(|v| !SCHEMES.contains(&v.as_str()))
        || value
            .pile_tip_level_color_scheme
            .as_ref()
            .is_some_and(|v| !SCHEMES.contains(&v.as_str()))
    {
        return false;
    }
    if !all_unique(
        &value
            .pile_sizes
            .iter()
            .map(|v| v.value.to_bits())
            .collect::<Vec<_>>(),
    ) || !all_unique(
        &value
            .pile_tip_levels
            .iter()
            .map(|v| v.value.to_bits())
            .collect::<Vec<_>>(),
    ) {
        return false;
    }
    let sizes: HashSet<u32> = value
        .pile_sizes
        .iter()
        .filter_map(|v| {
            (v.value.is_finite()
                && v.value > 0.0
                && v.value.fract() == 0.0
                && v.value <= u32::MAX as f64)
                .then_some(v.value as u32)
        })
        .collect();
    let tips: HashSet<i64> = value
        .pile_tip_levels
        .iter()
        .filter_map(|v| try_pile_tip_level_mm(v.value).ok())
        .collect();
    if draft.inputs.bearing_capacities.iter().any(|v| {
        !sizes.contains(&v.pile_size_mm)
            || advice_key(v).is_none_or(|(_, _, tip)| !tips.contains(&tip))
    }) {
        return false;
    }
    value
        .pile_sizes
        .iter()
        .all(|item| item.value.is_finite() && item.value > 0.0)
        && value
            .pile_sizes
            .iter()
            .chain(&value.pile_tip_levels)
            .all(|item| {
                item.value.is_finite()
                    && SHAPES.contains(&item.symbol.base_shape.as_str())
                    && FILLS.contains(&item.symbol.fill_pattern.as_str())
                    && item.color.len() == 7
                    && item.color.starts_with('#')
                    && item.color[1..].bytes().all(|v| v.is_ascii_hexdigit())
            })
        && value
            .pile_tip_levels
            .iter()
            .all(|v| try_pile_tip_level_mm(v.value).is_ok())
}

fn reconcile_active_configurations(
    before: &ProjectDocumentDraft,
    after: &mut ProjectDocumentDraft,
) {
    let old_sizes: HashSet<u32> = before
        .inputs
        .bearing_capacities
        .iter()
        .map(|v| v.pile_size_mm)
        .collect();
    let new_sizes: HashSet<u32> = after
        .inputs
        .bearing_capacities
        .iter()
        .map(|v| v.pile_size_mm)
        .collect();
    let old_tips: HashSet<i64> = before
        .inputs
        .bearing_capacities
        .iter()
        .filter_map(|v| try_pile_tip_level_mm(v.pile_tip_level_m).ok())
        .collect();
    let new_tips: HashSet<i64> = after
        .inputs
        .bearing_capacities
        .iter()
        .filter_map(|v| try_pile_tip_level_mm(v.pile_tip_level_m).ok())
        .collect();
    for plan in &mut after.user_state.pile_plans {
        let active_sizes: HashSet<u32> = plan.active_pile_sizes.iter().copied().collect();
        let active_tips: HashSet<i64> = plan
            .active_pile_tip_levels
            .iter()
            .filter_map(|v| try_pile_tip_level_mm(*v).ok())
            .collect();
        plan.active_pile_sizes = new_sizes
            .iter()
            .copied()
            .filter(|v| !old_sizes.contains(v) || active_sizes.contains(v))
            .collect();
        plan.active_pile_sizes.sort_unstable();
        let mut tips: Vec<i64> = new_tips
            .iter()
            .copied()
            .filter(|v| !old_tips.contains(v) || active_tips.contains(v))
            .collect();
        tips.sort_unstable_by(|a, b| b.cmp(a));
        plan.active_pile_tip_levels = tips.into_iter().map(|v| v as f64 / 1000.0).collect();
    }
}

fn reconcile_groups_after_load_point_edit(draft: &mut ProjectDocumentDraft) {
    let topology = build_load_point_topology(&draft.inputs.load_points);
    let known: HashSet<u32> = draft.inputs.load_points.iter().map(|v| v.id).collect();
    let original = std::mem::take(&mut draft.settings.load_point_grouping.manual_groups);
    for group in original {
        let mut remaining: BTreeSet<u32> = group
            .load_point_ids
            .into_iter()
            .filter(|id| known.contains(id))
            .collect();
        while let Some(start) = remaining.pop_first() {
            let mut pending = vec![start];
            let mut connected = vec![start];
            while let Some(current) = pending.pop() {
                for edge in &topology.edges {
                    let neighbor = if edge.from_load_point_id == current {
                        Some(edge.to_load_point_id)
                    } else if edge.to_load_point_id == current {
                        Some(edge.from_load_point_id)
                    } else {
                        None
                    };
                    if let Some(neighbor) = neighbor.filter(|id| remaining.remove(id)) {
                        connected.push(neighbor);
                        pending.push(neighbor);
                    }
                }
            }
            if connected.len() >= 2 {
                connected.sort_unstable();
                draft.settings.load_point_grouping.manual_groups.push(
                    crate::LoadPointGroupOverride {
                        load_point_ids: connected,
                    },
                );
            }
        }
    }
    for group in &mut draft.settings.load_point_grouping.ungrouped_groups {
        group.load_point_ids.retain(|id| known.contains(id));
    }
    draft
        .settings
        .load_point_grouping
        .ungrouped_groups
        .retain(|g| !g.load_point_ids.is_empty());
}
