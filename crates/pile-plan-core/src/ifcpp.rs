use std::fmt;

use serde_json::{Error as JsonError, Value};

#[cfg(test)]
use crate::ProjectPileTipLevelContext;
use crate::{
    validate_project_tip_levels, validate_unique_load_point_positions, DuplicateLoadPointPositions,
    InvalidProjectPileTipLevels, PilePlanProject, ValidatedIfcppProjectOutcome,
    ValidatedPilePlanProject,
};

#[derive(Debug)]
pub enum IfcppError {
    Json(JsonError),
    InvalidSchema(String),
    UnsupportedSchemaVersion(u32),
    DuplicateLoadPointPositions(DuplicateLoadPointPositions),
    InvalidPileTipLevels(InvalidProjectPileTipLevels),
}

impl fmt::Display for IfcppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "Invalid IFCPP JSON: {error}"),
            Self::InvalidSchema(schema) => write!(formatter, "Expected IFCPP schema, got {schema}"),
            Self::UnsupportedSchemaVersion(version) => {
                write!(formatter, "Unsupported IFCPP schema version {version}")
            }
            Self::DuplicateLoadPointPositions(error) => error.fmt(formatter),
            Self::InvalidPileTipLevels(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for IfcppError {}

impl From<JsonError> for IfcppError {
    fn from(error: JsonError) -> Self {
        Self::Json(error)
    }
}

pub fn read_ifcpp_str(input: &str) -> Result<PilePlanProject, IfcppError> {
    Ok(read_validated_ifcpp_str(input)?.project)
}

pub fn read_validated_ifcpp_str(input: &str) -> Result<ValidatedPilePlanProject, IfcppError> {
    let mut value: Value = serde_json::from_str(input)?;
    migrate_legacy_project_value(&mut value);
    let mut project: PilePlanProject = serde_json::from_value(value)?;
    project.settings.viewer_utilization = project.settings.viewer_utilization.normalized();
    project.settings.optimization.max_utilization = project
        .settings
        .optimization
        .max_utilization
        .clamp(0.0, 1.0);
    let tip_level_keys = validate_ifcpp_project_with_keys(&project)?;

    Ok(ValidatedPilePlanProject {
        project,
        tip_level_keys,
    })
}

pub fn read_validated_ifcpp_project_outcome(
    input: &str,
) -> Result<ValidatedIfcppProjectOutcome, IfcppError> {
    match read_validated_ifcpp_str(input) {
        Ok(validated) => Ok(ValidatedIfcppProjectOutcome::Valid {
            project: validated.project,
            keys: validated.tip_level_keys,
        }),
        Err(IfcppError::InvalidPileTipLevels(error)) => Ok(ValidatedIfcppProjectOutcome::Invalid {
            errors: error.values,
        }),
        Err(error) => Err(error),
    }
}

pub fn write_ifcpp_string(project: &PilePlanProject) -> Result<String, IfcppError> {
    let mut canonical = project.clone();
    if canonical.schema_version < 4 {
        canonical.schema_version = 4;
    }
    validate_ifcpp_project(&canonical)?;

    Ok(serde_json::to_string_pretty(&canonical)?)
}

pub fn validate_ifcpp_project(project: &PilePlanProject) -> Result<(), IfcppError> {
    validate_ifcpp_project_with_keys(project).map(|_| ())
}

fn validate_ifcpp_project_with_keys(
    project: &PilePlanProject,
) -> Result<crate::ProjectTipLevelKeys, IfcppError> {
    if project.schema != "IFCPP" {
        return Err(IfcppError::InvalidSchema(project.schema.clone()));
    }

    if !matches!(project.schema_version, 1 | 2 | 3 | 4) {
        return Err(IfcppError::UnsupportedSchemaVersion(project.schema_version));
    }

    validate_unique_load_point_positions(&project.inputs.load_points)
        .map_err(IfcppError::DuplicateLoadPointPositions)?;
    validate_project_tip_levels(project).map_err(IfcppError::InvalidPileTipLevels)
}

fn migrate_legacy_project_value(value: &mut Value) {
    let original_schema_version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if !matches!(original_schema_version, 1 | 2 | 3) {
        return;
    }

    if matches!(original_schema_version, 1 | 2) {
        let Some(settings) = value.get_mut("settings").and_then(Value::as_object_mut) else {
            return;
        };
        let legacy_head_level = settings
            .get_mut("pile_costs")
            .and_then(Value::as_object_mut)
            .and_then(|costs| {
                let head_level = costs.remove("pile_head_level_m");
                if let Some(items) = costs.get_mut("items").and_then(Value::as_array_mut) {
                    for item in items {
                        let Some(item) = item.as_object_mut() else {
                            continue;
                        };
                        if !item.contains_key("cost_per_m3") {
                            if let Some(cost) = item.remove("cost_per_m3_eur") {
                                item.insert("cost_per_m3".to_string(), cost);
                            }
                        }
                    }
                }
                head_level
            });
        if !settings.contains_key("pile_head_level_m") {
            settings.insert(
                "pile_head_level_m".to_string(),
                legacy_head_level.unwrap_or(Value::Null),
            );
        }
        settings.entry("viewer").or_insert_with(|| {
            serde_json::json!({
                "symbol_scale_percent": 100,
                "foreground_layer": "load-points",
                "show_grid": true,
                "show_tip_level_regions": true
            })
        });
    }

    migrate_legend_activation_to_schema_four(value);
}

fn migrate_legend_activation_to_schema_four(value: &mut Value) {
    let (active_pile_sizes, active_pile_tip_levels) = {
        let Some(settings) = value.get_mut("settings").and_then(Value::as_object_mut) else {
            return;
        };
        let active_pile_sizes = settings
            .remove("active_pile_sizes")
            .unwrap_or_else(|| Value::Array(Vec::new()));
        let active_pile_tip_levels = settings
            .remove("active_pile_tip_levels")
            .unwrap_or_else(|| Value::Array(Vec::new()));
        if let Some(optimization) = settings
            .get_mut("optimization")
            .and_then(Value::as_object_mut)
        {
            optimization.remove("enabled_pile_sizes");
            optimization.remove("enabled_pile_tip_levels");
            optimization.insert(
                "candidate_source".to_string(),
                Value::String("all_available".to_string()),
            );
        }
        (active_pile_sizes, active_pile_tip_levels)
    };

    let Some(user_state) = value.get_mut("user_state").and_then(Value::as_object_mut) else {
        return;
    };
    let needs_default_plan = user_state
        .get("pile_plans")
        .and_then(Value::as_array)
        .is_none_or(Vec::is_empty);
    if needs_default_plan {
        let selected_piles = user_state
            .remove("selected_piles")
            .unwrap_or_else(|| serde_json::json!({}));
        user_state.insert(
            "pile_plans".to_string(),
            serde_json::json!([{
                "id": "pile-plan-1",
                "name": "Pile plan 1",
                "selected_piles": selected_piles,
                "locked_load_point_ids": [],
                "optimization_unassigned": {}
            }]),
        );
        user_state.insert(
            "active_pile_plan_id".to_string(),
            Value::String("pile-plan-1".to_string()),
        );
    }
    if let Some(plans) = user_state
        .get_mut("pile_plans")
        .and_then(Value::as_array_mut)
    {
        for plan in plans {
            let Some(plan) = plan.as_object_mut() else {
                continue;
            };
            plan.insert("active_pile_sizes".to_string(), active_pile_sizes.clone());
            plan.insert(
                "active_pile_tip_levels".to_string(),
                active_pile_tip_levels.clone(),
            );
        }
    }
    value["schema_version"] = Value::from(4);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use crate::{
        CptSelectionAlgorithm, CptSelectionSettings, GreedyOptimizationSettings, PileCostSettings,
        PileCostSettingsItem, PileCostShape, ProjectApplication, ProjectImportLogEntry,
        ProjectInputs, ProjectMetadata, ProjectSettings, ProjectUnits, ProjectUserState,
    };

    #[test]
    fn reads_and_writes_ifcpp_project_json() {
        let project = project_fixture();
        let json = write_ifcpp_string(&project).expect("project writes");
        let parsed = read_ifcpp_str(&json).expect("project reads");

        assert_eq!(parsed, project);
        assert!(json.contains("\"schema\": \"IFCPP\""));
    }

    #[test]
    fn round_trips_load_point_grouping_settings() {
        let mut project = project_fixture();
        project.settings.load_point_grouping.automatic = false;
        project.settings.load_point_grouping.max_edge_distance_mm = 2_500.0;

        let json = write_ifcpp_string(&project).expect("project writes");
        let parsed = read_ifcpp_str(&json).expect("project reads");

        assert_eq!(
            parsed.settings.load_point_grouping,
            project.settings.load_point_grouping
        );
    }

    #[test]
    fn missing_load_point_grouping_settings_use_the_current_default() {
        let mut value = serde_json::to_value(project_fixture()).expect("fixture serializes");
        value["settings"]
            .as_object_mut()
            .expect("settings are an object")
            .remove("load_point_grouping");

        let parsed = read_ifcpp_str(&serde_json::to_string(&value).expect("JSON writes"))
            .expect("project reads");

        assert_eq!(
            parsed.settings.load_point_grouping,
            crate::LoadPointGroupingSettings::default()
        );
    }

    #[test]
    fn rejects_non_ifcpp_schema() {
        let mut project = project_fixture();
        project.schema = "IFC".to_string();
        let error = write_ifcpp_string(&project).expect_err("schema is rejected");

        assert_eq!(error.to_string(), "Expected IFCPP schema, got IFC");
    }

    #[test]
    fn rejects_unsupported_schema_version() {
        let mut project = project_fixture();
        project.schema_version = 99;
        let error = write_ifcpp_string(&project).expect_err("version is rejected");

        assert_eq!(error.to_string(), "Unsupported IFCPP schema version 99");
    }

    #[test]
    fn read_and_write_reject_duplicate_load_point_positions() {
        let mut project = project_fixture();
        project.inputs.load_points = vec![
            crate::ProjectLoadPoint {
                id: 1,
                name: "Original position".to_string(),
                x_mm: 10.0,
                y_mm: 20.0,
                design_load_kn: 100.0,
            },
            crate::ProjectLoadPoint {
                id: 99,
                name: "Duplicate position".to_string(),
                x_mm: 10.0,
                y_mm: 20.0,
                design_load_kn: 200.0,
            },
        ];

        let write_error = write_ifcpp_string(&project).expect_err("write must reject duplicates");
        assert!(matches!(
            write_error,
            IfcppError::DuplicateLoadPointPositions(_)
        ));

        let json = serde_json::to_string(&project).expect("fixture JSON writes");
        let read_error = read_ifcpp_str(&json).expect_err("read must reject duplicates");
        let IfcppError::DuplicateLoadPointPositions(duplicates) = read_error else {
            panic!("expected duplicate-position error");
        };
        assert_eq!(duplicates.positions.len(), 1);
        assert_eq!(
            duplicates.positions[0]
                .load_points
                .iter()
                .map(|member| member.id)
                .collect::<Vec<_>>(),
            vec![1, 99]
        );
    }

    #[test]
    fn read_and_write_reject_imprecise_persisted_tip_levels_with_context() {
        let mut bearing_capacity_project = project_fixture();
        bearing_capacity_project
            .inputs
            .bearing_capacities
            .push(crate::ProjectBearingCapacity {
                cpt_id: 61,
                pile_tip_level_m: -18.5004,
                pile_size_mm: 290,
                frd_kn: 700.0,
            });
        assert_invalid_tip_context(
            &bearing_capacity_project,
            ProjectPileTipLevelContext::BearingCapacity {
                index: 0,
                cpt_id: 61,
                pile_size_mm: 290,
            },
        );

        let mut activation_project = project_fixture();
        activation_project.user_state.pile_plans[0].active_pile_tip_levels = vec![-18.5004];
        assert_invalid_tip_context(
            &activation_project,
            ProjectPileTipLevelContext::PilePlanActive {
                plan_id: "pile-plan-1".to_string(),
                index: 0,
            },
        );

        let mut legend_project = project_fixture();
        legend_project.settings.pile_legend = Some(
            serde_json::from_value(serde_json::json!({
                "encoding_mode": "size-symbol-tip-color",
                "pile_sizes": [],
                "pile_tip_levels": [{
                    "value": -18.5004,
                    "symbol": { "base_shape": "circle", "fill_pattern": "full" },
                    "color": "#000000"
                }]
            }))
            .unwrap(),
        );
        assert_invalid_tip_context(
            &legend_project,
            ProjectPileTipLevelContext::Legend { index: 0 },
        );
    }

    #[test]
    fn supported_schema_versions_keep_quarter_metre_tip_levels() {
        for schema_version in 1..=4 {
            let mut project = project_fixture();
            project.schema_version = schema_version;
            project.user_state.pile_plans[0].active_pile_tip_levels = vec![-18.25];
            let mut value = serde_json::to_value(&project).unwrap();
            if schema_version < 4 {
                value["settings"]["active_pile_sizes"] = serde_json::json!([]);
                value["settings"]["active_pile_tip_levels"] = serde_json::json!([-18.25]);
            }
            let json = serde_json::to_string(&value).unwrap();
            let restored = read_ifcpp_str(&json).unwrap();

            assert_eq!(restored.schema_version, 4);
            assert_eq!(
                restored.user_state.pile_plans[0].active_pile_tip_levels,
                vec![-18.25]
            );
        }
    }

    #[test]
    fn supported_versions_produce_canonical_schema_four_semantics() {
        for schema_version in 1..=4 {
            let mut value = serde_json::to_value(project_fixture()).expect("fixture serializes");
            value["schema_version"] = serde_json::json!(schema_version);
            value["settings"]
                .as_object_mut()
                .expect("settings are an object")
                .remove("load_point_grouping");
            value["settings"]["active_pile_sizes"] = serde_json::json!([290]);
            value["settings"]["active_pile_tip_levels"] = serde_json::json!([-18.25]);
            value["user_state"]["manual_cpt_selections"] = serde_json::json!({ "1": [61] });

            let selected_piles = serde_json::json!({
                "1": {
                    "pile": {
                        "pile_size_mm": 290,
                        "pile_tip_level_m_key": -18_250
                    },
                    "external_references": []
                }
            });
            if schema_version == 1 {
                let user_state = value["user_state"]
                    .as_object_mut()
                    .expect("user state is an object");
                user_state.remove("pile_plans");
                user_state.remove("active_pile_plan_id");
                user_state.insert("selected_piles".to_string(), selected_piles);
            } else {
                value["user_state"]["pile_plans"] = serde_json::json!([{
                    "id": "basis",
                    "name": "Basis",
                    "active_pile_sizes": [290],
                    "active_pile_tip_levels": [-18.25],
                    "selected_piles": selected_piles,
                    "locked_load_point_ids": [1]
                }]);
                value["user_state"]["active_pile_plan_id"] = serde_json::json!("basis");
            }

            if schema_version <= 2 {
                let settings = value["settings"]
                    .as_object_mut()
                    .expect("settings are an object");
                settings.remove("pile_head_level_m");
                settings.remove("viewer");
                settings["pile_costs"]["pile_head_level_m"] = serde_json::json!(-1.25);
                settings["pile_costs"]["items"][0]["cost_per_m3_eur"] = serde_json::json!(225.0);
                settings["pile_costs"]["items"][0]
                    .as_object_mut()
                    .expect("cost row is an object")
                    .remove("cost_per_m3");
            } else {
                value["settings"]["pile_head_level_m"] = serde_json::json!(-1.25);
                value["settings"]["pile_costs"]["items"][0]["cost_per_m3"] =
                    serde_json::json!(225.0);
            }

            let restored = read_validated_ifcpp_str(
                &serde_json::to_string(&value).expect("legacy JSON writes"),
            )
            .expect("supported project reads")
            .project;

            assert_eq!(restored.schema_version, 4, "schema {schema_version}");
            assert_eq!(
                restored.settings.load_point_grouping,
                crate::LoadPointGroupingSettings::default(),
                "schema {schema_version}",
            );
            assert_eq!(restored.settings.pile_head_level_m, Some(-1.25));
            assert_eq!(restored.settings.pile_costs.items[0].cost_per_m3, 225.0);
            assert_eq!(restored.settings.viewer_utilization.minimum, 0.0);
            assert_eq!(restored.settings.viewer_utilization.maximum, 1.0);
            assert_eq!(restored.user_state.pile_plans.len(), 1);
            assert_eq!(
                restored.user_state.pile_plans[0].active_pile_sizes,
                vec![290]
            );
            assert_eq!(
                restored.user_state.pile_plans[0].active_pile_tip_levels,
                vec![-18.25]
            );
            assert_eq!(
                restored.user_state.pile_plans[0]
                    .selected_piles
                    .get(&1)
                    .and_then(|choice| choice.pile.as_ref())
                    .map(|pile| pile.pile_tip_level_mm),
                Some(-18_250),
            );
            assert_eq!(
                restored.user_state.manual_cpt_selections.get(&1),
                Some(&vec![61]),
            );
            assert_eq!(
                restored.user_state.pile_plans[0].locked_load_point_ids,
                if schema_version == 1 { vec![] } else { vec![1] },
            );
        }
    }

    fn assert_invalid_tip_context(
        project: &PilePlanProject,
        expected_context: ProjectPileTipLevelContext,
    ) {
        let write_error = write_ifcpp_string(project).unwrap_err();
        let IfcppError::InvalidPileTipLevels(write_values) = write_error else {
            panic!("expected invalid pile tip levels on write")
        };
        assert_eq!(write_values.values[0].context, expected_context);

        let json = serde_json::to_string(project).unwrap();
        let read_error = read_ifcpp_str(&json).unwrap_err();
        let IfcppError::InvalidPileTipLevels(read_values) = read_error else {
            panic!("expected invalid pile tip levels on read")
        };
        assert_eq!(read_values.values[0].context, expected_context);
    }

    #[test]
    fn writing_a_legacy_project_emits_schema_version_four() {
        let mut project = project_fixture();
        project.schema_version = 1;

        let json = write_ifcpp_string(&project).expect("legacy project writes canonically");
        let value: serde_json::Value = serde_json::from_str(&json).expect("written JSON parses");

        assert_eq!(value["schema_version"], 4);
        assert!(value["user_state"].get("selected_piles").is_none());
    }

    #[test]
    fn reads_sample_project_ifcpp_fixture() {
        let project = read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp"))
            .expect("sample IFCPP fixture reads");

        assert_eq!(project.metadata.name, "Sample Project");
        assert_eq!(project.inputs.load_points.len(), 328);
        assert_eq!(project.inputs.cpts.len(), 77);
        assert_eq!(project.inputs.bearing_capacities.len(), 2340);
        assert_eq!(project.settings.pile_costs.items.len(), 10);
    }

    #[test]
    fn schema_two_costs_migrate_to_schema_four() {
        let mut value = serde_json::to_value(project_fixture()).expect("fixture serializes");
        value["schema_version"] = serde_json::json!(2);
        value["units"]["costs"] = serde_json::json!("GBP");
        value["settings"]["pile_costs"]["pile_head_level_m"] = serde_json::json!(-1.25);
        value["settings"]["pile_costs"]["items"][0]["cost_per_m3_eur"] = serde_json::json!(190.0);
        value["settings"]["pile_costs"]["items"][0]
            .as_object_mut()
            .expect("cost row is object")
            .remove("cost_per_m3");
        value["settings"]
            .as_object_mut()
            .expect("settings are object")
            .remove("pile_head_level_m");
        value["settings"]
            .as_object_mut()
            .expect("settings are object")
            .remove("viewer");

        let json = serde_json::to_string(&value).expect("legacy JSON writes");
        let project = read_ifcpp_str(&json).expect("schema two migrates");

        assert_eq!(project.schema_version, 4);
        assert_eq!(project.settings.pile_head_level_m, Some(-1.25));
        assert_eq!(project.settings.pile_costs.items[0].cost_per_m3, 190.0);
        assert_eq!(project.units.costs, "GBP");
        assert_eq!(project.settings.viewer.symbol_scale_percent, 100);
        assert_eq!(project.settings.viewer.foreground_layer, "load-points");
        assert!(project.settings.viewer.show_grid);
        assert!(project.settings.viewer.show_tip_level_regions);
    }

    #[test]
    fn schema_three_activation_migrates_to_every_pile_plan() {
        let mut value = serde_json::to_value(project_fixture()).expect("fixture serializes");
        value["schema_version"] = serde_json::json!(3);
        value["settings"]["active_pile_sizes"] = serde_json::json!([290, 320]);
        value["settings"]["active_pile_tip_levels"] = serde_json::json!([-17.5, -18.0]);
        let first_plan = value["user_state"]["pile_plans"][0].clone();
        let mut second_plan = first_plan;
        second_plan["id"] = serde_json::json!("pile-plan-2");
        second_plan["name"] = serde_json::json!("Pile plan 2");
        value["user_state"]["pile_plans"] =
            serde_json::json!([value["user_state"]["pile_plans"][0].clone(), second_plan,]);

        let project = read_ifcpp_str(&serde_json::to_string(&value).expect("legacy JSON writes"))
            .expect("schema three migrates");
        let migrated = serde_json::to_value(project).expect("migrated project serializes");

        assert_eq!(migrated["schema_version"], 4);
        for plan in migrated["user_state"]["pile_plans"]
            .as_array()
            .expect("pile plans remain an array")
        {
            assert_eq!(plan["active_pile_sizes"], serde_json::json!([290, 320]));
            assert_eq!(
                plan["active_pile_tip_levels"],
                serde_json::json!([-17.5, -18.0]),
            );
        }
        assert_eq!(
            migrated["settings"]["optimization"]["candidate_source"],
            "all_available",
        );
        assert!(migrated["settings"].get("active_pile_sizes").is_none());
        assert!(migrated["settings"].get("active_pile_tip_levels").is_none());
        assert!(migrated["settings"]["optimization"]
            .get("enabled_pile_sizes")
            .is_none());
        assert!(migrated["settings"]["optimization"]
            .get("enabled_pile_tip_levels")
            .is_none());
    }

    #[test]
    fn schema_four_round_trips_distinct_pile_plan_activation() {
        let mut project = project_fixture();
        project.schema_version = 4;
        project.user_state.pile_plans[0].active_pile_sizes = vec![290];
        project.user_state.pile_plans[0].active_pile_tip_levels = vec![-18.0];
        let mut second_plan = project.user_state.pile_plans[0].clone();
        second_plan.id = "pile-plan-2".to_string();
        second_plan.name = "Pile plan 2".to_string();
        second_plan.active_pile_sizes = vec![320];
        second_plan.active_pile_tip_levels = vec![-19.0];
        project.user_state.pile_plans.push(second_plan);

        let json = write_ifcpp_string(&project).expect("schema four writes");
        let restored = read_ifcpp_str(&json).expect("schema four reads");

        assert_eq!(restored, project);
        let written: serde_json::Value = serde_json::from_str(&json).expect("JSON parses");
        assert_eq!(written["schema_version"], 4);
        assert!(written["settings"].get("active_pile_sizes").is_none());
        assert_eq!(
            written["user_state"]["pile_plans"][1]["active_pile_sizes"],
            serde_json::json!([320]),
        );
    }

    #[test]
    fn preserves_explicitly_hidden_tip_level_regions() {
        let mut project = project_fixture();
        project.settings.viewer.show_tip_level_regions = false;

        let json = write_ifcpp_string(&project).expect("project writes");
        let parsed = read_ifcpp_str(&json).expect("project reads");

        assert!(!parsed.settings.viewer.show_tip_level_regions);
    }

    fn project_fixture() -> PilePlanProject {
        PilePlanProject {
            schema: "IFCPP".to_string(),
            schema_version: 4,
            application: ProjectApplication {
                name: "Pile Plan Studio".to_string(),
                version: "0.1.0-alpha".to_string(),
            },
            metadata: ProjectMetadata {
                name: "Empty alpha project".to_string(),
                author: None,
                organization: None,
                created_at: None,
                modified_at: None,
                description: None,
                external_references: vec![],
            },
            units: ProjectUnits {
                coordinates: "mm".to_string(),
                design_loads: "kN".to_string(),
                pile_tip_levels: "m".to_string(),
                bearing_capacities: "kN".to_string(),
                costs: "EUR".to_string(),
            },
            inputs: ProjectInputs {
                load_points: vec![],
                cpts: vec![],
                bearing_capacities: vec![],
            },
            settings: ProjectSettings {
                global_cpt_selection: CptSelectionSettings {
                    algorithm: CptSelectionAlgorithm::Quadrants,
                    max_distance_m: 25.0,
                    monopoly_distance_m: 1.0,
                    max_angle_degrees: 120.0,
                },
                cpt_selection_by_load_point: Default::default(),
                load_point_grouping: Default::default(),
                pile_costs: PileCostSettings {
                    schema_version: 1,
                    items: vec![PileCostSettingsItem {
                        pile_size_mm: 290,
                        shape: PileCostShape::Round,
                        cost_per_m3: 190.0,
                    }],
                },
                pile_head_level_m: Some(0.0),
                optimization: GreedyOptimizationSettings {
                    max_pile_sizes: 0,
                    max_pile_tip_levels: 0,
                    max_pile_configurations: 0,
                    max_utilization: 1.0,
                    candidate_source: Default::default(),
                },
                viewer_utilization: Default::default(),
                pile_legend: None,
                viewer: Default::default(),
            },
            user_state: ProjectUserState::with_default_pile_plan(
                Default::default(),
                Default::default(),
                Default::default(),
                Default::default(),
            ),
            import_log: vec![ProjectImportLogEntry {
                source_file: "created manually".to_string(),
                imported_at: None,
                sheet_name: None,
                mapped_columns: Default::default(),
                warnings: vec![],
                source_role: None,
                source_format: None,
                schema_version: None,
                source_profile: None,
                profile_details: HashMap::new(),
            }],
        }
    }
}
