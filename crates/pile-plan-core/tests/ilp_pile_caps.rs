use pile_plan_core::*;
use serde_json::{json, Value};
use std::collections::HashMap;
fn input(variable: bool, existing: bool, singleton: bool) -> IlpOptimizationInput {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut draft = ProjectDocumentDraft::from_project(&project);
    draft.inputs.load_points=serde_json::from_value(if singleton {json!([{ "id":1,"name":"a","x_mm":0.,"y_mm":0.,"design_load_kn":1200.}])}else{json!([{ "id":1,"name":"a","x_mm":0.,"y_mm":0.,"design_load_kn":700.},{ "id":2,"name":"b","x_mm":1100.,"y_mm":0.,"design_load_kn":500.}])}).unwrap();
    draft.inputs.cpts =
        serde_json::from_value(json!([{ "id":11,"name":"S","x_mm":0.,"y_mm":1000.}])).unwrap();
    draft.inputs.bearing_capacities = serde_json::from_value(
        json!([{ "cpt_id":11,"pile_tip_level_m":-18.5,"pile_size_mm":320,"frd_kn":600.}]),
    )
    .unwrap();
    draft.settings.load_point_grouping = Default::default();
    draft.settings.pile_head_level_m = Some(0.);
    draft.settings.cpt_selection_by_load_point.clear();
    draft.user_state.manual_cpt_selections = HashMap::from([(1, vec![11]), (2, vec![11])]);
    draft.user_state.pile_plans.truncate(1);
    draft.user_state.pile_plans[0].selected_piles.clear();
    draft.active_selected_piles.clear();
    let ids: Vec<_> = draft.inputs.load_points.iter().map(|p| p.id).collect();
    draft.user_state.pile_plans[0].pile_cap_proposals = if existing {
        vec![PileCapProposal {
            load_point_ids: ids.clone(),
            pile_count: 4,
            quarter_turns: 1,
            configuration: Some(PileConfigurationKey {
                pile_size_mm: 320,
                pile_tip_level_mm: -18500,
            }),
        }]
    } else {
        vec![]
    };
    let analysis = build_pile_option_analysis(
        &draft.inputs.load_points,
        &draft.inputs.cpts,
        &draft.inputs.bearing_capacities,
        |_| draft.settings.global_cpt_selection.clone(),
        &draft.user_state.manual_cpt_selections,
        false,
    )
    .unwrap();
    let mut settings = serde_json::to_value(IlpOptimizationSettings::default()).unwrap();
    settings["allow_pile_count_changes"] = variable.into();
    settings["optimize_coherence"] = false.into();
    serde_json::from_value(json!({"load_points":draft.inputs.load_points,"groups":derive_load_point_groups(&draft.inputs.load_points,&draft.settings.load_point_grouping).groups,"options_by_load_point":analysis.pile_options_by_load_point,"target_load_point_ids":ids,"current_assignments":{},"locked_load_point_ids":[],"candidate_configurations":[],"pile_head_level_m":0.,"cost_settings":draft.settings.pile_costs,"settings":settings,"limit_scope":"target","include_boundary_transitions":false,"pile_cap_context":draft})).unwrap()
}
fn run(input: IlpOptimizationInput) -> Value {
    serde_json::to_value(IlpOptimizationSession::new().run(
        IlpRunRequest {
            run_id: "caps".into(),
            local_only: false,
            input,
            time_limit_ms: None,
        },
        &mut |_| {},
        &|| false,
    ))
    .unwrap()
}

