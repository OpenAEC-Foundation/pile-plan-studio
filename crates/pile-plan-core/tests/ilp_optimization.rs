use pile_plan_core::*;
use std::collections::HashMap;

fn skipping(mut input: IlpOptimizationInput) -> IlpOptimizationInput {
    let mut settings = serde_json::to_value(&input.settings).unwrap();
    settings["skip_unsolvable_units"] = true.into();
    input.settings = serde_json::from_value(settings).unwrap();
    input
}

#[test]
fn skipping_is_opt_in_and_rechecks_the_current_candidate_settings() {
    let mut i = input();
    i.settings.candidate_source = IlpCandidateSource::ActiveLegend;
    i.candidate_configurations = vec![config(1000, -10_000)];
    assert!(matches!(
        run(i.clone()),
        IlpOptimizationOutcome::Blocked { .. }
    ));
    let IlpOptimizationOutcome::Solved {
        solution,
        diagnostics,
    } = run(skipping(i.clone()))
    else {
        panic!("expected the two solvable locations to be optimized");
    };
    assert_eq!(
        solution
            .assignments
            .iter()
            .map(|a| a.load_point_id)
            .collect::<Vec<_>>(),
        vec![1, 3]
    );
    assert_eq!(solution.reference.cost, 20);
    assert!(diagnostics
        .iter()
        .any(|d| d.code == "skipped_unsolvable_units"
            && d.load_point_ids == vec![2]
            && !d.blocking));
    assert!(diagnostics
        .iter()
        .any(|d| d.code == "candidate_filter_excludes_all" && !d.blocking));
    i.candidate_configurations.push(config(1000, -11_000));
    assert_eq!(solved(run(skipping(i))).assignments.len(), 3);
}

