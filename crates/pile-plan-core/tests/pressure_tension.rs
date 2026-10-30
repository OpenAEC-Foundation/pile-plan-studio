use pile_plan_core::*;
use serde_json::{json, Value};
use std::collections::HashMap;
fn analysis(tension: Value, capacities: Value, pressure: f64) -> Value {
    let point: ProjectLoadPoint = serde_json::from_value(
        json!({"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":pressure,"tension":tension}),
    )
    .unwrap();
    let cpts = vec![
        ProjectCpt {
            id: 11,
            name: "S1".into(),
            x_mm: 0.,
            y_mm: 0.,
        },
        ProjectCpt {
            id: 12,
            name: "S2".into(),
            x_mm: 1.,
            y_mm: 0.,
        },
    ];
    let advice: Vec<ProjectBearingCapacity> = serde_json::from_value(capacities).unwrap();
    serde_json::to_value(
        build_pile_option_analysis(
            &[point],
            &cpts,
            &advice,
            |_| CptSelectionSettings {
                algorithm: CptSelectionAlgorithm::Quadrants,
                max_distance_m: 100.,
                monopoly_distance_m: 1.,
                max_angle_degrees: 120.,
            },
            &HashMap::from([(1, vec![11, 12])]),
            false,
        )
        .unwrap(),
    )
    .unwrap()["pile_options_by_load_point"]["1"][0]
        .clone()
}
fn rows() -> Value {
    json!([
     {"cpt_id":11,"pile_size_mm":320,"pile_tip_level_m":-18.,"frd_kn":700.},
     {"cpt_id":12,"pile_size_mm":320,"pile_tip_level_m":-18.,"frd_kn":650.},
     {"cpt_id":11,"pile_size_mm":320,"pile_tip_level_m":-18.,"frd_kn":80.,"direction":"tension"},
     {"cpt_id":12,"pile_size_mm":320,"pile_tip_level_m":-18.,"frd_kn":120.,"direction":"tension"}
    ])
}
#[test]
fn independent_governing_cpts_and_combined_validity() {
    let o = analysis(json!({"state":"known","value_kn":90.}), rows(), 600.);
    assert_eq!(o["governing_cpt_id"], 12);
    assert_eq!(o["tension"]["governing_cpt_id"], 11);
    assert_eq!(o["tension"]["utilization"], 1.125);
    assert_eq!(o["is_option"], false);
    assert_eq!(o["compression"]["status"], "valid");
}
#[test]
fn absent_missing_and_zero_are_distinct() {
    let mut r = rows();
    r.as_array_mut().unwrap().truncate(2);
    let absent = analysis(json!({"state":"not_imported"}), r.clone(), 600.);
    assert_eq!(absent["is_option"], true);
    assert_eq!(absent["tension"]["status"], "not_assessed");
    let missing = analysis(json!({"state":"missing"}), r.clone(), 600.);
    assert_eq!(missing["is_option"], false);
    assert_eq!(missing["tension"]["status"], "missing_demand");
    let zero = analysis(json!({"state":"known","value_kn":0.}), r.clone(), 600.);
    assert_eq!(zero["is_option"], true);
    assert_eq!(zero["tension"]["status"], "no_load");
    assert_eq!(zero["tension"]["utilization"], 0.);
    let positive = analysis(json!({"state":"known","value_kn":1.}), r, 600.);
    assert_eq!(positive["tension"]["status"], "missing_capacity_data");
}
#[test]
fn old_json_defaults_preserve_unknown_tension() {
    let p: ProjectLoadPoint =
        serde_json::from_value(json!({"id":1,"name":"A","x_mm":0.,"y_mm":0.,"design_load_kn":10.}))
            .unwrap();
    assert_eq!(
        serde_json::to_value(p).unwrap()["tension"]["state"],
        "not_imported"
    );
}

