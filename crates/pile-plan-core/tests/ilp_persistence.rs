use pile_plan_core::{read_ifcpp_str, write_ifcpp_string};

#[test]
fn joint_weight_is_retired_for_new_runs() {
    let project = read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut json: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    json["settings"]["ilp_optimization"]["transition_weights"] = serde_json::json!({
        "tip_only_milli": 1500, "size_only_milli": 2500, "both_milli": 500
    });
    let loaded = read_ifcpp_str(&json.to_string()).unwrap();
    let saved: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&loaded).unwrap()).unwrap();
    assert_eq!(saved["settings"]["ilp_optimization"]["transition_weights"], serde_json::json!({
        "tip_only_milli": 1500, "size_only_milli": 2500
    }));
}

#[test]
fn legacy_optimizer_settings_are_read_but_no_longer_written() {
    let source = include_str!("../../../sample_project/sample_project.ifcpp");
    let mut legacy: serde_json::Value = serde_json::from_str(source).unwrap();
    legacy["settings"]["optimization"]["max_pile_sizes"] = 2.into();
    legacy["settings"]["optimization"]["max_pile_tip_levels"] = 3.into();
    let project = read_ifcpp_str(&legacy.to_string()).unwrap();
    let saved: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    assert!(saved["settings"].get("optimization").is_none());
    assert_eq!(saved["settings"]["ilp_optimization"]["max_pile_sizes"], 2);
    assert_eq!(saved["settings"]["ilp_optimization"]["max_pile_tip_levels"], 3);
    let reopened = read_ifcpp_str(&saved.to_string()).unwrap();
    assert_eq!(reopened.settings.ilp_optimization, project.settings.ilp_optimization);
    let mut with_both = saved;
    with_both["settings"]["optimization"] = serde_json::json!({
        "max_pile_sizes": 7, "max_pile_tip_levels": 9,
        "candidate_source": "active_legend", "max_utilization": 0.5,
    });
    assert_eq!(read_ifcpp_str(&with_both.to_string()).unwrap().settings.ilp_optimization,
        project.settings.ilp_optimization);
}

#[test]
fn legacy_projects_receive_independent_ilp_settings_with_five_percent_budget() {
    let source = include_str!("../../../sample_project/sample_project.ifcpp");
    for version in 1..=4 {
        let mut json: serde_json::Value = serde_json::from_str(source).unwrap();
        if version == 4 {
            json = serde_json::from_str(
                &write_ifcpp_string(&read_ifcpp_str(source).unwrap()).unwrap(),
            )
            .unwrap();
            json["settings"]
                .as_object_mut()
                .unwrap()
                .remove("ilp_optimization");
        }
        json["schema_version"] = version.into();
        json["settings"]["optimization"] = serde_json::json!({
            "max_pile_sizes": 4, "max_pile_tip_levels": 16, "max_utilization": 1.0,
        });
        let project = read_ifcpp_str(&json.to_string()).unwrap();
        let mut json: serde_json::Value =
            serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
        assert_eq!(
            json["settings"]["ilp_optimization"]["budget_basis_points"],
            500
        );
        assert_eq!(
            json["settings"]["ilp_optimization"]["max_pile_sizes"],
            4
        );
        json["settings"]["ilp_optimization"]["budget_basis_points"] = 1000.into();
        assert!(json["settings"]["ilp_optimization"]["max_pile_configurations"].is_null());
        json["settings"]["ilp_optimization"]["max_pile_configurations"] = 7.into();
        assert_eq!(
            json["settings"]["ilp_optimization"]["optimize_coherence"],
            true
        );
        json["settings"]["ilp_optimization"]
            .as_object_mut()
            .unwrap()
            .remove("optimize_coherence");
        let legacy_ilp = read_ifcpp_str(&json.to_string()).unwrap();
        assert!(
            legacy_ilp
                .settings
                .ilp_optimization
                .unwrap()
                .optimize_coherence
        );
        json["settings"]["ilp_optimization"]["optimize_coherence"] = false.into();
        assert_eq!(
            json["settings"]["ilp_optimization"]["skip_unsolvable_units"],
            false
        );
        json["settings"]["ilp_optimization"]
            .as_object_mut()
            .unwrap()
            .remove("skip_unsolvable_units");
        let old = read_ifcpp_str(&json.to_string()).unwrap();
        let old_json: serde_json::Value =
            serde_json::from_str(&write_ifcpp_string(&old).unwrap()).unwrap();
        assert_eq!(
            old_json["settings"]["ilp_optimization"]["skip_unsolvable_units"],
            false
        );
        json["settings"]["ilp_optimization"]["skip_unsolvable_units"] = true.into();
        let project = read_ifcpp_str(&json.to_string()).unwrap();
        let roundtrip: serde_json::Value =
            serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
        assert_eq!(
            roundtrip["settings"]["ilp_optimization"]["skip_unsolvable_units"],
            true
        );
        assert_eq!(
            roundtrip["settings"]["ilp_optimization"]["budget_basis_points"],
            1000
        );
        assert_eq!(
            roundtrip["settings"]["ilp_optimization"]["max_pile_configurations"],
            7
        );
        assert_eq!(
            roundtrip["settings"]["ilp_optimization"]["optimize_coherence"],
            false
        );
        assert_eq!(
            roundtrip["settings"]["optimization"],
            json["settings"]["optimization"]
        );
    }
}
#[test]
fn invalid_ilp_settings_are_rejected_instead_of_silently_reset() {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut json: serde_json::Value =
        serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    json["settings"]["ilp_optimization"] = serde_json::json!({
        "max_pile_tip_levels":null,"max_pile_sizes":0,"max_pile_configurations":null,
        "max_utilization":1.0,"candidate_source":"all_available","budget_basis_points":500,
        "transition_weights":{"tip_only_milli":1000,"size_only_milli":1000,"both_milli":2000}
    });
    assert!(read_ifcpp_str(&json.to_string()).is_err());
}