fn refresh_request(mut request: IlpOptimizationInput, total_load: f64) -> IlpOptimizationInput {
    let draft = request.pile_cap_context.as_mut().unwrap();
    let count = draft.inputs.load_points.len() as f64;
    for point in &mut draft.inputs.load_points {
        point.design_load_kn = total_load / count;
    }
    request.load_points = draft.inputs.load_points.clone();
    request.target_load_point_ids = request.load_points.iter().map(|p| p.id).collect();
    request.groups =
        derive_load_point_groups(&request.load_points, &draft.settings.load_point_grouping).groups;
    request.options_by_load_point = build_pile_option_analysis(
        &draft.inputs.load_points,
        &draft.inputs.cpts,
        &draft.inputs.bearing_capacities,
        |_| draft.settings.global_cpt_selection.clone(),
        &draft.user_state.manual_cpt_selections,
        false,
    )
    .unwrap()
    .pile_options_by_load_point;
    request
}

#[test]
fn optimizer_maximum_defaults_to_six_but_can_be_raised_to_seven() {
    let request = refresh_request(input(true, false, true), 4200.);
    assert_eq!(run(request.clone())["status"], "blocked");
    let mut value = serde_json::to_value(request).unwrap();
    value["settings"]["max_piles_per_cap"] = json!(7);
    let result = run(serde_json::from_value(value).unwrap());
    assert_eq!(result["status"], "solved", "{result}");
    assert_eq!(result["solution"]["pile_cap_proposals"][0]["pile_count"], 7);
}

#[test]
fn explicit_count_selection_excludes_five_from_the_cost_reference_and_solution() {
    let request = refresh_request(input(true, false, true), 3000.);
    assert_eq!(
        run(request.clone())["solution"]["pile_cap_proposals"][0]["pile_count"],
        5
    );
    let mut value = serde_json::to_value(request).unwrap();
    value["settings"]["allowed_pile_counts"] = json!([1, 2, 3, 4, 6]);
    let result = run(serde_json::from_value(value).unwrap());
    assert_eq!(
        result["solution"]["pile_cap_proposals"][0]["pile_count"], 6,
        "{result}"
    );
    assert_eq!(
        result["solution"]["reference"]["cost"],
        result["solution"]["cost"]
    );
}

#[test]
fn an_existing_larger_proposal_remains_available_above_the_optimizer_maximum() {
    let mut request = input(true, true, false);
    request
        .pile_cap_context
        .as_mut()
        .unwrap()
        .user_state
        .pile_plans[0]
        .pile_cap_proposals[0]
        .pile_count = 12;
    let result = run(refresh_request(request, 6600.));
    assert_eq!(result["status"], "solved", "{result}");
    assert_eq!(
        result["solution"]["pile_cap_proposals"][0]["pile_count"],
        12
    );
}

#[test]
fn locked_proposals_keep_an_explicitly_excluded_count() {
    let mut value = serde_json::to_value(input(true, true, false)).unwrap();
    value["settings"]["allowed_pile_counts"] = json!([1, 2, 3, 6]);
    value["locked_load_point_ids"] = json!([1]);
    let result = run(serde_json::from_value(value).unwrap());
    assert_eq!(result["status"], "solved", "{result}");
    assert_eq!(result["solution"]["pile_cap_proposals"][0]["pile_count"], 4);
}

#[test]
fn original_groups_above_twenty_are_preserved_and_excluded_smaller_counts_are_not_retained() {
    for (count, allowed, expected) in [
        (25, vec![1, 2, 3, 4, 6], None),
        (5, vec![1, 2, 3, 4, 6], Some(6)),
    ] {
        let mut request = input(true, false, true);
        let draft = request.pile_cap_context.as_mut().unwrap();
        let source = draft.inputs.load_points[0].clone();
        draft.inputs.load_points = (0..count)
            .map(|i| ProjectLoadPoint {
                id: i + 1,
                x_mm: f64::from(i) * 650.,
                ..source.clone()
            })
            .collect();
        draft.user_state.manual_cpt_selections = (1..=count).map(|id| (id, vec![11])).collect();
        let mut value =
            serde_json::to_value(refresh_request(request, f64::from(count) * 500.)).unwrap();
        value["settings"]["allowed_pile_counts"] = json!(allowed);
        let result = run(serde_json::from_value(value).unwrap());
        assert_eq!(result["status"], "solved", "{result}");
        if let Some(expected) = expected {
            assert_eq!(
                result["solution"]["pile_cap_proposals"][0]["pile_count"],
                expected
            );
        } else {
            assert!(result["solution"]["pile_cap_proposals"]
                .as_array()
                .is_none_or(|p| p.is_empty()));
            assert_eq!(
                result["solution"]["assignments"].as_array().unwrap().len(),
                25
            );
        }
    }
}

