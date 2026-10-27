use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    calculate_pile_cost, derive_load_point_groups, read_ifcpp_str, write_project_document,
    PileConfigurationKey, PileConfigurationOption, ProjectDocumentDraft, ProjectLoadPoint,
};

pub(crate) const MAX_PILE_CAP_COUNT: u8 = 20;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PileCapProposal {
    pub load_point_ids: Vec<u32>,
    pub pile_count: u8,
    pub quarter_turns: u8,
    pub configuration: Option<PileConfigurationKey>,
}

pub(crate) fn deserialize_proposals<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<PileCapProposal>, D::Error> {
    use serde::de::Error;
    let mut proposals = Vec::<PileCapProposal>::deserialize(deserializer)?;
    for proposal in &mut proposals {
        proposal.load_point_ids.sort_unstable();
    }
    validate_proposals(&proposals).map_err(D::Error::custom)?;
    Ok(proposals)
}

pub(crate) fn validate_proposals(proposals: &[PileCapProposal]) -> Result<(), &'static str> {
    let mut seen = HashSet::new();
    for proposal in proposals {
        let mut ids = proposal.load_point_ids.clone();
        ids.sort_unstable();
        if ids.is_empty()
            || ids.windows(2).any(|pair| pair[0] == pair[1])
            || !(1..=MAX_PILE_CAP_COUNT).contains(&proposal.pile_count)
            || proposal.quarter_turns > 3
            || proposal
                .configuration
                .as_ref()
                .is_some_and(|key| key.pile_size_mm == 0)
            || !seen.insert(ids)
        {
            return Err("invalid pile-cap proposal");
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PileCapProposalEdit {
    pub plan_id: String,
    pub proposal: PileCapProposal,
    #[serde(default)]
    pub remove: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PileCapProposalRequest {
    pub draft: ProjectDocumentDraft,
    pub edit: Option<PileCapProposalEdit>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileCapPoint {
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileCapOption {
    #[serde(flatten)]
    pub option: PileConfigurationOption,
    pub cost_per_pile: Option<u32>,
    pub total_cost: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileCapPreview {
    pub proposal: PileCapProposal,
    pub status: &'static str,
    pub center: PileCapPoint,
    pub positions: Vec<PileCapPoint>,
    pub total_load_kn: Option<f64>,
    pub load_per_pile_kn: Option<f64>,
    pub cpt_ids: Vec<u32>,
    pub missing_selection_load_point_ids: Vec<u32>,
    pub options: Vec<PileCapOption>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileCapPlanPreview {
    pub plan_id: String,
    pub proposals: Vec<PileCapProposal>,
    pub previews: Vec<PileCapPreview>,
    pub pile_count: usize,
    pub total_cost: u64,
    pub missing_cost_count: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PileCapProposalResult {
    pub plans: Vec<PileCapPlanPreview>,
}

/// Centered unit patterns. Schematic spacing is a separate presentation concern.
pub fn pile_cap_pattern(pile_count: u8, quarter_turns: u8) -> Vec<PileCapPoint> {
    let expanded: Vec<(f64, f64)>;
    let points: &[(f64, f64)] = match pile_count {
        1 => &[(0.0, 0.0)],
        2 => &[(-0.5, 0.0), (0.5, 0.0)],
        3 => &[(-1.0, 0.0), (0.0, 0.0), (1.0, 0.0)],
        4 => &[(-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)],
        5 => &[
            (-1.0, -0.4),
            (0.0, -0.4),
            (1.0, -0.4),
            (-0.5, 0.6),
            (0.5, 0.6),
        ],
        6 => &[
            (-1.0, -0.5),
            (0.0, -0.5),
            (1.0, -0.5),
            (-1.0, 0.5),
            (0.0, 0.5),
            (1.0, 0.5),
        ],
        7..=MAX_PILE_CAP_COUNT => {
            let rows = match pile_count {
                7..=8 => 2,
                9..=12 => 3,
                _ => 4,
            };
            let count = usize::from(pile_count);
            let mut grid = Vec::with_capacity(count);
            for row in 0..rows {
                let columns = count / rows + usize::from(row < count % rows);
                for column in 0..columns {
                    grid.push((column as f64 - (columns - 1) as f64 / 2., row as f64));
                }
            }
            let center_y = grid.iter().map(|p| p.1).sum::<f64>() / f64::from(pile_count);
            expanded = grid.into_iter().map(|(x, y)| (x, y - center_y)).collect();
            &expanded
        }
        _ => return Vec::new(),
    };
    points
        .iter()
        .map(|&(x, y)| {
            let (x_mm, y_mm) = match quarter_turns % 4 {
                0 => (x, y),
                1 => (-y, x),
                2 => (-x, -y),
                _ => (y, -x),
            };
            PileCapPoint { x_mm, y_mm }
        })
        .collect()
}

fn group_direction(points: &[&ProjectLoadPoint]) -> f64 {
    if points.len() <= 1 {
        return 0.0;
    }
    let center_x = points.iter().map(|p| p.x_mm).sum::<f64>() / points.len() as f64;
    let center_y = points.iter().map(|p| p.y_mm).sum::<f64>() / points.len() as f64;
    let xx = points
        .iter()
        .map(|p| (p.x_mm - center_x).powi(2))
        .sum::<f64>();
    let yy = points
        .iter()
        .map(|p| (p.y_mm - center_y).powi(2))
        .sum::<f64>();
    let xy = points
        .iter()
        .map(|p| (p.x_mm - center_x) * (p.y_mm - center_y))
        .sum::<f64>();
    if (xx - yy).abs().max(xy.abs()) < 1e-6 {
        0.0
    } else {
        0.5 * (2.0 * xy).atan2(xx - yy)
    }
}

pub fn evaluate_pile_cap_proposals(
    mut request: PileCapProposalRequest,
) -> Result<PileCapProposalResult, String> {
    // Use the ordinary document boundary: reads and edits share source validation.
    let contents = write_project_document(request.draft.clone()).map_err(|e| e.to_string())?;
    let mut project = read_ifcpp_str(&contents).map_err(|e| e.to_string())?;
    let groups = derive_load_point_groups(
        &project.inputs.load_points,
        &project.settings.load_point_grouping,
    );
    let known: HashMap<_, _> = project
        .inputs
        .load_points
        .iter()
        .map(|p| (p.id, p))
        .collect();
    if let Some(edit) = &mut request.edit {
        edit.proposal.load_point_ids.sort_unstable();
        let ids = &edit.proposal.load_point_ids;
        let plan = project
            .user_state
            .pile_plans
            .iter_mut()
            .find(|p| p.id == edit.plan_id)
            .ok_or("unknown pile plan")?;
        let valid_group = groups.groups.iter().any(|g| {
            let mut members = g.load_point_ids.clone();
            members.sort_unstable();
            members == *ids
        });
        if !edit.remove
            && (!valid_group
                || !(1..=MAX_PILE_CAP_COUNT).contains(&edit.proposal.pile_count)
                || edit.proposal.quarter_turns > 3
                || ids.is_empty())
        {
            return Err("invalid pile-cap proposal edit".into());
        }
        plan.pile_cap_proposals.retain(|p| p.load_point_ids != *ids);
        if !edit.remove && edit.proposal.pile_count as usize != ids.len() {
            plan.pile_cap_proposals.push(edit.proposal.clone());
        }
        validate_proposals(&plan.pile_cap_proposals)?;
    }
    let mut cap_analysis = PileCapAnalysis::new(&project)?;
    let mut plans = Vec::new();
    for plan in &project.user_state.pile_plans {
        let mut previews = Vec::new();
        for proposal in &plan.pile_cap_proposals {
            let members: Vec<_> = proposal
                .load_point_ids
                .iter()
                .filter_map(|id| known.get(id).copied())
                .collect();
            let mut preview = PileCapPreview {
                proposal: proposal.clone(),
                status: "group_changed",
                center: PileCapPoint {
                    x_mm: 0.0,
                    y_mm: 0.0,
                },
                positions: vec![],
                total_load_kn: None,
                load_per_pile_kn: None,
                cpt_ids: vec![],
                missing_selection_load_point_ids: vec![],
                options: vec![],
            };
            if !members.is_empty() {
                preview.center.x_mm =
                    members.iter().map(|p| p.x_mm).sum::<f64>() / members.len() as f64;
                preview.center.y_mm =
                    members.iter().map(|p| p.y_mm).sum::<f64>() / members.len() as f64;
            }
            let valid_group = groups.groups.iter().any(|g| {
                let mut ids = g.load_point_ids.clone();
                ids.sort_unstable();
                ids == proposal.load_point_ids
            });
            if members.len() != proposal.load_point_ids.len() || !valid_group {
                previews.push(preview);
                continue;
            }
            let total = members.iter().map(|p| p.design_load_kn).sum::<f64>();
            if !total.is_finite()
                || members.iter().any(|p| {
                    !p.design_load_kn.is_finite()
                        || p.design_load_kn < 0.0
                        || !p.x_mm.is_finite()
                        || !p.y_mm.is_finite()
                })
            {
                preview.status = "invalid_source_data";
                previews.push(preview);
                continue;
            }
            preview.total_load_kn = Some(total);
            preview.load_per_pile_kn = Some(total / proposal.pile_count as f64);
            let angle = group_direction(&members);
            let (sin, cos) = angle.sin_cos();
            preview.positions = pile_cap_pattern(proposal.pile_count, proposal.quarter_turns)
                .into_iter()
                .map(|p| PileCapPoint {
                    x_mm: preview.center.x_mm + 1100.0 * (p.x_mm * cos - p.y_mm * sin),
                    y_mm: preview.center.y_mm + 1100.0 * (p.x_mm * sin + p.y_mm * cos),
                })
                .collect();
            let demand = cap_analysis
                .evaluate(&proposal.load_point_ids, proposal.pile_count)
                .ok_or("invalid pile-cap demand")?;
            preview.cpt_ids = demand.cpt_ids;
            preview.missing_selection_load_point_ids = demand.missing_selection_load_point_ids;
            preview.status = if preview.missing_selection_load_point_ids.is_empty() {
                "active"
            } else {
                "missing_cpt_selection"
            };
            preview.options = demand
                .options
                .into_iter()
                .map(|option| {
                    let cost = project.settings.pile_head_level_m.and_then(|head| {
                        calculate_pile_cost(
                            option.pile_size_mm,
                            option.pile_tip_level_m,
                            head,
                            &project.settings.pile_costs,
                        )
                    });
                    PileCapOption {
                        option,
                        cost_per_pile: cost,
                        total_cost: cost.map(|c| c as u64 * proposal.pile_count as u64),
                    }
                })
                .collect();
            previews.push(preview);
        }
        let replaced: HashSet<_> = previews
            .iter()
            .filter(|p| p.status != "group_changed" && p.status != "invalid_source_data")
            .flat_map(|p| p.proposal.load_point_ids.iter().copied())
            .collect();
        let mut pile_count = project.inputs.load_points.len() - replaced.len();
        let mut total_cost = 0_u64;
        let mut missing_cost_count = 0;
        for point in &project.inputs.load_points {
            if replaced.contains(&point.id) {
                continue;
            }
            if let Some(choice) = plan
                .selected_piles
                .get(&point.id)
                .and_then(|c| c.pile.as_ref())
            {
                match project.settings.pile_head_level_m.and_then(|head| {
                    calculate_pile_cost(
                        choice.pile_size_mm,
                        choice.pile_tip_level_m(),
                        head,
                        &project.settings.pile_costs,
                    )
                }) {
                    Some(c) => total_cost += c as u64,
                    None => missing_cost_count += 1,
                }
            }
        }
        for p in &previews {
            if p.status == "group_changed" || p.status == "invalid_source_data" {
                continue;
            }
            pile_count += p.proposal.pile_count as usize;
            let cost = p
                .proposal
                .configuration
                .as_ref()
                .and_then(|key| p.options.iter().find(|o| o.option.configuration == *key))
                .and_then(|o| o.total_cost);
            match cost {
                Some(c) => total_cost += c,
                None => missing_cost_count += p.proposal.pile_count as usize,
            }
        }
        plans.push(PileCapPlanPreview {
            plan_id: plan.id.clone(),
            proposals: plan.pile_cap_proposals.clone(),
            previews,
            pile_count,
            total_cost,
            missing_cost_count,
        });
    }
    Ok(PileCapProposalResult { plans })
}

/// Shared demand/CPT/capacity path for manual proposals and optimizer candidates.
pub(crate) struct PileCapAnalysis<'a> {
    project: &'a crate::PilePlanProject,
    advice: crate::pile_options::FoundationAdviceIndex<'a>,
    members: HashMap<u32, &'a ProjectLoadPoint>,
    selections: HashMap<u32, Vec<crate::SelectedCpt>>,
}
pub(crate) struct PileCapDemand {
    pub cpt_ids: Vec<u32>,
    pub missing_selection_load_point_ids: Vec<u32>,
    pub options: Vec<PileConfigurationOption>,
}
impl<'a> PileCapAnalysis<'a> {
    pub(crate) fn new(project: &'a crate::PilePlanProject) -> Result<Self, String> {
        Ok(Self {
            project,
            advice: crate::pile_options::FoundationAdviceIndex::new(
                &project.inputs.bearing_capacities,
            )
            .map_err(|e| e.to_string())?,
            members: project
                .inputs
                .load_points
                .iter()
                .map(|p| (p.id, p))
                .collect(),
            selections: HashMap::new(),
        })
    }
    pub(crate) fn evaluate(&mut self, ids: &[u32], count: u8) -> Option<PileCapDemand> {
        if ids.is_empty() || !(1..=MAX_PILE_CAP_COUNT).contains(&count) {
            return None;
        }
        let mut total = 0.;
        let mut selected = BTreeMap::new();
        let mut missing = vec![];
        for id in ids {
            let member = *self.members.get(id)?;
            if !member.design_load_kn.is_finite()
                || member.design_load_kn < 0.
                || !member.x_mm.is_finite()
                || !member.y_mm.is_finite()
            {
                return None;
            }
            total += member.design_load_kn;
            let selections = self.selections.entry(*id).or_insert_with(|| {
                crate::cpt_selection::select_cpts(
                    member,
                    &self.project.inputs.cpts,
                    self.project
                        .settings
                        .cpt_selection_by_load_point
                        .get(id)
                        .unwrap_or(&self.project.settings.global_cpt_selection),
                    self.project
                        .user_state
                        .manual_cpt_selections
                        .get(id)
                        .map(Vec::as_slice),
                )
            });
            if selections.is_empty() {
                missing.push(*id);
            }
            for selection in selections {
                selected
                    .entry(selection.cpt.id)
                    .or_insert_with(|| selection.clone());
            }
        }
        if !total.is_finite() {
            return None;
        }
        let cpt_ids = selected.keys().copied().collect();
        let options = if missing.is_empty() {
            crate::pile_options::pile_configuration_options(
                total / f64::from(count),
                &selected.into_values().collect::<Vec<_>>(),
                &self.advice,
            )
        } else {
            vec![]
        };
        Some(PileCapDemand {
            cpt_ids,
            missing_selection_load_point_ids: missing,
            options,
        })
    }
}
