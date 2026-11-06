use super::*;
use pile_plan_core::{IlpOptimizationSettings, IlpPhase, IlpTermination};
use serde_json::json;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

fn request(id: &str) -> IlpRunRequest {
    serde_json::from_value(json!({
        "run_id":id,"time_limit_ms":5000,"input":{
            "load_points":[{"id":1,"name":"Café Ω","x_mm":1.0000000000000002,"y_mm":0,"design_load_kn":500}],
            "groups":[{"load_point_ids":[1],"origin":"automatic"}],
            "options_by_load_point":{"1":[{
                "configuration":{"pile_size_mm":320,"pile_tip_level_mm":-18000},
                "pile_size_mm":320,"pile_tip_level_m":-18,"is_option":true,
                "governing_cpt_id":7,"governing_frd_kn":1000,"utilization":0.5,
                "missing_cpt_ids":[],"technical_status":"valid"
            }]},
            "target_load_point_ids":[1],"current_assignments":{},"locked_load_point_ids":[],
            "candidate_configurations":[{"pile_size_mm":320,"pile_tip_level_mm":-18000}],
            "pile_head_level_m":-3.5,"cost_settings":{"schema_version":2,"items":[{"pile_size_mm":320,"shape":"square","cost_per_m3":205}]},
            "settings":IlpOptimizationSettings{optimize_coherence:false,..Default::default()},
            "limit_scope":"target","include_boundary_transitions":true
        }
    })).unwrap()
}

#[test]
fn frames_preserve_f64_bits_and_optional_progress_fields() {
    let original = request("roundtrip");
    let progress: IlpProgress = serde_json::from_value(json!({
        "phase":"spatial","elapsed_ms":1,"incumbent_objective":null,"best_bound":null,"relative_gap":null
    })).unwrap();
    let event = IlpEvent::Progress {
        run_id: "roundtrip".into(),
        progress,
    };
    let mut bytes = b"test harness preamble\n".to_vec();
    protocol::write_frame(&mut bytes, &original).unwrap();
    protocol::write_frame(&mut bytes, &event).unwrap();
    let mut input = Cursor::new(bytes);
    let decoded: IlpRunRequest = protocol::read_frame(&mut input, true).unwrap();
    assert_eq!(decoded, original);
    assert_eq!(
        decoded.input.load_points[0].x_mm.to_bits(),
        original.input.load_points[0].x_mm.to_bits()
    );
    let decoded: IlpEvent = protocol::read_frame(&mut input, false).unwrap();
    assert_eq!(decoded, event);
}

#[test]
fn frames_preserve_the_full_project_context_for_pile_cap_optimization() {
    let project = pile_plan_core::read_project_document(include_str!(
        "../../../../../sample_project/sample_project.ifcpp"
    ))
    .unwrap()
    .project;
    let mut original = request("project-context");
    original.input.pile_cap_context =
        Some(pile_plan_core::ProjectDocumentDraft::from_project(&project));
    let mut bytes = Vec::new();
    protocol::write_frame(&mut bytes, &original).unwrap();
    let decoded: IlpRunRequest = protocol::read_frame(&mut Cursor::new(bytes), false).unwrap();
    assert_eq!(decoded, original);
}

#[test]
fn completed_runs_reuse_the_worker_and_return_real_core_outcomes() {
    let mut worker = NativeIlpWorker::spawn().unwrap();
    let pid = worker.child.id();
    for id in ["first", "second"] {
        let outcome = worker.run(request(id), &mut |_| {}, &|| false).unwrap();
        assert!(
            matches!(outcome, IlpOptimizationOutcome::Solved { .. }),
            "{outcome:?}"
        );
        assert!(worker.is_reusable());
        assert_eq!(worker.child.id(), pid);
    }
}