#[test]
fn count_settings_have_compatible_defaults_validation_and_project_roundtrips() {
    let settings = serde_json::to_value(IlpOptimizationSettings::default()).unwrap();
    assert_eq!(settings["max_piles_per_cap"], 6);
    assert_eq!(
        settings["allowed_pile_counts"],
        json!((1..=20).collect::<Vec<_>>())
    );
    let mut historical = settings.clone();
    historical
        .as_object_mut()
        .unwrap()
        .remove("max_piles_per_cap");
    historical
        .as_object_mut()
        .unwrap()
        .remove("allowed_pile_counts");
    assert_eq!(
        serde_json::from_value::<IlpOptimizationSettings>(historical).unwrap(),
        IlpOptimizationSettings::default()
    );
    for (maximum, counts) in [
        (0, vec![1]),
        (21, vec![1]),
        (6, vec![]),
        (6, vec![5, 5]),
        (6, vec![0]),
        (6, vec![7]),
    ] {
        let mut invalid = settings.clone();
        invalid["max_piles_per_cap"] = json!(maximum);
        invalid["allowed_pile_counts"] = json!(counts);
        assert!(!serde_json::from_value::<IlpOptimizationSettings>(invalid)
            .unwrap()
            .is_valid());
    }
    let mut request = input(true, false, true);
    let mut chosen = settings;
    chosen["max_piles_per_cap"] = json!(12);
    chosen["allowed_pile_counts"] = json!([1, 2, 3, 4, 6, 8, 9, 12]);
    let settings: IlpOptimizationSettings = serde_json::from_value(chosen).unwrap();
    let draft = request.pile_cap_context.as_mut().unwrap();
    draft.settings.ilp_optimization = Some(settings.clone());
    let restored = read_ifcpp_str(&write_project_document(draft.clone()).unwrap()).unwrap();
    assert_eq!(restored.settings.ilp_optimization.unwrap(), settings);
}
#[test]
fn count_changes_are_opt_in_and_singletons_can_expand() {
    assert_eq!(run(input(false, false, false))["status"], "blocked");
    for (singleton, count) in [(false, 3), (true, 2)] {
        let result = run(input(true, false, singleton));
        assert_eq!(result["status"], "solved", "{result}");
        assert_eq!(
            result["solution"]["pile_cap_proposals"][0]["pile_count"],
            count
        );
    }
}
#[test]
fn existing_counts_are_fixed_when_disabled_and_locked_caps_never_change() {
    let fixed = run(input(false, true, false));
    assert_eq!(fixed["status"], "solved", "{fixed}");
    assert_eq!(fixed["solution"]["pile_cap_proposals"][0]["pile_count"], 4);
    let variable = run(input(true, true, false));
    assert_eq!(
        variable["solution"]["pile_cap_proposals"][0]["pile_count"],
        3
    );
    let mut locked = input(true, true, false);
    locked.locked_load_point_ids = vec![1];
    let locked = run(locked);
    assert_eq!(locked["status"], "solved", "{locked}");
    assert_eq!(locked["solution"]["pile_cap_proposals"][0]["pile_count"], 4);
    assert_eq!(
        locked["solution"]["pile_cap_proposals"][0]["quarter_turns"],
        1
    );
}

