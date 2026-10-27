use pile_plan_core::{
    evaluate_pile_cap_proposals, pile_cap_pattern, PileCapProposal, PileCapProposalRequest,
    ProjectDocumentDraft,
};
use pile_plan_core::{read_ifcpp_str, write_ifcpp_string};
use serde_json::{json, Value};

fn request() -> PileCapProposalRequest {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut draft = ProjectDocumentDraft::from_project(&project);
    draft.inputs.load_points = serde_json::from_value(json!([
        {"id":1,"name":"a","x_mm":0.0,"y_mm":0.0,"design_load_kn":700.0},
        {"id":2,"name":"b","x_mm":1100.0,"y_mm":0.0,"design_load_kn":500.0}
    ]))
    .unwrap();
    draft.inputs.cpts = serde_json::from_value(json!([
        {"id":11,"name":"S11","x_mm":0.0,"y_mm":1000.0},
        {"id":12,"name":"S12","x_mm":1100.0,"y_mm":1000.0}
    ]))
    .unwrap();
    draft.inputs.bearing_capacities = serde_json::from_value(json!([
        {"cpt_id":11,"pile_tip_level_m":-18.5,"pile_size_mm":320,"frd_kn":700.0},
        {"cpt_id":12,"pile_tip_level_m":-18.5,"pile_size_mm":320,"frd_kn":600.0}
    ]))
    .unwrap();
    draft.settings.load_point_grouping = Default::default();
    draft.settings.pile_head_level_m = Some(0.0);
    draft.settings.cpt_selection_by_load_point.clear();
    draft.user_state.manual_cpt_selections =
        std::collections::HashMap::from([(1, vec![11]), (2, vec![12])]);
    draft.user_state.pile_plans.truncate(1);
    draft.user_state.pile_plans[0].pile_cap_proposals = vec![PileCapProposal {
        load_point_ids: vec![1, 2],
        pile_count: 3,
        quarter_turns: 0,
        configuration: Some(pile_plan_core::PileConfigurationKey {
            pile_size_mm: 320,
            pile_tip_level_mm: -18500,
        }),
    }];
    PileCapProposalRequest { draft, edit: None }
}

#[test]
fn conserves_force_uses_union_cpts_and_centers_the_pattern() {
    let result = evaluate_pile_cap_proposals(request()).unwrap();
    let preview = &result.plans[0].previews[0];
    assert_eq!(preview.status, "active");
    assert_eq!(preview.total_load_kn, Some(1200.0));
    assert_eq!(preview.load_per_pile_kn, Some(400.0));
    assert_eq!(preview.cpt_ids, vec![11, 12]);
    assert_eq!(preview.options[0].option.governing_frd_kn, Some(600.0));
    assert!((preview.options[0].option.utilization.unwrap() - 2.0 / 3.0).abs() < 1e-12);
    assert_eq!(
        preview.positions.iter().map(|p| p.x_mm).sum::<f64>() / 3.0,
        550.0
    );
    assert_eq!(result.plans[0].pile_count, 3);
    assert_eq!(
        result.plans[0].total_cost,
        preview.options[0].total_cost.unwrap()
    );
}

#[test]
fn empty_source_selection_is_not_masked_by_the_other_member() {
    let mut input = request();
    input
        .draft
        .user_state
        .manual_cpt_selections
        .insert(2, vec![]);
    let result = evaluate_pile_cap_proposals(input).unwrap();
    let preview = &result.plans[0].previews[0];
    assert_eq!(preview.status, "missing_cpt_selection");
    assert_eq!(preview.missing_selection_load_point_ids, vec![2]);
    assert!(preview.options.is_empty());
    assert_eq!(result.plans[0].missing_cost_count, 3);
}

#[test]
fn changed_group_is_retained_but_inactive_and_an_edit_cannot_retarget_it() {
    let mut input = request();
    input.draft.settings.load_point_grouping.automatic = false;
    let result = evaluate_pile_cap_proposals(input.clone()).unwrap();
    assert_eq!(result.plans[0].previews[0].status, "group_changed");
    assert_eq!(result.plans[0].proposals.len(), 1);
    assert_eq!(result.plans[0].pile_count, 2);
    input.edit = Some(pile_plan_core::PileCapProposalEdit {
        plan_id: input.draft.user_state.pile_plans[0].id.clone(),
        proposal: input.draft.user_state.pile_plans[0].pile_cap_proposals[0].clone(),
        remove: false,
    });
    assert!(evaluate_pile_cap_proposals(input).is_err());
}