#[test]
fn skipping_excludes_whole_groups_and_respects_the_requested_target() {
    let mut i = input();
    i.groups = vec![
        LoadPointGroup {
            load_point_ids: vec![1, 2],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
        LoadPointGroup {
            load_point_ids: vec![3],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
    ];
    i.options_by_load_point.remove(&2);
    let IlpOptimizationOutcome::Solved {
        solution,
        diagnostics,
    } = run(skipping(i.clone()))
    else {
        panic!("expected partial plan")
    };
    assert_eq!(
        solution
            .assignments
            .iter()
            .map(|a| a.load_point_id)
            .collect::<Vec<_>>(),
        vec![3]
    );
    assert!(diagnostics
        .iter()
        .any(|d| d.code == "skipped_unsolvable_units" && d.load_point_ids == vec![1, 2]));
    i.target_load_point_ids = vec![1];
    let IlpOptimizationOutcome::Blocked { diagnostics, .. } = run(skipping(i)) else {
        panic!("must not optimize outside selection")
    };
    assert!(diagnostics.iter().any(|d| d.code == "no_solvable_targets"));
}

#[test]
fn skipping_never_drops_solvable_locations_to_satisfy_global_limits() {
    let mut i = input();
    i.options_by_load_point
        .insert(1, vec![option(config(1000, -10_000))]);
    i.options_by_load_point.remove(&3);
    i.settings.max_pile_tip_levels = Some(1);
    let IlpOptimizationOutcome::Infeasible {
        proposal: Some(proposal),
        diagnostics,
    } = run(skipping(i))
    else {
        panic!("global cap must still block")
    };
    assert_eq!(proposal.required_limits.tip_levels, 2);
    assert_eq!(proposal.witness.len(), 2);
    assert!(diagnostics
        .iter()
        .any(|d| d.code == "skipped_unsolvable_units" && d.load_point_ids == vec![3]));
}

#[test]
fn skipping_does_not_hide_missing_cost_data() {
    let mut i = input();
    i.cost_settings.items.clear();
    assert!(matches!(
        run(skipping(i)),
        IlpOptimizationOutcome::Blocked { .. }
    ));
}

#[test]
fn skipped_units_preserve_outside_limit_and_boundary_semantics() {
    let mut i = input();
    i.settings.candidate_source = IlpCandidateSource::ActiveLegend;
    i.candidate_configurations = vec![config(1000, -10_000)];
    i.current_assignments.insert(2, config(1000, -11_000));
    let target = solved(run(skipping(i.clone())));
    assert_eq!(target.score_milli, 0);
    assert_eq!(target.counts.tip_levels, 1);
    i.include_boundary_transitions = true;
    i.limit_scope = OptimizationLimitScope::WholePlan;
    let whole = solved(run(skipping(i)));
    assert_eq!(whole.score_milli, 2000);
    assert_eq!(whole.counts.tip_levels, 2);
    assert_eq!(whole.cost, 20);
}

#[test]
fn skipped_group_notices_survive_live_solution_snapshots() {
    let mut i = input();
    i.settings.candidate_source = IlpCandidateSource::ActiveLegend;
    i.candidate_configurations = vec![config(1000, -10_000)];
    i.current_assignments.insert(2, config(1000, -11_000));
    i.include_boundary_transitions = true;
    let mut snapshots = vec![];
    let outcome = IlpOptimizationSession::new().run(
        IlpRunRequest {
            run_id: "skip-progress".into(),
            local_only: true,
            input: skipping(i),
            time_limit_ms: None,
        },
        &mut |p| {
            if p.best_solution.is_some() {
                snapshots.push(p);
            }
        },
        &|| false,
    );
    assert_eq!(solved(outcome).assignments.len(), 2);
    assert!(!snapshots.is_empty());
    assert!(snapshots.iter().all(|p| p
        .diagnostics
        .iter()
        .any(|d| d.code == "skipped_unsolvable_units" && d.load_point_ids == vec![2])));
}

#[test]
fn local_mode_finishes_without_claiming_spatial_optimality() {
    let outcome = IlpOptimizationSession::new().run(
        IlpRunRequest {
            run_id: "local".into(),
            local_only: true,
            input: input(),
            time_limit_ms: Some(2000),
        },
        &mut |_| {},
        &|| false,
    );
    let solution = solved(outcome);
    assert!(solution.cost <= solution.budget);
    assert_eq!(solution.termination, IlpTermination::Completed);
    assert_eq!(solution.reference.proof, IlpProof::Optimal);
    assert_eq!(
        solution.proof,
        if solution.score_milli == 0 {
            IlpProof::Optimal
        } else {
            IlpProof::Feasible
        }
    );
}

#[test]
fn spatial_progress_publishes_validated_monotonically_improving_plans() {
    let mut snapshots = vec![];
    let final_plan = solved(IlpOptimizationSession::new().run(
        IlpRunRequest {
            run_id: "progress".into(),
            local_only: false,
            input: input(),
            time_limit_ms: Some(2000),
        },
        &mut |progress| {
            if let Some(solution) = progress.best_solution {
                assert!(solution.cost <= solution.budget);
                assert_eq!(
                    Some(solution.score_milli as f64),
                    progress.incumbent_objective
                );
                assert_eq!(solution.proof, IlpProof::Feasible);
                snapshots.push(solution);
            }
        },
        &|| false,
    ));
    assert!(!snapshots.is_empty());
    assert!(snapshots
        .windows(2)
        .all(|s| s[1].score_milli < s[0].score_milli));
    assert!(final_plan.score_milli <= snapshots.last().unwrap().score_milli);
}

#[test]
fn cost_only_mode_obeys_caps_and_reuses_its_reference_when_coherence_is_enabled() {
    let mut i = input();
    i.settings.optimize_coherence = false;
    i.settings.max_pile_tip_levels = Some(1);
    i.settings.budget_basis_points = 2000;
    let mut phases = vec![];
    let mut session = IlpOptimizationSession::new();
    let request = |input| IlpRunRequest {
        local_only: false,
        run_id: "cost-only".into(),
        input,
        time_limit_ms: Some(1000),
    };
    let cost = solved(session.run(request(i.clone()), &mut |p| phases.push(p.phase), &|| false));
    assert_eq!(cost.cost, 33);
    assert_eq!(cost.budget, 33);
    assert_eq!(cost.counts.tip_levels, 1);
    assert_eq!(cost.proof, IlpProof::Optimal);
    assert!(!phases.contains(&IlpPhase::Spatial));
    phases.clear();
    i.settings.optimize_coherence = true;
    let spatial = solved(session.run(request(i), &mut |p| phases.push(p.phase), &|| false));
    assert_eq!(spatial.reference.cost, 33);
    assert_eq!(spatial.budget, 39);
    assert!(!phases.contains(&IlpPhase::CostReference));
}

#[test]
fn zero_transition_weights_skip_the_spatial_phase() {
    let mut i = input();
    i.settings.transition_weights = IlpTransitionWeights {
        tip_only_milli: 0,
        size_only_milli: 0,
        legacy_both_milli: None,
    };
    let mut phases = vec![];
    let result = solved(IlpOptimizationSession::new().run(
        IlpRunRequest {
            local_only: false,
            run_id: "zero-objective".into(),
            input: i,
            time_limit_ms: Some(1000),
        },
        &mut |p| phases.push(p.phase),
        &|| false,
    ));
    assert_eq!(result.cost, result.reference.cost);
    assert_eq!(result.score_milli, 0);
    assert_eq!(result.proof, IlpProof::Optimal);
    assert!(!phases.contains(&IlpPhase::Spatial));
}

#[test]
fn spatial_timeout_explicitly_reports_cost_reference_fallback() {
    let request = IlpRunRequest {
        local_only: false,
        run_id: "timeout-notice".into(),
        input: input(),
        time_limit_ms: Some(1000),
    };
    let outcome = IlpOptimizationSession::new().run(
        request,
        &mut |progress| {
            if progress.phase == IlpPhase::CostReference && progress.incumbent_objective.is_some() {
                // Expire the total deadline after the cost solution, before the spatial solve.
                std::thread::sleep(std::time::Duration::from_millis(1100));
            }
        },
        &|| false,
    );
    let IlpOptimizationOutcome::Solved {
        solution,
        diagnostics,
    } = outcome
    else {
        panic!("expected fallback")
    };
    assert_eq!(solution.cost, solution.reference.cost);
    assert_eq!(solution.termination, IlpTermination::TimeLimit);
    assert_eq!(solution.proof, IlpProof::Feasible);
    assert!(diagnostics
        .iter()
        .any(|d| d.code == "spatial_reference_fallback" && !d.blocking));
}

fn config(size: u32, tip: i64) -> PileConfigurationKey {
    PileConfigurationKey {
        pile_size_mm: size,
        pile_tip_level_mm: tip,
    }
}
fn option(c: PileConfigurationKey) -> PileConfigurationOption {
    PileConfigurationOption {
        pile_size_mm: c.pile_size_mm,
        pile_tip_level_m: c.pile_tip_level_m(),
        configuration: c,
        is_option: true,
        governing_cpt_id: Some(1),
        governing_frd_kn: Some(100.0),
        utilization: Some(0.5),
        missing_cpt_ids: vec![],
        technical_status: PileOptionTechnicalStatus::Valid,
    }
}
fn input() -> IlpOptimizationInput {
    let a = config(1000, -10_000);
    let b = config(1000, -11_000);
    IlpOptimizationInput {
        load_points: (1..=3)
            .map(|id| ProjectLoadPoint {
                id,
                name: id.to_string(),
                x_mm: id as f64 * 2000.0,
                y_mm: 0.0,
                design_load_kn: 50.0,
            })
            .collect(),
        groups: (1..=3)
            .map(|id| LoadPointGroup {
                load_point_ids: vec![id],
                origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
            })
            .collect(),
        options_by_load_point: HashMap::from([
            (1, vec![option(a.clone()), option(b.clone())]),
            (2, vec![option(b.clone())]),
            (3, vec![option(a.clone()), option(b.clone())]),
        ]),
        target_load_point_ids: vec![1, 2, 3],
        current_assignments: HashMap::new(),
        locked_load_point_ids: vec![],
        candidate_configurations: vec![a, b],
        pile_head_level_m: Some(0.0),
        cost_settings: PileCostSettings {
            schema_version: 1,
            items: vec![PileCostSettingsItem {
                pile_size_mm: 1000,
                shape: PileCostShape::Square,
                cost_per_m3: 1.0,
            }],
        },
        settings: IlpOptimizationSettings::default(),
        limit_scope: OptimizationLimitScope::Target,
        include_boundary_transitions: false,
    }
}
#[test]
fn ilp_shared_browser_native_contract() {
    let request: IlpRunRequest = serde_json::from_str(include_str!(
        "../../../tests/fixtures/ilp-contract/request.json"
    ))
    .unwrap();
    let s = solved(IlpOptimizationSession::new().run(request, &mut |_| {}, &|| false));
    assert_eq!(
        (s.reference.cost, s.budget, s.cost, s.score_milli),
        (21, 22, 22, 0)
    );
}
fn run(input: IlpOptimizationInput) -> IlpOptimizationOutcome {
    IlpOptimizationSession::new().run(
        IlpRunRequest {
            local_only: false,
            run_id: "test".into(),
            input,
            time_limit_ms: None,
        },
        &mut |_| {},
        &|| false,
    )
}
fn solved(result: IlpOptimizationOutcome) -> IlpSolution {
    match result {
        IlpOptimizationOutcome::Solved { solution, .. } => solution,
        other => panic!("{other:?}"),
    }
}
#[test]
fn ilp_budget_controls_transitions_without_changing_cost_reference() {
    let mut i = input();
    i.settings.budget_basis_points = 0;
    let low = solved(run(i.clone()));
    assert_eq!(
        (low.reference.cost, low.cost, low.budget, low.score_milli),
        (31, 31, 31, 2000)
    );
    i.settings.budget_basis_points = 1000;
    let high = solved(run(i));
    assert_eq!(
        (
            high.reference.cost,
            high.cost,
            high.budget,
            high.score_milli
        ),
        (31, 33, 34, 0)
    );
    assert_eq!(high.proof, IlpProof::Optimal);
}
#[test]
fn ilp_local_empty_unit_is_reported_without_partial_assignment() {
    let mut i = input();
    i.options_by_load_point.insert(2, vec![]);
    match run(i) {
        IlpOptimizationOutcome::Blocked {
            solvable_load_point_ids,
            ..
        } => assert_eq!(solvable_load_point_ids, vec![1, 3]),
        other => panic!("{other:?}"),
    }
}
#[test]
fn ilp_zero_deadline_does_not_claim_infeasibility() {
    let outcome = IlpOptimizationSession::new().run(
        IlpRunRequest {
            local_only: false,
            run_id: "test".into(),
            input: input(),
            time_limit_ms: Some(0),
        },
        &mut |_| {},
        &|| false,
    );
    assert!(matches!(
        outcome,
        IlpOptimizationOutcome::NoSolution {
            termination: IlpTermination::TimeLimit,
            ..
        }
    ));
}
#[test]
fn ilp_cancel_does_not_return_a_solution() {
    let outcome = IlpOptimizationSession::new().run(
        IlpRunRequest {
            local_only: false,
            run_id: "test".into(),
            input: input(),
            time_limit_ms: None,
        },
        &mut |_| {},
        &|| true,
    );
    assert_eq!(outcome, IlpOptimizationOutcome::Cancelled);
}

#[test]
fn ilp_contracts_multiple_location_edges_between_groups_once() {
    let mut i = input();
    i.groups = vec![
        LoadPointGroup {
            load_point_ids: vec![1, 3],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
        LoadPointGroup {
            load_point_ids: vec![2],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
    ];
    i.settings.budget_basis_points = 0;
    let s = solved(run(i));
    assert_eq!(
        (s.cost, s.score_milli, s.transitions.tip_only),
        (31, 1000, 1)
    );
    assert_eq!(
        s.assignments
            .iter()
            .find(|a| a.load_point_id == 1)
            .unwrap()
            .configuration,
        s.assignments
            .iter()
            .find(|a| a.load_point_id == 3)
            .unwrap()
            .configuration
    );
}
#[test]
fn ilp_selection_scopes_are_independent_and_exclude_outside_costs() {
    for whole in [false, true] {
        for boundary in [false, true] {
            let mut i = input();
            i.target_load_point_ids = vec![1];
            i.current_assignments =
                HashMap::from([(2, config(1000, -11_000)), (3, config(1000, -10_000))]);
            i.include_boundary_transitions = boundary;
            i.limit_scope = if whole {
                OptimizationLimitScope::WholePlan
            } else {
                OptimizationLimitScope::Target
            };
            i.settings.budget_basis_points = 0;
            let s = solved(run(i));
            assert_eq!((s.reference.cost, s.cost, s.budget), (10, 10, 10));
            assert_eq!(s.assignments.len(), 1);
            assert_eq!(s.score_milli, if boundary { 1000 } else { 0 });
            assert_eq!(s.counts.configurations, if whole { 2 } else { 1 });
        }
    }
}
#[test]
fn ilp_transition_penalty_is_additive_and_ignores_legacy_joint_weights() {
    for (size, tip, want) in [
        (1000, -10_000, 0),
        (1000, -11_000, 1000),
        (2000, -10_000, 3000),
        (2000, -11_000, 4000),
    ] {
        let mut i = input();
        i.load_points.truncate(2);
        i.groups.truncate(2);
        i.target_load_point_ids = vec![1, 2];
        i.options_by_load_point = HashMap::from([
            (1, vec![option(config(1000, -10_000))]),
            (2, vec![option(config(size, tip))]),
        ]);
        i.cost_settings.items.push(PileCostSettingsItem {
            pile_size_mm: 2000,
            shape: PileCostShape::Square,
            cost_per_m3: 1.0,
        });
        i.settings.transition_weights = IlpTransitionWeights {
            tip_only_milli: 1000,
            size_only_milli: 3000,
            legacy_both_milli: Some(500),
        };
        assert_eq!(solved(run(i.clone())).score_milli, want);
        i.settings.transition_weights = IlpTransitionWeights {
            tip_only_milli: 0,
            size_only_milli: 0,
            legacy_both_milli: None,
        };
        assert_eq!(solved(run(i)).score_milli, 0);
    }
}
#[test]
fn ilp_global_limits_propose_joint_increases_without_dropping_units() {
    let mut i = input();
    i.options_by_load_point
        .insert(2, vec![option(config(2000, -11_000))]);
    i.cost_settings.items.push(PileCostSettingsItem {
        pile_size_mm: 2000,
        shape: PileCostShape::Square,
        cost_per_m3: 1.0,
    });
    i.settings.max_pile_sizes = Some(1);
    i.settings.max_pile_tip_levels = Some(1);
    i.options_by_load_point
        .insert(1, vec![option(config(1000, -10_000))]);
    match run(i.clone()) {
        IlpOptimizationOutcome::Infeasible {
            proposal: Some(p), ..
        } => {
            assert!(p.minimality_proven);
            assert_eq!(p.increases.pile_sizes, 1);
            assert_eq!(p.increases.tip_levels, 1);
            assert_eq!(p.witness.len(), 3);
            i.settings.max_pile_sizes = Some(p.required_limits.pile_sizes);
            i.settings.max_pile_tip_levels = Some(p.required_limits.tip_levels);
            assert_eq!(solved(run(i)).assignments.len(), 3);
        }
        other => panic!("{other:?}"),
    }
}
#[test]
fn ilp_preserves_lock_filter_and_utilization_exceptions() {
    let mut i = input();
    i.target_load_point_ids = vec![1];
    i.locked_load_point_ids = vec![1];
    i.current_assignments.insert(1, config(1000, -11_000));
    i.settings.candidate_source = IlpCandidateSource::ActiveLegend;
    i.candidate_configurations = vec![config(1000, -10_000)];
    i.settings.max_utilization = 0.1;
    let s = solved(run(i.clone()));
    assert_eq!(s.cost, 11);
    i.groups = vec![
        LoadPointGroup {
            load_point_ids: vec![1, 2],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
        LoadPointGroup {
            load_point_ids: vec![3],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
    ];
    assert!(matches!(run(i), IlpOptimizationOutcome::Blocked { .. }));
}
#[test]
fn ilp_missing_analysis_or_cost_is_not_an_excludable_unit() {
    let mut i = input();
    i.options_by_load_point.remove(&2);
    for input in [i, {
        let mut i = input();
        i.cost_settings.items.clear();
        i
    }] {
        match run(input) {
            IlpOptimizationOutcome::Blocked {
                solvable_load_point_ids,
                ..
            } => assert!(solvable_load_point_ids.is_empty()),
            other => panic!("{other:?}"),
        }
    }
}
#[test]
fn ilp_reference_is_reused_for_weights_and_budget_but_not_cost_changes() {
    let mut session = IlpOptimizationSession::new();
    let mut i = input();
    for (n, expected_cost) in [(0, 31), (1, 31), (2, 62)] {
        let mut phases = vec![];
        if n == 1 {
            i.settings.budget_basis_points = 1000;
            i.settings.transition_weights.legacy_both_milli = None;
        }
        if n == 2 {
            i.cost_settings.items[0].cost_per_m3 = 2.0;
        }
        let s = solved(session.run(
            IlpRunRequest {
                local_only: false,
                run_id: n.to_string(),
                input: i.clone(),
                time_limit_ms: None,
            },
            &mut |p| phases.push(p.phase),
            &|| false,
        ));
        assert_eq!(s.reference.cost, expected_cost);
        assert_eq!(phases.contains(&IlpPhase::CostReference), n != 1);
    }
}

#[test]
fn ilp_matches_exhaustive_oracle_for_caps_budgets_and_weights() {
    use std::collections::BTreeSet;
    let catalog = [
        config(1000, -10_000),
        config(1000, -11_000),
        config(2000, -10_000),
        config(2000, -11_000),
    ];
    for seed in 0..48_u32 {
        let mut i = input();
        i.cost_settings.items.push(PileCostSettingsItem {
            pile_size_mm: 2000,
            shape: PileCostShape::Square,
            cost_per_m3: 1.0,
        });
        for id in 1..=3 {
            let mask = ((seed * 7 + id * 11) % 15) + 1;
            i.options_by_load_point.insert(
                id,
                catalog
                    .iter()
                    .enumerate()
                    .filter(|(j, _)| mask & (1 << j) != 0)
                    .map(|(_, c)| option(c.clone()))
                    .collect(),
            );
        }
        i.settings.max_pile_tip_levels = Some(1 + seed % 2);
        i.settings.max_pile_sizes = Some(1 + (seed / 2) % 2);
        i.settings.max_pile_configurations = Some(1 + seed % 3);
        i.settings.transition_weights = match seed % 3 {
            0 => IlpTransitionWeights {
                tip_only_milli: 1000,
                size_only_milli: 3000,
                legacy_both_milli: Some(500),
            },
            1 => IlpTransitionWeights {
                tip_only_milli: 0,
                size_only_milli: 0,
                legacy_both_milli: None,
            },
            _ => IlpTransitionWeights::default(),
        };
        let mut feasible = vec![];
        for a in &i.options_by_load_point[&1] {
            for b in &i.options_by_load_point[&2] {
                for c in &i.options_by_load_point[&3] {
                    let cs = [&a.configuration, &b.configuration, &c.configuration];
                    if cs
                        .iter()
                        .map(|c| c.pile_size_mm)
                        .collect::<BTreeSet<_>>()
                        .len()
                        > i.settings.max_pile_sizes.unwrap() as usize
                        || cs
                            .iter()
                            .map(|c| c.pile_tip_level_mm)
                            .collect::<BTreeSet<_>>()
                            .len()
                            > i.settings.max_pile_tip_levels.unwrap() as usize
                        || cs.iter().collect::<BTreeSet<_>>().len()
                            > i.settings.max_pile_configurations.unwrap() as usize
                    {
                        continue;
                    }
                    let cost = cs
                        .iter()
                        .map(|c| {
                            (c.pile_size_mm / 1000).pow(2) as u64
                                * (-c.pile_tip_level_mm / 1000) as u64
                        })
                        .sum::<u64>();
                    let w = &i.settings.transition_weights;
                    let score = cs
                        .windows(2)
                        .map(|p| {
                            match (
                                p[0].pile_tip_level_mm != p[1].pile_tip_level_mm,
                                p[0].pile_size_mm != p[1].pile_size_mm,
                            ) {
                                (true, true) => {
                                    u64::from(w.tip_only_milli) + u64::from(w.size_only_milli)
                                }
                                (true, false) => w.tip_only_milli as u64,
                                (false, true) => w.size_only_milli as u64,
                                _ => 0,
                            }
                        })
                        .sum::<u64>();
                    feasible.push((cost, score));
                }
            }
        }
        let mut previous = u64::MAX;
        for percent in [0, 500, 1000, 5000] {
            i.settings.budget_basis_points = percent;
            let outcome = run(i.clone());
            if feasible.is_empty() {
                assert!(
                    matches!(outcome, IlpOptimizationOutcome::Infeasible { .. }),
                    "seed {seed}: {outcome:?}"
                );
                continue;
            }
            let reference = feasible.iter().map(|p| p.0).min().unwrap();
            let budget = reference * (10000 + percent as u64) / 10000;
            let score = feasible
                .iter()
                .filter(|p| p.0 <= budget)
                .map(|p| p.1)
                .min()
                .unwrap();
            let s = solved(outcome);
            assert_eq!(
                (s.reference.cost, s.budget, s.score_milli),
                (reference, budget, score),
                "seed {seed}, budget {percent}"
            );
            assert_eq!(s.proof, IlpProof::Optimal);
            assert!(s.score_milli <= previous);
            previous = s.score_milli;
        }
    }
}

#[test]
fn ilp_exclusion_does_not_rebuild_the_gabriel_graph() {
    let mut i = input();
    i.target_load_point_ids = vec![1, 3];
    i.options_by_load_point.insert(2, vec![]);
    i.options_by_load_point
        .insert(3, vec![option(config(1000, -11_000))]);
    i.settings.budget_basis_points = 0;
    let s = solved(run(i));
    assert_eq!(s.cost, 21);
    assert_eq!(s.score_milli, 0);
}

#[test]
fn ilp_invalid_fixed_group_is_omitted_from_score_but_labels_still_count() {
    let mut i = input();
    i.target_load_point_ids = vec![1];
    i.groups = vec![
        LoadPointGroup {
            load_point_ids: vec![1],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
        LoadPointGroup {
            load_point_ids: vec![2, 3],
            origin: pile_plan_core::LoadPointGroupOrigin::Automatic,
        },
    ];
    i.current_assignments = HashMap::from([(2, config(1000, -11_000)), (3, config(1000, -10_000))]);
    i.include_boundary_transitions = true;
    i.limit_scope = OptimizationLimitScope::WholePlan;
    match run(i) {
        IlpOptimizationOutcome::Solved {
            solution,
            diagnostics,
        } => {
            assert_eq!(solution.score_milli, 0);
            assert_eq!(solution.counts.configurations, 2);
            assert!(diagnostics
                .iter()
                .any(|d| d.code == "invalid_fixed_neighbor" && !d.blocking));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn ilp_cancellation_during_solving_never_applies_an_incumbent() {
    use std::cell::Cell;
    let stop = Cell::new(false);
    let o = IlpOptimizationSession::new().run(
        IlpRunRequest {
            local_only: false,
            run_id: "cancel-in-solve".into(),
            input: input(),
            time_limit_ms: None,
        },
        &mut |p| {
            if p.phase == IlpPhase::CostReference {
                stop.set(true)
            }
        },
        &|| stop.get(),
    );
    assert_eq!(o, IlpOptimizationOutcome::Cancelled);
}

#[test]
fn ilp_permutation_of_units_and_candidates_preserves_optimum() {
    let mut i = input();
    i.settings.budget_basis_points = 1000;
    let expected = solved(run(i.clone()));
    i.load_points.reverse();
    i.groups.reverse();
    i.target_load_point_ids.reverse();
    for options in i.options_by_load_point.values_mut() {
        options.reverse();
    }
    let actual = solved(run(i));
    assert_eq!(
        (actual.reference.cost, actual.cost, actual.score_milli),
        (expected.reference.cost, expected.cost, expected.score_milli)
    );
}

#[test]
fn custom_candidates_use_only_selected_pairs_and_never_fall_back_to_all() {
    let mut i = input();
    let mut settings = serde_json::to_value(&i.settings).unwrap();
    settings["candidate_source"] = "custom".into();
    settings["custom_configurations"] = serde_json::json!([config(1000, -11_000)]);
    i.settings = serde_json::from_value(settings).unwrap();
    i.candidate_configurations = vec![config(1000, -10_000)];
    let solution = solved(run(i.clone()));
    assert!(solution
        .assignments
        .iter()
        .all(|a| a.configuration == config(1000, -11_000)));
    let mut settings = serde_json::to_value(&i.settings).unwrap();
    settings["custom_configurations"] = serde_json::json!([]);
    i.settings = serde_json::from_value(settings).unwrap();
    assert!(matches!(run(i), IlpOptimizationOutcome::Blocked { .. }));
}