#[test]
fn plan_result_roundtrips_and_is_optional_for_legacy_plans() {
    let project = read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut json: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    let plans = json["user_state"]["pile_plans"].as_array_mut().unwrap();
    assert!(plans[0].get("ilp_result").is_none());
    let mut result = serde_json::json!({
        "solution": {"assignments": [], "cost": 22, "budget": 23,
            "reference": {"cost": 21, "proof": "optimal", "termination": "completed"},
            "counts": {"tip_levels": 1, "pile_sizes": 1, "configurations": 1},
            "transitions": {"tip_only": 3, "size_only": 2, "both": 1},
            "score_milli": 7000, "proof": "feasible", "termination": "stopped"},
        "diagnostics": [], "settings": json["settings"]["ilp_optimization"].clone(),
        "whole_plan_limits": false, "boundary_transitions": true, "local_only": false,
        "currency_code": "EUR", "basis_fingerprint": "v1:123:456"
    });
    // Historical scores retain the original non-additive joint weight.
    result["settings"]["transition_weights"]["both_milli"] = 500.into();
    result["solution"]["score_milli"] = 5500.into();
    json["user_state"]["pile_plans"][0]["ilp_result"] = result.clone();
    let loaded = read_ifcpp_str(&json.to_string()).unwrap();
    let saved: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&loaded).unwrap()).unwrap();
    assert_eq!(saved["user_state"]["pile_plans"][0]["ilp_result"], result);
}

#[test]
fn custom_ilp_candidates_roundtrip_without_legacy_settings() {
    let project = read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut json: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    json["settings"]["ilp_optimization"]["candidate_source"] = "custom".into();
    let pairs = serde_json::json!([
        {"pile_size_mm": 290, "pile_tip_level_mm": -18000},
        {"pile_size_mm": 320, "pile_tip_level_mm": -19000}
    ]);
    json["settings"]["ilp_optimization"]["custom_configurations"] = pairs.clone();
    let project = read_ifcpp_str(&json.to_string()).unwrap();
    let saved: serde_json::Value = serde_json::from_str(&write_ifcpp_string(&project).unwrap()).unwrap();
    assert_eq!(saved["settings"]["ilp_optimization"]["custom_configurations"], pairs);
    assert!(saved["settings"].get("optimization").is_none());
    json["settings"]["ilp_optimization"].as_object_mut().unwrap().remove("custom_configurations");
    json["settings"]["ilp_optimization"]["candidate_source"] = "all_available".into();
    assert!(read_ifcpp_str(&json.to_string()).is_ok());
}