#[test]
fn all_patterns_are_centered_and_five_is_staggered_three_plus_two() {
    for n in 1..=20 {
        for turn in 0..4 {
            let points = pile_cap_pattern(n, turn);
            assert_eq!(points.len(), n as usize);
            assert!(points.iter().map(|p| p.x_mm).sum::<f64>().abs() < 1e-12);
            assert!(points.iter().map(|p| p.y_mm).sum::<f64>().abs() < 1e-12);
            for (index, point) in points.iter().enumerate() {
                assert!(points[..index].iter().all(|other| other != point));
            }
        }
    }
    let five = pile_cap_pattern(5, 0);
    assert_eq!(five.iter().filter(|p| p.y_mm < 0.0).count(), 3);
    assert_eq!(
        five.iter()
            .filter(|p| p.y_mm > 0.0)
            .map(|p| p.x_mm)
            .collect::<Vec<_>>(),
        vec![-0.5, 0.5]
    );
    let two = pile_cap_pattern(2, 1);
    assert_eq!(two[0].x_mm, 0.0);
    assert_eq!(two[0].y_mm, -0.5);
}

#[test]
fn twenty_pile_proposals_are_evaluated_and_persisted_but_twenty_one_is_rejected() {
    let mut input = request();
    input.draft.user_state.pile_plans[0].pile_cap_proposals[0].pile_count = 20;
    let result = evaluate_pile_cap_proposals(input.clone()).unwrap();
    assert_eq!(result.plans[0].previews[0].positions.len(), 20);
    assert_eq!(result.plans[0].previews[0].load_per_pile_kn, Some(60.));
    let saved = pile_plan_core::write_project_document(input.draft.clone()).unwrap();
    let project = read_ifcpp_str(&saved).unwrap();
    assert_eq!(
        project.user_state.pile_plans[0].pile_cap_proposals[0].pile_count,
        20
    );
    input.draft.user_state.pile_plans[0].pile_cap_proposals[0].pile_count = 21;
    assert!(pile_plan_core::write_project_document(input.draft).is_err());
}

#[test]
fn invalid_stored_counts_are_rejected_on_write_and_read() {
    let mut input = request();
    input.draft.user_state.pile_plans[0].pile_cap_proposals[0].pile_count = 0;
    assert!(pile_plan_core::write_project_document(input.draft.clone()).is_err());
    let value = serde_json::to_value(&input.draft.user_state.pile_plans[0]).unwrap();
    assert!(serde_json::from_value::<pile_plan_core::PilePlan>(value).is_err());
}

#[test]
fn preserves_per_plan_proposals_without_changing_source_assignments() {
    let project =
        read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
    let mut value = serde_json::to_value(&project).unwrap();
    let proposal = json!({"load_point_ids":[17,45],"pile_count":3,"quarter_turns":1,
        "configuration":{"pile_size_mm":290,"pile_tip_level_mm":-18500}});
    value["user_state"]["pile_plans"][0]["pile_cap_proposals"] = json!([proposal.clone()]);
    let mut other = value["user_state"]["pile_plans"][0].clone();
    other["id"] = json!("other-plan");
    other["pile_cap_proposals"] = json!([]);
    value["user_state"]["pile_plans"]
        .as_array_mut()
        .unwrap()
        .push(other);
    let restored = read_ifcpp_str(&value.to_string()).unwrap();
    let written: Value = serde_json::from_str(&write_ifcpp_string(&restored).unwrap()).unwrap();
    assert_eq!(
        written["user_state"]["pile_plans"][0]["pile_cap_proposals"],
        json!([proposal])
    );
    assert_eq!(
        written["user_state"]["pile_plans"][1]["pile_cap_proposals"],
        json!([])
    );
    assert_eq!(restored.inputs, project.inputs);
    assert_eq!(
        restored.user_state.pile_plans[0].selected_piles,
        project.user_state.pile_plans[0].selected_piles
    );
}

#[test]
fn validated_edits_and_refresh_produce_identical_results_and_reset_keeps_sources() {
    let input = request();
    let expected = evaluate_pile_cap_proposals(input.clone()).unwrap();
    let proposal = input.draft.user_state.pile_plans[0].pile_cap_proposals[0].clone();
    let mut edit_input = input.clone();
    edit_input.draft.user_state.pile_plans[0]
        .pile_cap_proposals
        .clear();
    edit_input.edit = Some(pile_plan_core::PileCapProposalEdit {
        plan_id: input.draft.user_state.pile_plans[0].id.clone(),
        proposal: proposal.clone(),
        remove: false,
    });
    assert_eq!(
        evaluate_pile_cap_proposals(edit_input.clone()).unwrap(),
        expected
    );
    edit_input.draft = input.draft.clone();
    edit_input.edit.as_mut().unwrap().remove = true;
    let reset = evaluate_pile_cap_proposals(edit_input).unwrap();
    assert!(reset.plans[0].proposals.is_empty());
    assert_eq!(reset.plans[0].pile_count, 2);
    assert_eq!(input.draft.inputs.load_points.len(), 2);
}
