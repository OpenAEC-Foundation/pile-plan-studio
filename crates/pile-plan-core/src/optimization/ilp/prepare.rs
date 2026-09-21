use super::types::*;
use crate::{
    aggregate_pile_options_for_load_points, build_load_point_topology, prepare_optimization_units,
    validate_pile_cost_settings, AggregatedPileConfigurationStatus, OptimizationCandidateSettings,
    OptimizationLimitScope, OptimizationUnit, PileConfigurationKey,
    PrepareOptimizationUnitsInput,
};
use std::collections::{BTreeSet, HashMap};

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Neighbor {
    Unit(usize),
    Fixed(PileConfigurationKey),
}
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PreparedIlpProblem {
    pub units: Vec<OptimizationUnit>,
    pub outside: BTreeSet<PileConfigurationKey>,
    pub edges: Vec<(usize, Neighbor)>,
    pub diagnostics: Vec<IlpDiagnostic>,
    pub settings: IlpOptimizationSettings,
}
pub(crate) fn diagnostic(code: &str, ids: Vec<u32>, blocking: bool) -> IlpDiagnostic {
    IlpDiagnostic {
        code: code.into(),
        load_point_ids: ids,
        blocking,
    }
}
fn blocked(code: &str) -> IlpOptimizationOutcome {
    IlpOptimizationOutcome::Blocked {
        diagnostics: vec![diagnostic(code, vec![], true)],
        solvable_load_point_ids: vec![],
    }
}
pub(crate) fn prepare(
    input: &IlpOptimizationInput,
) -> Result<PreparedIlpProblem, IlpOptimizationOutcome> {
    if !input.settings.is_valid() {
        return Err(blocked("invalid_settings"));
    }
    if input.pile_head_level_m.is_none() {
        return Err(blocked("missing_pile_head_level"));
    }
    if validate_pile_cost_settings(&input.cost_settings).is_err()
        || input.pile_head_level_m.is_some_and(|x| !x.is_finite())
    {
        return Err(blocked("invalid_cost_settings"));
    }
    let ids: BTreeSet<_> = input.load_points.iter().map(|p| p.id).collect();
    let grouped: Vec<_> = input
        .groups
        .iter()
        .flat_map(|g| g.load_point_ids.iter().copied())
        .collect();
    if ids.len() != input.load_points.len()
        || grouped.len() != ids.len()
        || grouped.iter().copied().collect::<BTreeSet<_>>() != ids
        || input.groups.iter().any(|g| g.load_point_ids.is_empty())
        || input
            .load_points
            .iter()
            .any(|p| !p.x_mm.is_finite() || !p.y_mm.is_finite())
        || input
            .target_load_point_ids
            .iter()
            .any(|id| !ids.contains(id))
    {
        return Err(blocked("invalid_group_partition"));
    }
    let mut groups = input.groups.clone();
    for g in &mut groups {
        g.load_point_ids.sort_unstable();
    }
    groups.sort_by(|a, b| a.load_point_ids.cmp(&b.load_point_ids));
    let target: BTreeSet<_> = input.target_load_point_ids.iter().copied().collect();
    let target_groups: Vec<_> = groups
        .iter()
        .filter(|g| g.load_point_ids.iter().any(|id| target.contains(id)))
        .cloned()
        .collect();
    if target_groups.is_empty() {
        return Err(blocked("empty_target"));
    }
    let target_ids: BTreeSet<_> = target_groups
        .iter()
        .flat_map(|g| g.load_point_ids.iter().copied())
        .collect();
    let candidates = if input.settings.candidate_source == IlpCandidateSource::AllAvailable
    {
        input
            .options_by_load_point
            .iter()
            .filter(|(id, _)| target_ids.contains(id))
            .flat_map(|(_, opts)| opts.iter().map(|o| o.configuration.clone()))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    } else if input.settings.candidate_source == IlpCandidateSource::Custom {
        input.settings.custom_configurations.clone()
    } else {
        input.candidate_configurations.clone()
    };
    let mut prepared = prepare_optimization_units(&PrepareOptimizationUnitsInput {
        groups: target_groups.clone(),
        options_by_load_point: input.options_by_load_point.clone(),
        current_assignments: input.current_assignments.clone(),
        locked_load_point_ids: input.locked_load_point_ids.clone(),
        pile_head_level_m: input.pile_head_level_m,
        cost_settings: input.cost_settings.clone(),
        candidate_settings: OptimizationCandidateSettings {
            max_utilization: input.settings.max_utilization,
            enabled_configurations: candidates.clone(),
        },
    });
    let mut diagnostics: Vec<_> = prepared
        .diagnostics
        .iter()
        .filter(|d| d.kind != crate::OptimizationPreparationDiagnosticKind::NoPileConfigurations)
        .map(|d| {
            let code = serde_json::to_value(&d.kind)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned();
            diagnostic(&code, d.load_point_ids.clone(), true)
        })
        .collect();
    let input_error = !diagnostics.is_empty();
    let mut solvable = vec![];
    for group in &target_groups {
        if prepared
            .units
            .iter()
            .any(|u| u.load_point_ids == group.load_point_ids && !u.options.is_empty())
        {
            solvable.extend(&group.load_point_ids);
            continue;
        }
        if diagnostics.iter().any(|d| {
            d.load_point_ids
                .iter()
                .any(|id| group.load_point_ids.contains(id))
        }) {
            continue;
        }
        let member_options: HashMap<_, _> = group
            .load_point_ids
            .iter()
            .filter_map(|id| {
                input
                    .options_by_load_point
                    .get(id)
                    .map(|opts| (*id, opts.clone()))
            })
            .collect();
        let aggregate = aggregate_pile_options_for_load_points(&member_options);
        let technical: Vec<_> = aggregate
            .iter()
            .filter(|o| o.status == AggregatedPileConfigurationStatus::Valid)
            .collect();
        let code = if group
            .load_point_ids
            .iter()
            .any(|id| !input.options_by_load_point.contains_key(id))
        {
            "missing_analysis_data"
        } else if technical.is_empty() {
            if member_options
                .values()
                .flatten()
                .any(|o| !o.missing_cpt_ids.is_empty())
            {
                "missing_capacity_data"
            } else if member_options
                .values()
                .any(|opts| !opts.iter().any(|o| o.is_option))
            {
                "insufficient_capacity"
            } else {
                "no_common_group_configuration"
            }
        } else if !technical
            .iter()
            .any(|o| candidates.contains(&o.configuration))
        {
            "candidate_filter_excludes_all"
        } else {
            "utilization_limit_excludes_all"
        };
        diagnostics.push(diagnostic(code, group.load_point_ids.clone(), true));
    }
    if input.settings.skip_unsolvable_units {
        // Only empty per-unit domains may be skipped. Cost/input errors and
        // globally incompatible configuration limits must still block the run.
        for d in &mut diagnostics {
            if !d.load_point_ids.is_empty()
                && matches!(
                    d.code.as_str(),
                    "missing_analysis_data"
                        | "missing_capacity_data"
                        | "insufficient_capacity"
                        | "no_common_group_configuration"
                        | "candidate_filter_excludes_all"
                        | "utilization_limit_excludes_all"
                        | "no_eligible_configuration"
                        | "conflicting_locked_configurations"
                        | "locked_member_unassigned"
                        | "locked_configuration_unavailable"
                        | "locked_configuration_exceeds_utilization_limit"
                )
            {
                d.blocking = false;
            }
        }
    }
    if diagnostics.iter().any(|d| d.blocking) {
        return Err(IlpOptimizationOutcome::Blocked {
            diagnostics,
            solvable_load_point_ids: if input_error { vec![] } else { solvable },
        });
    }
    let target_ids: BTreeSet<_> = solvable.into_iter().collect();
    let skipped: Vec<_> = target_groups
        .iter()
        .flat_map(|g| g.load_point_ids.iter().copied())
        .filter(|id| !target_ids.contains(id))
        .collect();
    if !skipped.is_empty() {
        diagnostics.insert(0, diagnostic("skipped_unsolvable_units", skipped, false));
    }
    prepared.units.retain(|u| !u.options.is_empty());
    if prepared.units.is_empty() {
        diagnostics.insert(0, diagnostic("no_solvable_targets", vec![], true));
        return Err(IlpOptimizationOutcome::Blocked {
            diagnostics,
            solvable_load_point_ids: vec![],
        });
    }
    let outside = if input.limit_scope == OptimizationLimitScope::WholePlan {
        input
            .current_assignments
            .iter()
            .filter(|(id, _)| ids.contains(id) && !target_ids.contains(id))
            .map(|(_, c)| c.clone())
            .collect()
    } else {
        BTreeSet::new()
    };
    let unit_by_id: HashMap<_, _> = prepared
        .units
        .iter()
        .enumerate()
        .flat_map(|(u, unit)| unit.load_point_ids.iter().map(move |id| (*id, u)))
        .collect();
    let mut fixed = HashMap::new();
    if input.include_boundary_transitions {
        for (index, g) in groups
            .iter()
            .enumerate()
            .filter(|(_, g)| !target_ids.contains(&g.load_point_ids[0]))
        {
            let c = input.current_assignments.get(&g.load_point_ids[0]);
            let valid = c.is_some_and(|c| {
                g.load_point_ids.iter().all(|id| {
                    input.current_assignments.get(id) == Some(c)
                        && input.options_by_load_point.get(id).is_some_and(|opts| {
                            opts.iter().any(|o| {
                                &o.configuration == c
                                    && o.is_option
                                    && o.technical_status == crate::PileOptionTechnicalStatus::Valid
                            })
                        })
                })
            });
            if valid {
                fixed.insert(index, c.unwrap().clone());
            } else {
                diagnostics.push(diagnostic(
                    "invalid_fixed_neighbor",
                    g.load_point_ids.clone(),
                    false,
                ));
            }
        }
    }
    let topology = build_load_point_topology(&input.load_points);
    let mut edges = vec![];
    for (a, b) in crate::tip_level_regions::contract_optimization_unit_graph(&topology, &groups) {
        let ua = unit_by_id.get(&groups[a].load_point_ids[0]);
        let ub = unit_by_id.get(&groups[b].load_point_ids[0]);
        match (ua, ub) {
            (Some(a), Some(b)) => edges.push((*a, Neighbor::Unit(*b))),
            (Some(a), None) => {
                if let Some(c) = fixed.get(&b) {
                    edges.push((*a, Neighbor::Fixed(c.clone())));
                }
            }
            (None, Some(b)) => {
                if let Some(c) = fixed.get(&a) {
                    edges.push((*b, Neighbor::Fixed(c.clone())));
                }
            }
            _ => {}
        }
    }
    Ok(PreparedIlpProblem {
        units: prepared.units,
        outside,
        edges,
        diagnostics,
        settings: input.settings.clone(),
    })
}
