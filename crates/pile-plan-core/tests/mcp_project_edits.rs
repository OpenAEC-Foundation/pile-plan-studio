use pile_plan_core::{
    evaluate_mcp_project_edit, read_project_document, CptAction, LoadPointAction, McpProjectEdit,
    McpProjectEditInput, McpProjectEditResult, ProjectDocumentDraft, ProjectLoadPoint,
};

fn draft() -> ProjectDocumentDraft {
    let document =
        read_project_document(include_str!("../../../sample_project/sample_project.ifcpp"))
            .expect("sample project is valid");
    ProjectDocumentDraft::from_project(&document.project)
}

#[test]
fn invalid_second_source_action_rejects_the_whole_batch() {
    let before = draft();
    let id = before
        .inputs
        .load_points
        .iter()
        .map(|v| v.id)
        .max()
        .unwrap()
        + 1;
    let input = McpProjectEditInput {
        draft: before.clone(),
        edit: McpProjectEdit::LoadPoints {
            actions: vec![
                LoadPointAction::Add {
                    item: ProjectLoadPoint {
                        id,
                        name: "new".into(),
                        x_mm: 2_000_000.0,
                        y_mm: 2_000_000.0,
                        design_load_kn: 100.0,
                    },
                },
                LoadPointAction::Remove { id: u32::MAX },
            ],
        },
    };
    assert!(
        matches!(evaluate_mcp_project_edit(&input), McpProjectEditResult::Blocked {
        reason, action_index: Some(1),
    } if reason == "unknown_id")
    );
    assert_eq!(input.draft, before);
}

#[test]
fn removing_one_load_point_preserves_other_plan_assignments() {
    let before = draft();
    let removed = before.inputs.load_points[0].id;
    let other = before.inputs.load_points[1].id;
    let old_plan_count = before.user_state.pile_plans.len();
    let result = evaluate_mcp_project_edit(&McpProjectEditInput {
        draft: before,
        edit: McpProjectEdit::LoadPoints {
            actions: vec![LoadPointAction::Remove { id: removed }],
        },
    });
    let McpProjectEditResult::Applied {
        changed: true,
        document,
    } = result
    else {
        panic!("expected applied");
    };
    assert_eq!(document.project.user_state.pile_plans.len(), old_plan_count);
    assert!(!document
        .project
        .inputs
        .load_points
        .iter()
        .any(|v| v.id == removed));
    assert!(document
        .project
        .inputs
        .load_points
        .iter()
        .any(|v| v.id == other));
    for plan in &document.project.user_state.pile_plans {
        assert!(!plan.selected_piles.contains_key(&removed));
        assert!(!plan.locked_load_point_ids.contains(&removed));
    }
}

#[test]
fn deleting_cpt_clears_its_advice_and_manual_references() {
    let mut before = draft();
    let id = before.inputs.cpts[0].id;
    let point_id = before.inputs.load_points[0].id;
    before
        .user_state
        .manual_cpt_selections
        .insert(point_id, vec![id]);
    let result = evaluate_mcp_project_edit(&McpProjectEditInput {
        draft: before,
        edit: McpProjectEdit::Cpts {
            actions: vec![CptAction::Remove { id }],
        },
    });
    let McpProjectEditResult::Applied { document, .. } = result else {
        panic!("expected applied");
    };
    assert!(!document.project.inputs.cpts.iter().any(|v| v.id == id));
    assert!(!document
        .project
        .inputs
        .bearing_capacities
        .iter()
        .any(|v| v.cpt_id == id));
    assert_eq!(
        document
            .project
            .user_state
            .manual_cpt_selections
            .get(&point_id),
        None
    );
}

#[test]
fn optimization_patch_is_rejected_when_invalid() {
    let before = draft();
    let mut settings = before.settings.ilp_optimization.clone().unwrap();
    settings.max_utilization = 2.0;
    assert!(
        matches!(evaluate_mcp_project_edit(&McpProjectEditInput { draft: before,
        edit: McpProjectEdit::OptimizationSettings { settings } }),
        McpProjectEditResult::Blocked { reason, .. } if reason == "invalid_optimization_settings")
    );
}
