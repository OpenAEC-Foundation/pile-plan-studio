//! Reproducible release benchmark; optional arguments: deadline_ms, budget_basis_points,
//! maximum_configurations (0 = unlimited), export_request_path (or -),
//! maximum_tip_levels, maximum_sizes, tip_weight, size_weight (milli).
//! A final 0 disables coherence optimization (default 1).
use pile_plan_core::*;
use std::{
    collections::{BTreeSet, HashMap},
    time::Instant,
};
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let deadline = args.first().map(|s| s.parse().unwrap()).unwrap_or(5000);
    let budget = args.get(1).map(|s| s.parse().unwrap()).unwrap_or(500);
    let cap = args.get(2).map(|s| s.parse::<u32>().unwrap()).unwrap_or(0);
    let extra = |index: usize, default: u32| {
        args.get(index)
            .map(|s| s.parse::<u32>().unwrap())
            .unwrap_or(default)
    };
    let p =
        read_ifcpp_str(&std::fs::read_to_string("sample_project/sample_project.ifcpp").unwrap())
            .unwrap();
    let started = Instant::now();
    let analysis = build_pile_option_analysis(
        &p.inputs.load_points,
        &p.inputs.cpts,
        &p.inputs.bearing_capacities,
        |lp| {
            p.settings
                .cpt_selection_by_load_point
                .get(&lp.id)
                .unwrap_or(&p.settings.global_cpt_selection)
                .clone()
        },
        &p.user_state.manual_cpt_selections,
        false,
    )
    .unwrap();
    let plan = p.user_state.active_pile_plan().unwrap();
    let groups = derive_load_point_groups(&p.inputs.load_points, &p.settings.load_point_grouping);
    let candidates = analysis
        .pile_options_by_load_point
        .values()
        .flatten()
        .map(|o| o.configuration.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut input = IlpOptimizationInput {
        target_load_point_ids: p.inputs.load_points.iter().map(|p| p.id).collect(),
        load_points: p.inputs.load_points.clone(),
        groups,
        options_by_load_point: analysis.pile_options_by_load_point,
        current_assignments: ProjectDocumentDraft::from_project(&p).active_selected_piles,
        locked_load_point_ids: plan.locked_load_point_ids.clone(),
        candidate_configurations: candidates,
        pile_head_level_m: p.settings.pile_head_level_m,
        cost_settings: p.settings.pile_costs.clone(),
        settings: IlpOptimizationSettings {
            optimize_coherence: extra(8, 1) != 0,
            budget_basis_points: budget,
            max_pile_configurations: (cap > 0).then_some(cap),
            max_pile_tip_levels: (extra(4, 0) > 0).then_some(extra(4, 0)),
            max_pile_sizes: (extra(5, 0) > 0).then_some(extra(5, 0)),
            transition_weights: IlpTransitionWeights {
                tip_only_milli: extra(6, 1000),
                size_only_milli: extra(7, 1000),
                legacy_both_milli: None,
            },
            ..Default::default()
        },
        limit_scope: OptimizationLimitScope::Target,
        include_boundary_transitions: false,
    };
    let mut session = IlpOptimizationSession::new();
    let first = session.run(
        IlpRunRequest {
            local_only: false,
            run_id: "preflight".into(),
            input: input.clone(),
            time_limit_ms: Some(100),
        },
        &mut |_| {},
        &|| false,
    );
    if let IlpOptimizationOutcome::Blocked {
        solvable_load_point_ids,
        ..
    } = first
    {
        assert!(!solvable_load_point_ids.is_empty());
        input.target_load_point_ids = solvable_load_point_ids;
    }
    let target: BTreeSet<_> = input.target_load_point_ids.iter().copied().collect();
    let groups: Vec<_> = input
        .groups
        .iter()
        .filter(|g| g.load_point_ids.iter().any(|id| target.contains(id)))
        .cloned()
        .collect();
    let prepared = prepare_optimization_units(&PrepareOptimizationUnitsInput {
        groups: groups.clone(),
        options_by_load_point: input.options_by_load_point.clone(),
        current_assignments: input.current_assignments.clone(),
        locked_load_point_ids: input.locked_load_point_ids.clone(),
        pile_head_level_m: input.pile_head_level_m,
        cost_settings: input.cost_settings.clone(),
        candidate_settings: OptimizationCandidateSettings {
            max_utilization: 1.0,
            enabled_configurations: input.candidate_configurations.clone(),
        },
    });
    let units: HashMap<_, _> = prepared
        .units
        .iter()
        .enumerate()
        .flat_map(|(u, g)| g.load_point_ids.iter().map(move |id| (*id, u)))
        .collect();
    let edges: BTreeSet<_> = build_load_point_topology(&input.load_points)
        .edges
        .iter()
        .filter_map(|e| {
            let a = *units.get(&e.from_load_point_id)?;
            let b = *units.get(&e.to_load_point_id)?;
            (a != b).then_some((a.min(b), a.max(b)))
        })
        .collect();
    let pairs: usize = prepared.units.iter().map(|u| u.options.len()).sum();
    let w = &input.settings.transition_weights;
    let edge_variables = usize::from(w.tip_only_milli != 0) + usize::from(w.size_only_milli != 0);
    eprintln!(
        "points={} targets={} units={} choices={} edges={} base_binaries={} analysis_ms={}",
        input.load_points.len(),
        target.len(),
        groups.len(),
        pairs,
        edges.len(),
        pairs + edge_variables * edges.len(),
        started.elapsed().as_millis()
    );
    let request = IlpRunRequest {
        local_only: false,
        run_id: "benchmark".into(),
        input,
        time_limit_ms: Some(deadline),
    };
    if let Some(path) = args.get(3).filter(|p| p.as_str() != "-") {
        std::fs::write(path, serde_json::to_string(&request).unwrap()).unwrap();
        std::fs::write(
            format!("{path}.units.json"),
            serde_json::to_string(&serde_json::json!({
                "units": prepared.units, "edges": edges,
            }))
            .unwrap(),
        )
        .unwrap();
    }
    let mut phase = None;
    let mut last_report_ms = 0;
    let mut last_progress = None;
    let outcome = session.run(
        request,
        &mut |p| {
            if phase != Some(p.phase) || p.elapsed_ms.saturating_sub(last_report_ms) >= 30_000 {
                eprintln!(
                    "phase={:?} elapsed_ms={} incumbent={:?} bound={:?} gap={:?}",
                    p.phase, p.elapsed_ms, p.incumbent_objective, p.best_bound, p.relative_gap
                );
                phase = Some(p.phase);
                last_report_ms = p.elapsed_ms;
            }
            last_progress = Some(p);
        },
        &|| false,
    );
    eprintln!("total_ms={}", started.elapsed().as_millis());
    eprintln!("last_progress={last_progress:?}");
    if let Some(path) = args.get(3).filter(|p| p.as_str() != "-") {
        std::fs::write(
            format!("{path}.outcome.json"),
            serde_json::to_string(&outcome).unwrap(),
        )
        .unwrap();
    }
    match outcome {
        IlpOptimizationOutcome::Solved { solution: s, .. } => println!(
            "reference={} reference_proof={:?} budget={} cost={} score={} proof={:?}",
            s.reference.cost, s.reference.proof, s.budget, s.cost, s.score_milli, s.proof
        ),
        other => println!("{other:?}"),
    }
}