#[test]
fn candidate_utilization_and_data_restrictions_apply_to_count_choices() {
    let mut value = serde_json::to_value(input(true, false, true)).unwrap();
    value["settings"]["max_utilization"] = json!(0.5);
    let result = run(serde_json::from_value(value.clone()).unwrap());
    assert_eq!(result["solution"]["pile_cap_proposals"][0]["pile_count"], 4);
    value["settings"]["candidate_source"] = json!("custom");
    value["settings"]["custom_configurations"] =
        json!([{ "pile_size_mm":450,"pile_tip_level_mm":-18500 }]);
    assert_eq!(
        run(serde_json::from_value(value).unwrap())["status"],
        "blocked"
    );
    let mut value = serde_json::to_value(input(true, false, false)).unwrap();
    value["pile_cap_context"]["user_state"]["manual_cpt_selections"]["1"] = json!([]);
    let missing = run(serde_json::from_value(value).unwrap());
    assert_eq!(missing["status"], "blocked", "{missing}");
    assert!(missing["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "missing_cpt_selection"));
}
#[test]
fn absent_context_is_rejected_for_variable_counts_and_count_opt_in_survives_save() {
    let mut request = input(true, false, true);
    request.pile_cap_context = None;
    assert_eq!(
        run(request)["diagnostics"][0]["code"],
        "missing_pile_cap_context"
    );
    let mut request = input(true, false, true);
    let mut draft = request.pile_cap_context.take().unwrap();
    draft.settings.ilp_optimization = Some(request.settings.clone());
    let restored = read_ifcpp_str(&write_project_document(draft).unwrap()).unwrap();
    assert!(
        restored
            .settings
            .ilp_optimization
            .unwrap()
            .allow_pile_count_changes
    );
}

#[test]
fn selected_targets_and_boundary_limits_keep_outside_cap_counts_fixed() {
    let mut request = input(true, false, false);
    let draft = request.pile_cap_context.as_mut().unwrap();
    draft.inputs.load_points.push(ProjectLoadPoint {
        id: 3,
        name: "outside".into(),
        x_mm: 5000.,
        y_mm: 0.,
        design_load_kn: 50.,
        tension: Default::default(),
    });
    draft.user_state.manual_cpt_selections.insert(3, vec![11]);
    draft.user_state.pile_plans[0].pile_cap_proposals = vec![PileCapProposal {
        load_point_ids: vec![3],
        pile_count: 2,
        quarter_turns: 1,
        configuration: Some(PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18500,
        }),
    }];
    request.load_points = draft.inputs.load_points.clone();
    request.groups =
        derive_load_point_groups(&request.load_points, &draft.settings.load_point_grouping).groups;
    request.options_by_load_point = build_pile_option_analysis(
        &draft.inputs.load_points,
        &draft.inputs.cpts,
        &draft.inputs.bearing_capacities,
        |_| draft.settings.global_cpt_selection.clone(),
        &draft.user_state.manual_cpt_selections,
        false,
    )
    .unwrap()
    .pile_options_by_load_point;
    request.target_load_point_ids = vec![1];
    request.include_boundary_transitions = true;
    request.limit_scope = OptimizationLimitScope::WholePlan;
    request.settings.optimize_coherence = true;
    request.settings.max_pile_configurations = Some(1);
    let result = run(request.clone());
    assert_eq!(result["status"], "solved", "{result}");
    assert_eq!(
        result["solution"]["assignments"].as_array().unwrap().len(),
        2
    );
    assert_eq!(
        result["solution"]["pile_cap_proposals"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        result["solution"]["pile_cap_proposals"][0]["load_point_ids"],
        json!([1, 2])
    );
    request.target_load_point_ids = vec![1, 3];
    request.settings.skip_unsolvable_units = true;
    request
        .pile_cap_context
        .as_mut()
        .unwrap()
        .user_state
        .manual_cpt_selections
        .insert(1, vec![]);
    request.settings.skip_unsolvable_units = false;
    let blocked = run(request.clone());
    assert_eq!(blocked["solvable_load_point_ids"], json!([3]));
    request.settings.skip_unsolvable_units = true;
    let skipped = run(request);
    assert_eq!(skipped["status"], "solved", "{skipped}");
    assert_eq!(
        skipped["solution"]["assignments"].as_array().unwrap().len(),
        1
    );
    assert_eq!(skipped["solution"]["assignments"][0]["load_point_id"], 3);
}

fn count_neighbor_input(weight: u32, budget: u32) -> IlpOptimizationInput {
    let mut request = input(true, false, true);
    let draft = request.pile_cap_context.as_mut().unwrap();
    draft.inputs.load_points.push(ProjectLoadPoint {
        id: 2,
        name: "neighbor".into(),
        x_mm: 5000.,
        y_mm: 0.,
        design_load_kn: 600.,
        tension: Default::default(),
    });
    draft.user_state.manual_cpt_selections.insert(2, vec![11]);
    request.load_points = draft.inputs.load_points.clone();
    request.groups =
        derive_load_point_groups(&request.load_points, &draft.settings.load_point_grouping).groups;
    request.options_by_load_point = build_pile_option_analysis(
        &draft.inputs.load_points,
        &draft.inputs.cpts,
        &draft.inputs.bearing_capacities,
        |_| draft.settings.global_cpt_selection.clone(),
        &draft.user_state.manual_cpt_selections,
        false,
    )
    .unwrap()
    .pile_options_by_load_point;
    request.target_load_point_ids = vec![1, 2];
    request.settings.optimize_coherence = true;
    request.settings.budget_basis_points = budget;
    let mut settings = serde_json::to_value(&request.settings).unwrap();
    settings["transition_weights"] =
        json!({"tip_only_milli":0,"size_only_milli":0,"pile_count_milli":weight});
    request.settings = serde_json::from_value(settings).unwrap();
    request
}
#[test]
fn neighboring_count_weight_can_spend_budget_on_equal_counts_without_changing_reference() {
    let zero = run(count_neighbor_input(0, 4000));
    assert_eq!(zero["status"], "solved", "{zero}");
    let weighted = run(count_neighbor_input(1000, 4000));
    assert_eq!(weighted["status"], "solved", "{weighted}");
    assert_eq!(
        weighted["solution"]["reference"]["cost"],
        zero["solution"]["cost"]
    );
    assert_eq!(
        weighted["solution"]["pile_cap_proposals"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(weighted["solution"]["pile_cap_proposals"]
        .as_array()
        .unwrap()
        .iter()
        .all(|p| p["pile_count"] == 2));
    assert!(
        weighted["solution"]["cost"].as_u64().unwrap() > zero["solution"]["cost"].as_u64().unwrap()
    );
    assert_eq!(weighted["solution"]["score_milli"], 0);
    let limited = run(count_neighbor_input(1000, 0));
    assert_eq!(limited["solution"]["cost"], zero["solution"]["cost"]);
    assert_eq!(limited["solution"]["score_milli"], 1000);
    assert_eq!(limited["solution"]["transitions"]["pile_count"], 1);
}

#[test]
fn count_weight_uses_actual_fixed_boundary_counts_and_respects_locks() {
    let mut request = count_neighbor_input(1250, 10000);
    let configuration = PileConfigurationKey {
        pile_size_mm: 320,
        pile_tip_level_mm: -18500,
    };
    request
        .pile_cap_context
        .as_mut()
        .unwrap()
        .user_state
        .pile_plans[0]
        .pile_cap_proposals = vec![PileCapProposal {
        load_point_ids: vec![1],
        pile_count: 2,
        quarter_turns: 0,
        configuration: Some(configuration.clone()),
    }];
    request.target_load_point_ids = vec![2];
    request.include_boundary_transitions = true;
    let aligned = run(request.clone());
    assert_eq!(
        aligned["solution"]["pile_cap_proposals"][0]["pile_count"],
        2
    );
    assert_eq!(aligned["solution"]["score_milli"], 0);
    request.locked_load_point_ids = vec![2];
    request.current_assignments.insert(2, configuration.clone());
    request
        .pile_cap_context
        .as_mut()
        .unwrap()
        .active_selected_piles
        .insert(2, configuration);
    let locked = run(request.clone());
    assert_eq!(locked["status"], "solved", "{locked}");
    assert_eq!(locked["solution"]["score_milli"], 1250);
    assert_eq!(locked["solution"]["transitions"]["pile_count"], 1);
    request.include_boundary_transitions = false;
    assert_eq!(run(request)["solution"]["score_milli"], 0);
}
#[test]
fn count_objective_solver_can_improve_beyond_single_unit_local_moves() {
    let mut request = count_neighbor_input(1000, 5000);
    let draft = request.pile_cap_context.as_mut().unwrap();
    draft.inputs.load_points.push(ProjectLoadPoint {
        id: 3,
        name: "third".into(),
        x_mm: 10000.,
        y_mm: 0.,
        design_load_kn: 1800.,
        tension: Default::default(),
    });
    draft.user_state.manual_cpt_selections.insert(3, vec![11]);
    request.load_points = draft.inputs.load_points.clone();
    request.groups =
        derive_load_point_groups(&request.load_points, &draft.settings.load_point_grouping).groups;
    request.options_by_load_point = build_pile_option_analysis(
        &draft.inputs.load_points,
        &draft.inputs.cpts,
        &draft.inputs.bearing_capacities,
        |_| draft.settings.global_cpt_selection.clone(),
        &draft.user_state.manual_cpt_selections,
        false,
    )
    .unwrap()
    .pile_options_by_load_point;
    request.target_load_point_ids = vec![1, 2, 3];
    let local = IlpOptimizationSession::new().run(
        IlpRunRequest {
            run_id: "local-count".into(),
            input: request.clone(),
            local_only: true,
            time_limit_ms: None,
        },
        &mut |_| {},
        &|| false,
    );
    let local = serde_json::to_value(local).unwrap();
    assert_eq!(local["solution"]["score_milli"], 1000);
    let global = run(request);
    assert_eq!(global["solution"]["score_milli"], 0, "{global}");
    assert_eq!(
        global["solution"]["pile_cap_proposals"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert!(global["solution"]["pile_cap_proposals"]
        .as_array()
        .unwrap()
        .iter()
        .all(|p| p["pile_count"] == 3));
    assert_eq!(global["solution"]["proof"], "optimal");
}
#[test]
fn older_weight_and_result_metadata_defaults_to_no_count_penalty() {
    let weights: IlpTransitionWeights =
        serde_json::from_value(json!({"tip_only_milli":1000,"size_only_milli":1000})).unwrap();
    assert_eq!(weights.pile_count_milli, 0);
    let transitions: IlpTransitionCounts =
        serde_json::from_value(json!({"tip_only":1,"size_only":0,"both":0})).unwrap();
    assert_eq!(transitions.pile_count, 0);
    let mut request = count_neighbor_input(2750, 4000);
    let mut draft = request.pile_cap_context.take().unwrap();
    draft.settings.ilp_optimization = Some(request.settings);
    let restored = read_ifcpp_str(&write_project_document(draft).unwrap()).unwrap();
    assert_eq!(
        restored
            .settings
            .ilp_optimization
            .unwrap()
            .transition_weights
            .pile_count_milli,
        2750
    );
}

#[test]
fn optimizer_uses_the_candidate_count_advice_with_general_values_as_background(){
 let mut request=input(true,false,false);
 request.settings.allowed_pile_counts=vec![2,3];
 let draft=request.pile_cap_context.as_mut().unwrap();
 let base=draft.inputs.bearing_capacities[0].clone();
 for (count,resistance) in [(2,300.),(3,500.)]{let mut row=base.clone();row.pile_count=Some(count);row.frd_kn=resistance;draft.inputs.bearing_capacities.push(row);}
 let result=run(request);
 assert_eq!(result["solution"]["pile_cap_proposals"][0]["pile_count"],3,"{result}");
}
