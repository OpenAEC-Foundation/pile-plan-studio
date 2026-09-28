use pile_plan_core::{
    evaluate_cpt_settings_edit, evaluate_load_point_grouping_settings,
    evaluate_pile_cost_catalog_edit, CptSelectionAlgorithm, CptSelectionSettings,
    CptSettingsEditInput, CptSettingsEditResult, CptSettingsLoadPointChange, CptSettingsPatch,
    LoadPointGroupingSettings, LoadPointGroupingSettingsEditInput,
    LoadPointGroupingSettingsEditResult, PileCostCatalogAction, PileCostCatalogEditInput,
    PileCostCatalogEditResult, PileCostSettings, PileCostSettingsItem, PileCostShape,
    ProjectLoadPoint,
};

fn settings() -> CptSelectionSettings {
    CptSelectionSettings {
        algorithm: CptSelectionAlgorithm::Quadrants,
        max_distance_m: 25.0,
        monopoly_distance_m: 1.0,
        max_angle_degrees: 120.0,
    }
}

#[test]
fn cpt_settings_edit_applies_different_location_values_atomically() {
    let input = CptSettingsEditInput {
        load_point_ids: vec![1, 2],
        global_settings: settings(),
        settings_by_load_point: vec![],
        manual_cpt_ids_by_load_point: vec![],
        global_patch: None,
        overwrite_manual_selections: false,
        changes: vec![
            CptSettingsLoadPointChange {
                load_point_id: 1,
                settings: CptSettingsPatch {
                    max_distance_m: Some(18.0),
                    ..Default::default()
                },
                overwrite_manual_selections: false,
            },
            CptSettingsLoadPointChange {
                load_point_id: 2,
                settings: CptSettingsPatch {
                    max_angle_degrees: Some(90.0),
                    ..Default::default()
                },
                overwrite_manual_selections: false,
            },
        ],
    };
    let CptSettingsEditResult::Applied {
        settings_by_load_point,
        changed_load_point_ids,
        ..
    } = evaluate_cpt_settings_edit(&input)
    else {
        panic!("expected applied");
    };
    assert_eq!(changed_load_point_ids, vec![1, 2]);
    assert_eq!(settings_by_load_point[0].settings.max_distance_m, 18.0);
    assert_eq!(settings_by_load_point[1].settings.max_angle_degrees, 90.0);
}

#[test]
fn cpt_settings_edit_rejects_one_invalid_member_without_a_partial_result() {
    let input = CptSettingsEditInput {
        load_point_ids: vec![1, 2],
        global_settings: settings(),
        settings_by_load_point: vec![],
        manual_cpt_ids_by_load_point: vec![],
        global_patch: None,
        overwrite_manual_selections: false,
        changes: vec![
            CptSettingsLoadPointChange {
                load_point_id: 1,
                settings: CptSettingsPatch {
                    max_distance_m: Some(18.0),
                    ..Default::default()
                },
                overwrite_manual_selections: false,
            },
            CptSettingsLoadPointChange {
                load_point_id: 2,
                settings: CptSettingsPatch {
                    max_distance_m: Some(-1.0),
                    ..Default::default()
                },
                overwrite_manual_selections: false,
            },
        ],
    };
    assert!(matches!(
        evaluate_cpt_settings_edit(&input),
        CptSettingsEditResult::Blocked { .. }
    ));
}

#[test]
fn grouping_settings_edit_derives_new_groups_and_preserves_assignments_outside_core() {
    let points = [0.0, 1_000.0, 3_000.0]
        .into_iter()
        .enumerate()
        .map(|(index, x_mm)| ProjectLoadPoint {
            id: index as u32 + 1,
            name: format!("P{index}"),
            x_mm,
            y_mm: 0.0,
            design_load_kn: 500.0,
        })
        .collect();
    let input = LoadPointGroupingSettingsEditInput {
        load_points: points,
        settings: LoadPointGroupingSettings::default(),
        automatic: None,
        max_edge_distance_mm: Some(500.0),
    };
    let LoadPointGroupingSettingsEditResult::Applied {
        settings,
        grouping,
        changed,
    } = evaluate_load_point_grouping_settings(&input)
    else {
        panic!("expected applied");
    };
    assert!(changed);
    assert_eq!(settings.max_edge_distance_mm, 500.0);
    assert_eq!(grouping.groups.len(), 3);
}

#[test]
fn grouping_settings_edit_rejects_negative_distance() {
    let input = LoadPointGroupingSettingsEditInput {
        load_points: vec![],
        settings: LoadPointGroupingSettings::default(),
        automatic: None,
        max_edge_distance_mm: Some(-1.0),
    };
    assert!(matches!(
        evaluate_load_point_grouping_settings(&input),
        LoadPointGroupingSettingsEditResult::Blocked { .. }
    ));
}

fn catalog() -> PileCostSettings {
    PileCostSettings {
        schema_version: 1,
        items: vec![
            PileCostSettingsItem {
                pile_size_mm: 290,
                shape: PileCostShape::Round,
                cost_per_m3: 210.0,
            },
            PileCostSettingsItem {
                pile_size_mm: 320,
                shape: PileCostShape::Square,
                cost_per_m3: 230.0,
            },
        ],
    }
}

#[test]
fn cost_catalog_mixed_batch_is_atomic() {
    let input = PileCostCatalogEditInput {
        settings: catalog(),
        used_pile_sizes_mm: vec![290],
        actions: vec![
            PileCostCatalogAction::Update {
                pile_size_mm: 290,
                shape: None,
                cost_per_m3: Some(245.0),
            },
            PileCostCatalogAction::Remove { pile_size_mm: 320 },
            PileCostCatalogAction::Add {
                item: PileCostSettingsItem {
                    pile_size_mm: 350,
                    shape: PileCostShape::Round,
                    cost_per_m3: 200.0,
                },
            },
        ],
    };
    let PileCostCatalogEditResult::Applied {
        settings, changed, ..
    } = evaluate_pile_cost_catalog_edit(&input)
    else {
        panic!("expected applied");
    };
    assert!(changed);
    assert_eq!(settings.items.len(), 2);
    assert_eq!(settings.items[0].cost_per_m3, 245.0);
    assert_eq!(input.settings, catalog());
}

#[test]
fn cost_catalog_rejects_used_size_removal_without_partial_change() {
    let input = PileCostCatalogEditInput {
        settings: catalog(),
        used_pile_sizes_mm: vec![290],
        actions: vec![
            PileCostCatalogAction::Update {
                pile_size_mm: 320,
                shape: None,
                cost_per_m3: Some(400.0),
            },
            PileCostCatalogAction::Remove { pile_size_mm: 290 },
        ],
    };
    assert!(matches!(
        evaluate_pile_cost_catalog_edit(&input),
        PileCostCatalogEditResult::Blocked { .. }
    ));
    assert_eq!(input.settings, catalog());
}

#[test]
fn cost_catalog_noop_preserves_existing_row_order() {
    let mut original = catalog();
    original.items.reverse();
    let input = PileCostCatalogEditInput {
        settings: original.clone(),
        used_pile_sizes_mm: vec![],
        actions: vec![PileCostCatalogAction::Update {
            pile_size_mm: 290,
            shape: None,
            cost_per_m3: Some(210.0),
        }],
    };
    let PileCostCatalogEditResult::Applied {
        settings, changed, ..
    } = evaluate_pile_cost_catalog_edit(&input)
    else {
        panic!("expected applied");
    };
    assert!(!changed);
    assert_eq!(settings, original);
}