#[test]
fn stop_reaps_a_worker_that_never_checks_cancellation_before_acknowledging() {
    let mut worker = NativeIlpWorker::spawn().unwrap();
    let cancelled = AtomicBool::new(false);
    let mut stopped_at = None;
    let mut saw_valid_best = false;
    let outcome = worker
        .run(
            request("uninterruptible"),
            &mut |progress| {
                if progress.best_solution.is_some() {
                    saw_valid_best = true;
                    stopped_at = Some(Instant::now());
                    cancelled.store(true, Ordering::Relaxed);
                }
            },
            &|| cancelled.load(Ordering::Relaxed),
        )
        .unwrap();
    assert!(saw_valid_best);
    assert!(stopped_at.unwrap().elapsed() < Duration::from_millis(1500));
    assert_eq!(outcome, IlpOptimizationOutcome::Cancelled);
    assert!(
        worker.child.try_wait().unwrap().is_some(),
        "must not acknowledge while the solver is alive"
    );
    assert!(!worker.is_reusable());
    let mut next = NativeIlpWorker::spawn().unwrap();
    assert!(matches!(
        next.run(request("next"), &mut |_| {}, &|| false).unwrap(),
        IlpOptimizationOutcome::Solved { .. }
    ));
}

#[test]
fn closing_the_parent_input_exits_even_an_uninterruptible_worker() {
    let mut worker = NativeIlpWorker::spawn().unwrap();
    protocol::write_frame(worker.input.as_mut().unwrap(), &request("uninterruptible")).unwrap();
    loop {
        let event = worker
            .events
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .unwrap();
        if matches!(event, IlpEvent::Progress { progress, .. } if progress.best_solution.is_some())
        {
            break;
        }
    }
    worker.input.take();
    let deadline = Instant::now() + Duration::from_millis(1500);
    while worker.child.try_wait().unwrap().is_none() {
        assert!(
            Instant::now() < deadline,
            "orphaned optimizer after parent pipe closed"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Explicit desktop acceptance: uses an optimized application executable and an
/// external project supplied by the caller. No private project enters fixtures.
#[test]
#[ignore = "requires OPPS_TEST_INSTALLED_EXE and OPPS_TEST_PROJECT_FILE"]
fn optimized_application_stops_spatial_optimization_and_can_restart() {
    use pile_plan_core::*;
    use std::cell::Cell;

    let exe = std::env::var_os("OPPS_TEST_INSTALLED_EXE").expect("application executable");
    let path = std::env::var_os("OPPS_TEST_PROJECT_FILE").expect("acceptance project");
    let p = read_project_document(&std::fs::read_to_string(path).unwrap())
        .unwrap()
        .project;
    let groups =
        derive_load_point_groups(&p.inputs.load_points, &p.settings.load_point_grouping).groups;
    let analysis = calculate_pile_option_analysis(&PileOptionAnalysisRequest {
        load_points: p.inputs.load_points.clone(),
        cpts: p.inputs.cpts.clone(),
        bearing_capacities: p.inputs.bearing_capacities.clone(),
        global_settings: p.settings.global_cpt_selection.clone(),
        settings_by_load_point: p.settings.cpt_selection_by_load_point.clone(),
        manual_cpt_ids_by_load_point: p.user_state.manual_cpt_selections.clone(),
        include_cpt_frd_rows: false,
        grouping_settings: Some(p.settings.load_point_grouping.clone()),
        grouping_load_points: Some(p.inputs.load_points.clone()),
    })
    .unwrap();
    let plan = p
        .user_state
        .pile_plans
        .iter()
        .find(|plan| plan.id == p.user_state.active_pile_plan_id)
        .unwrap();
    let mut settings = p.settings.ilp_optimization.clone().unwrap_or_default();
    settings.skip_unsolvable_units = true;
    let candidates = plan
        .active_pile_sizes
        .iter()
        .flat_map(|size| {
            plan.active_pile_tip_levels
                .iter()
                .map(move |level| PileConfigurationKey::try_from_metres(*size, *level).unwrap())
        })
        .collect();
    let run = IlpRunRequest {
        run_id: "desktop-acceptance".into(),
        local_only: false,
        time_limit_ms: Some(60_000),
        input: IlpOptimizationInput {
            pile_cap_context: settings
                .allow_pile_count_changes
                .then(|| ProjectDocumentDraft::from_project(&p)),
            load_points: p.inputs.load_points.clone(),
            groups,
            options_by_load_point: analysis.pile_options_by_load_point,
            target_load_point_ids: p.inputs.load_points.iter().map(|point| point.id).collect(),
            current_assignments: plan
                .selected_piles
                .iter()
                .filter_map(|(id, choice)| choice.pile.as_ref().map(|key| (*id, key.clone())))
                .collect(),
            locked_load_point_ids: plan.locked_load_point_ids.clone(),
            candidate_configurations: candidates,
            pile_head_level_m: p.settings.pile_head_level_m,
            cost_settings: p.settings.pile_costs.clone(),
            settings,
            limit_scope: OptimizationLimitScope::WholePlan,
            include_boundary_transitions: true,
        },
    };
    let spawn = || {
        let mut command = Command::new(&exe);
        command.arg(WORKER_ARGUMENT);
        NativeIlpWorker::spawn_command(command).unwrap()
    };
    let mut worker = spawn();
    let started = Instant::now();
    let spatial_at = Cell::new(None::<Instant>);
    let stopped_at = Cell::new(None::<Instant>);
    let mut best = None;
    let outcome = worker
        .run(
            run,
            &mut |progress| {
                if progress.phase == IlpPhase::Spatial && progress.best_solution.is_some() {
                    if spatial_at.get().is_none() {
                        println!("spatial_best_at_ms={}", started.elapsed().as_millis());
                        spatial_at.set(Some(Instant::now()));
                    }
                    best = progress.best_solution;
                }
            },
            &|| {
                let stop = spatial_at
                    .get()
                    .is_some_and(|time| time.elapsed() >= Duration::from_secs(4))
                    || started.elapsed() >= Duration::from_secs(25);
                if stop && stopped_at.get().is_none() {
                    stopped_at.set(Some(Instant::now()));
                }
                stop
            },
        )
        .unwrap();
    assert!(best.is_some(), "must reach a validated spatial solution");
    assert!(
        matches!(outcome, IlpOptimizationOutcome::Cancelled),
        "spatial optimization must acknowledge cancellation"
    );
    let latency = stopped_at.get().unwrap().elapsed();
    println!(
        "stop_latency_ms={} child_reaped={}",
        latency.as_millis(),
        worker.child.try_wait().unwrap().is_some()
    );
    assert!(latency < Duration::from_millis(1500));
    assert!(worker.child.try_wait().unwrap().is_some());
    assert!(!worker.is_reusable());
    let mut next = spawn();
    assert!(matches!(
        next.run(request("restart"), &mut |_| {}, &|| false)
            .unwrap(),
        IlpOptimizationOutcome::Solved { .. }
    ));
    println!("restart_solved=true");
}

// Runs only in the test child, never in the delivered application. Using the
// same test executable exercises process ownership without extra dependencies.
#[test]
#[ignore]
fn worker_entrypoint() {
    if std::env::var_os("OPPS_ILP_WORKER_TEST").is_none() {
        return;
    }
    let mut session = IlpOptimizationSession::new();
    serve_with(move |request, progress| {
        if request.run_id == "uninterruptible" {
            let outcome = session.run(request, &mut |_| {}, &|| false);
            let IlpOptimizationOutcome::Solved {
                solution,
                diagnostics,
            } = outcome
            else {
                panic!("invalid fixture")
            };
            progress(serde_json::from_value(json!({
                "phase":"spatial","elapsed_ms":1,"incumbent_objective":solution.score_milli,
                "best_bound":0,"relative_gap":0,"best_solution":solution,"diagnostics":diagnostics
            })).unwrap());
            std::thread::sleep(Duration::from_secs(10));
            IlpOptimizationOutcome::NoSolution {
                phase: IlpPhase::Spatial,
                termination: IlpTermination::TimeLimit,
            }
        } else {
            session.run(request, progress, &|| false)
        }
    });
}