fn csv(role: ImportRole, text: &str, options: ImportProfileOptions) -> ImportSource {
    ImportSource {
        source_id: None,
        advice_operation: None,
        role,
        profile: ImportProfile::StandardTable,
        profile_options: options,
        file_name: format!("{role:?}.csv"),
        format: SourceFormat::Csv,
        bytes: text.as_bytes().to_vec(),
    }
}
fn project_with_tension() -> PilePlanProject {
    import_project_from_sources(
        "Test",
        &[
            csv(
                ImportRole::LoadPoints,
                "ID,X,Y,FEd,T
1,0,0,600,90",
                serde_json::from_value(json!({"import_tension":true})).unwrap(),
            ),
            csv(
                ImportRole::Cpts,
                "ID,X,Y
11,0,0",
                Default::default(),
            ),
            csv(
                ImportRole::BearingCapacities,
                "ID,Tip,Size,FRD,T
11,-18,290,700,80
11,-18,320,700,120",
                serde_json::from_value(json!({"tension_column":5})).unwrap(),
            ),
        ],
        Some(0.),
        "EUR",
    )
    .unwrap()
}
#[test]
fn cheapest_default_respects_present_tension_and_keeps_pressure_only_projects_working() {
    let mut project = project_with_tension();
    let costs = PileCostSettings {
        schema_version: 1,
        items: [290, 320]
            .into_iter()
            .map(|pile_size_mm| PileCostSettingsItem {
                pile_size_mm,
                shape: PileCostShape::Square,
                cost_per_m3: 100.,
            })
            .collect(),
    };
    for (demand, expected_size) in [
        (TensionDemand::Known { value_kn: 90. }, Some(320)),
        (TensionDemand::Known { value_kn: 0. }, Some(290)),
        (TensionDemand::NotImported, Some(290)),
        (TensionDemand::Missing, None),
    ] {
        project.inputs.load_points[0].tension = demand;
        let analysis = build_pile_option_analysis(
            &project.inputs.load_points,
            &project.inputs.cpts,
            &project.inputs.bearing_capacities,
            |_| project.settings.global_cpt_selection.clone(),
            &HashMap::new(),
            false,
        )
        .unwrap();
        let groups = derive_load_point_groups(
            &project.inputs.load_points,
            &project.settings.load_point_grouping,
        );
        let choices = choose_default_pile_options(
            &analysis.pile_options_by_load_point,
            &groups.groups,
            0.,
            &costs,
        );
        assert_eq!(choices.get(&1).map(|key| key.pile_size_mm), expected_size);
    }
}

#[test]
fn bundled_sample_is_the_current_cheapest_combined_default() {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    assert_eq!(project.user_state.pile_plans.len(), 1);
    let analysis = build_pile_option_analysis(
        &project.inputs.load_points,
        &project.inputs.cpts,
        &project.inputs.bearing_capacities,
        |point| {
            project
                .settings
                .cpt_selection_by_load_point
                .get(&point.id)
                .cloned()
                .unwrap_or_else(|| project.settings.global_cpt_selection.clone())
        },
        &project.user_state.manual_cpt_selections,
        false,
    )
    .unwrap();
    let groups = derive_load_point_groups(
        &project.inputs.load_points,
        &project.settings.load_point_grouping,
    );
    let expected = choose_default_pile_options(
        &analysis.pile_options_by_load_point,
        &groups.groups,
        project.settings.pile_head_level_m.unwrap(),
        &project.settings.pile_costs,
    );
    let actual = project.user_state.pile_plans[0]
        .selected_piles
        .iter()
        .filter_map(|(id, choice)| choice.pile.clone().map(|pile| (*id, pile)))
        .collect::<HashMap<_, _>>();
    assert_eq!(actual, expected);
    assert_eq!(actual.len(), 303);
    for (id, key) in actual {
        let option = analysis.pile_options_by_load_point[&id]
            .iter()
            .find(|option| option.configuration == key)
            .unwrap();
        assert!(option.compression.as_ref().unwrap().passes());
        assert!(option.tension.as_ref().unwrap().passes());
    }
}

