use super::{prepare::diagnostic, types::*};
use crate::{OptimizationUnit, PileCapProposal, PileConfigurationKey, PileConfigurationOption};
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Clone)]
struct Choice {
    members: Vec<(u32, PileConfigurationOption)>,
    proposal: Option<PileCapProposal>,
    rank: (bool, u64, bool, usize),
}
pub(super) struct CapPreparation {
    pub input: IlpOptimizationInput,
    choices: HashMap<(Vec<u32>, PileConfigurationKey), Choice>,
    pub diagnostics: Vec<IlpDiagnostic>,
    pub current_proposals: Vec<PileCapProposal>,
    alternatives: HashMap<(Vec<u32>, PileConfigurationKey), Vec<Choice>>,
}
impl CapPreparation {
    pub fn apply(&self, units: &mut [OptimizationUnit]) {
        let count_coherence = self.input.settings.optimize_coherence
            && self.input.settings.transition_weights.pile_count_milli > 0;
        for unit in units {
            unit.options = unit
                .options
                .iter()
                .flat_map(|option| {
                    let key = (unit.load_point_ids.clone(), option.configuration.clone());
                    let choices = if count_coherence {
                        self.alternatives
                            .get(&key)
                            .map(|v| v.iter().filter(|c| !c.rank.0).collect::<Vec<_>>())
                    } else {
                        self.choices.get(&key).map(|c| vec![c])
                    };
                    choices
                        .map(|choices| {
                            choices
                                .into_iter()
                                .map(|choice| {
                                    let mut candidate = option.clone();
                                    candidate.pile_cap_proposal = choice.proposal.clone();
                                    candidate.total_cost = choice.rank.1;
                                    if let Some((id, critical)) =
                                        choice.members.iter().max_by(|(_, a), (_, b)| {
                                            a.utilization
                                                .unwrap_or(0.)
                                                .total_cmp(&b.utilization.unwrap_or(0.))
                                        })
                                    {
                                        candidate.maximum_utilization =
                                            critical.utilization.unwrap();
                                        candidate.critical_load_point_id = *id;
                                        candidate.critical_governing_cpt_id =
                                            critical.governing_cpt_id;
                                        candidate.critical_governing_frd_kn =
                                            critical.governing_frd_kn;
                                    }
                                    candidate
                                })
                                .collect()
                        })
                        .unwrap_or_else(|| vec![option.clone()])
                })
                .collect();
        }
    }
}
fn blocked(code: &str, ids: Vec<u32>) -> IlpOptimizationOutcome {
    IlpOptimizationOutcome::Blocked {
        diagnostics: vec![diagnostic(code, ids, true)],
        solvable_load_point_ids: vec![],
    }
}
pub(super) fn prepare_caps(
    input: &IlpOptimizationInput,
) -> Result<CapPreparation, IlpOptimizationOutcome> {
    let mut result = CapPreparation {
        input: input.clone(),
        choices: HashMap::new(),
        diagnostics: vec![],
        current_proposals: vec![],
        alternatives: HashMap::new(),
    };
    for options in result.input.options_by_load_point.values_mut() {
        for option in options {
            option.apply_scope(input.settings.include_tension);
        }
    }
    let scoped_input = result.input.clone();
    let input = &scoped_input;
    let Some(draft) = &input.pile_cap_context else {
        return if input.settings.allow_pile_count_changes {
            Err(blocked("missing_pile_cap_context", vec![]))
        } else {
            Ok(result)
        };
    };
    let contents = crate::write_project_document(draft.clone())
        .map_err(|_| blocked("invalid_pile_cap_context", vec![]))?;
    let project = crate::read_ifcpp_str(&contents)
        .map_err(|_| blocked("invalid_pile_cap_context", vec![]))?;
    let groups = crate::derive_load_point_groups(
        &project.inputs.load_points,
        &project.settings.load_point_grouping,
    )
    .groups;
    if project.inputs.bearing_capacities.iter().any(|v|v.pile_count.is_some()) {
        let mut base=crate::build_pile_option_analysis_for_groups(&project.inputs.load_points,&project.inputs.cpts,
            &project.inputs.bearing_capacities,|p|project.settings.cpt_selection_by_load_point.get(&p.id).unwrap_or(&project.settings.global_cpt_selection).clone(),
            &project.user_state.manual_cpt_selections,false,&groups)
            .map_err(|_|blocked("invalid_pile_cap_context",vec![]))?;
        for options in base.pile_options_by_load_point.values_mut(){for option in options{option.apply_scope(input.settings.include_tension);}}
        result.input.options_by_load_point=base.pile_options_by_load_point;
    }
    let keys = |groups: &[crate::LoadPointGroup]| {
        groups
            .iter()
            .map(|g| {
                let mut ids = g.load_point_ids.clone();
                ids.sort_unstable();
                ids
            })
            .collect::<BTreeSet<_>>()
    };
    if input.load_points != project.inputs.load_points
        || keys(&input.groups) != keys(&groups)
        || input.cost_settings != project.settings.pile_costs
        || input.pile_head_level_m != project.settings.pile_head_level_m
    {
        return Err(blocked("invalid_pile_cap_context", vec![]));
    }
    let plan = project
        .user_state
        .pile_plans
        .iter()
        .find(|p| p.id == project.user_state.active_pile_plan_id)
        .ok_or_else(|| blocked("invalid_pile_cap_context", vec![]))?;
    result.current_proposals = plan.pile_cap_proposals.clone();
    for proposal in &plan.pile_cap_proposals {
        if !keys(&groups).contains(&proposal.load_point_ids) {
            return Err(blocked(
                "pile_cap_group_changed",
                proposal.load_point_ids.clone(),
            ));
        }
        for id in &proposal.load_point_ids {
            if let Some(configuration) = &proposal.configuration {
                result
                    .input
                    .current_assignments
                    .insert(*id, configuration.clone());
            } else {
                result.input.current_assignments.remove(id);
            }
        }
    }
    let mut analysis = crate::pile_cap_proposals::PileCapAnalysis::new(&project)
        .map_err(|_| blocked("invalid_pile_cap_context", vec![]))?;
    let locked: HashSet<_> = input.locked_load_point_ids.iter().copied().collect();
    for group in &groups {
        let mut ids = group.load_point_ids.clone();
        ids.sort_unstable();
        let existing = plan
            .pile_cap_proposals
            .iter()
            .find(|p| p.load_point_ids == ids);
        if !input.settings.allow_pile_count_changes && existing.is_none() {
            continue;
        }
        // Outside target groups still need their fixed proposal options/configuration
        // for whole-plan limits and boundary transitions.
        let targeted = ids
            .iter()
            .any(|id| input.target_load_point_ids.contains(id));
        let current = existing
            .map(|p| usize::from(p.pile_count))
            .unwrap_or(ids.len());
        let variable = input.settings.allow_pile_count_changes
            && targeted
            && !ids.iter().any(|id| locked.contains(id));
        if !variable && existing.is_none() {
            continue;
        }
        let mut counts: BTreeSet<usize> = if variable {
            input
                .settings
                .allowed_pile_counts
                .iter()
                .copied()
                .filter(|count| *count <= input.settings.max_piles_per_cap)
                .map(usize::from)
                .collect()
        } else {
            BTreeSet::new()
        };
        if variable {
            // Existing larger source groups/proposals are preservation choices,
            // never truncated to the maximum for newly proposed counts.
            for count in [ids.len(), current] {
                if count > usize::from(input.settings.max_piles_per_cap) {
                    counts.insert(count);
                }
            }
        } else {
            counts.insert(current);
        }
        let mut best: HashMap<PileConfigurationKey, Choice> = HashMap::new();
        for count in counts {
            let proposal = if count != ids.len() {
                Some(PileCapProposal {
                    load_point_ids: ids.clone(),
                    pile_count: count as u8,
                    quarter_turns: existing.map(|p| p.quarter_turns).unwrap_or(0),
                    configuration: None,
                })
            } else {
                None
            };
            let mut members: HashMap<_, _> = if proposal.is_some() {
                let Some(demand) = analysis.evaluate(&ids, count as u8) else {
                    return Err(blocked("invalid_pile_cap_source", ids));
                };
                if !demand.missing_selection_load_point_ids.is_empty() {
                    if targeted && !result.diagnostics.iter().any(|d| d.load_point_ids == ids) {
                        result.diagnostics.push(diagnostic(
                            "missing_cpt_selection",
                            ids.clone(),
                            true,
                        ));
                    }
                    continue;
                }
                ids.iter().map(|id| (*id, demand.options.clone())).collect()
            } else {
                ids.iter()
                    .filter_map(|id| {
                        input
                            .options_by_load_point
                            .get(id)
                            .map(|o| (*id, o.clone()))
                    })
                    .collect()
            };
            for options in members.values_mut() {
                for option in options {
                    option.apply_scope(input.settings.include_tension);
                }
            }
            let configurations: BTreeSet<_> = members
                .values()
                .flatten()
                .map(|o| o.configuration.clone())
                .collect();
            for configuration in configurations {
                let options: Vec<_> = ids
                    .iter()
                    .filter_map(|id| {
                        members
                            .get(id)?
                            .iter()
                            .find(|o| o.configuration == configuration)
                            .map(|o| (*id, o.clone()))
                    })
                    .collect();
                if options.len() != ids.len() {
                    continue;
                }
                let eligible = options.iter().all(|(id, o)| {
                    o.is_option
                        && o.technical_status == crate::PileOptionTechnicalStatus::Valid
                        && o.utilization.is_some_and(|v| {
                            v <= if locked.contains(id) {
                                1.0
                            } else {
                                input.settings.max_utilization
                            }
                        })
                });
                let cost = input
                    .pile_head_level_m
                    .and_then(|head| {
                        crate::calculate_pile_cost(
                            configuration.pile_size_mm,
                            configuration.pile_tip_level_m(),
                            head,
                            &input.cost_settings,
                        )
                    })
                    .map(|c| u64::from(c) * count as u64)
                    .unwrap_or(u64::MAX);
                let rank = (!eligible, cost, count != current, count);
                let choice = Choice {
                    members: options,
                    proposal: proposal.clone().map(|mut p| {
                        p.configuration = Some(configuration.clone());
                        p
                    }),
                    rank,
                };
                if input.settings.optimize_coherence
                    && input.settings.transition_weights.pile_count_milli > 0
                {
                    result
                        .alternatives
                        .entry((ids.clone(), configuration.clone()))
                        .or_default()
                        .push(choice.clone());
                }
                if best.get(&configuration).is_none_or(|old| rank < old.rank) {
                    best.insert(configuration, choice);
                }
            }
        }
        for id in &ids {
            result.input.options_by_load_point.insert(*id, vec![]);
        }
        for (configuration, choice) in best {
            for (id, option) in &choice.members {
                result
                    .input
                    .options_by_load_point
                    .get_mut(id)
                    .unwrap()
                    .push(option.clone());
            }
            result.choices.insert((ids.clone(), configuration), choice);
        }
    }
    Ok(result)
}