#[test]
fn optional_standard_import_and_both_advice_channels_round_trip() {
    let project = project_with_tension();
    assert_eq!(project.inputs.bearing_capacities.len(), 4);
    assert_eq!(
        serde_json::to_value(&project.inputs.load_points[0]).unwrap()["tension"]["value_kn"],
        90.
    );
    let loaded = read_ifcpp_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    assert_eq!(loaded.schema_version, 8);
    assert_eq!(loaded.inputs, project.inputs);
    let source = csv(
        ImportRole::LoadPoints,
        "ID,X,Y,FEd,T
1,0,0,600,",
        serde_json::from_value(json!({"import_tension":true})).unwrap(),
    );
    let refreshed = refresh_project_from_profiled_sources(&project, &[source]).unwrap();
    assert_eq!(
        refreshed.inputs.load_points[0].tension,
        TensionDemand::Missing
    );
    let source = csv(
        ImportRole::LoadPoints,
        "ID,X,Y,FEd,T
1,0,0,500,30",
        Default::default(),
    );
    let refreshed = refresh_project_from_profiled_sources(&project, &[source]).unwrap();
    assert_eq!(
        refreshed.inputs.load_points[0].tension,
        project.inputs.load_points[0].tension
    );
}
#[test]
fn pressure_only_optimizer_and_combined_optimizer_choose_different_piles() {
    let project = project_with_tension();
    let analysis = build_pile_option_analysis(
        &project.inputs.load_points,
        &project.inputs.cpts,
        &project.inputs.bearing_capacities,
        |_| project.settings.global_cpt_selection.clone(),
        &HashMap::new(),
        false,
    )
    .unwrap();
    let mut input = IlpOptimizationInput {
        pile_cap_context: None,
        load_points: project.inputs.load_points.clone(),
        groups: vec![LoadPointGroup {
            load_point_ids: vec![1],
            origin: LoadPointGroupOrigin::Automatic,
        }],
        options_by_load_point: analysis.pile_options_by_load_point,
        target_load_point_ids: vec![1],
        current_assignments: HashMap::new(),
        locked_load_point_ids: vec![],
        candidate_configurations: vec![],
        pile_head_level_m: Some(0.),
        cost_settings: PileCostSettings {
            schema_version: 1,
            items: vec![
                PileCostSettingsItem {
                    pile_size_mm: 290,
                    shape: PileCostShape::Square,
                    cost_per_m3: 100.,
                },
                PileCostSettingsItem {
                    pile_size_mm: 320,
                    shape: PileCostShape::Square,
                    cost_per_m3: 100.,
                },
            ],
        },
        settings: IlpOptimizationSettings {
            optimize_coherence: false,
            ..Default::default()
        },
        limit_scope: OptimizationLimitScope::Target,
        include_boundary_transitions: false,
    };
    let run = |input| {
        IlpOptimizationSession::new().run(
            IlpRunRequest {
                run_id: "test".into(),
                local_only: false,
                input,
                time_limit_ms: None,
            },
            &mut |_| {},
            &|| false,
        )
    };
    let IlpOptimizationOutcome::Solved { solution, .. } = run(input.clone()) else {
        panic!("combined must solve")
    };
    assert_eq!(solution.assignments[0].configuration.pile_size_mm, 320);
    input.settings.include_tension = false;
    let IlpOptimizationOutcome::Solved { solution, .. } = run(input.clone()) else {
        panic!("pressure-only must solve and validate")
    };
    assert_eq!(solution.assignments[0].configuration.pile_size_mm, 290);
    input.settings.include_tension = true;
    input.settings.max_utilization = 0.7;
    assert!(matches!(run(input), IlpOptimizationOutcome::Blocked { .. }));
}

#[test]
fn known_zero_compression_does_not_require_compression_advice() {
    let mut rows = rows();
    rows.as_array_mut()
        .unwrap()
        .retain(|r| r["direction"] == "tension");
    let result = analysis(json!({"state":"known","value_kn":60.}), rows, 0.);
    assert_eq!(result["is_option"], true);
    assert_eq!(result["compression"]["status"], "no_load");
    assert_eq!(result["compression"]["utilization"], 0.);
}

#[test]
fn zero_demands_have_zero_maximum_utilization_without_resistance_data() {
    let mut capacities = rows();
    capacities.as_array_mut().unwrap().truncate(2);
    let value = analysis(json!({"state":"known","value_kn":0.}), capacities, 0.);
    let option: PileConfigurationOption = serde_json::from_value(value).unwrap();
    let aggregate = aggregate_pile_options_for_load_points(&HashMap::from([
        (1, vec![option.clone()]),
        (2, vec![option]),
    ]));
    assert_eq!(
        aggregate[0].status,
        AggregatedPileConfigurationStatus::Valid
    );
    assert_eq!(aggregate[0].maximum_utilization, Some(0.));
}

#[test]
fn optimizer_scope_keeps_critical_capacity_with_its_direction() {
    let value = analysis(json!({"state":"known","value_kn":90.}), rows(), 600.);
    let mut option: PileConfigurationOption = serde_json::from_value(value).unwrap();
    option.apply_scope(true);
    assert_eq!(option.governing_cpt_id, Some(11));
    assert_eq!(option.governing_frd_kn, Some(80.));
    option.apply_scope(false);
    assert_eq!(option.governing_cpt_id, Some(12));
    assert_eq!(option.governing_frd_kn, Some(650.));
}
