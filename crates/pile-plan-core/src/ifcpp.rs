use std::fmt;

use serde_json::{Error as JsonError, Value};

use crate::PilePlanProject;

#[derive(Debug)]
pub enum IfcppError {
    Json(JsonError),
    InvalidSchema(String),
    UnsupportedSchemaVersion(u32),
}

impl fmt::Display for IfcppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "Invalid IFCPP JSON: {error}"),
            Self::InvalidSchema(schema) => write!(formatter, "Expected IFCPP schema, got {schema}"),
            Self::UnsupportedSchemaVersion(version) => {
                write!(formatter, "Unsupported IFCPP schema version {version}")
            }
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
    let mut value: Value = serde_json::from_str(input)?;
    migrate_legacy_project_value(&mut value);
    let mut project: PilePlanProject = serde_json::from_value(value)?;
    project.settings.viewer_utilization = project.settings.viewer_utilization.normalized();
    project.settings.optimization.max_utilization = project
        .settings
        .optimization
        .max_utilization
        .clamp(0.0, 1.0);
    validate_ifcpp_project(&project)?;

    Ok(project)
}

pub fn write_ifcpp_string(project: &PilePlanProject) -> Result<String, IfcppError> {
    let mut canonical = project.clone();
    if canonical.schema_version < 3 {
        canonical.schema_version = 3;
    }
    validate_ifcpp_project(&canonical)?;

    Ok(serde_json::to_string_pretty(&canonical)?)
}

pub fn validate_ifcpp_project(project: &PilePlanProject) -> Result<(), IfcppError> {
    if project.schema != "IFCPP" {
        return Err(IfcppError::InvalidSchema(project.schema.clone()));
    }

    if !matches!(project.schema_version, 1 | 2 | 3) {
        return Err(IfcppError::UnsupportedSchemaVersion(project.schema_version));
    }

    Ok(())
}

fn migrate_legacy_project_value(value: &mut Value) {
    let schema_version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if !matches!(schema_version, 1 | 2) {
        return;
    }

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
            "show_tip_level_regions": false
        })
    });
    value["schema_version"] = Value::from(3);
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
    fn writing_a_legacy_project_emits_schema_version_three() {
        let mut project = project_fixture();
        project.schema_version = 1;

        let json = write_ifcpp_string(&project).expect("legacy project writes canonically");
        let value: serde_json::Value = serde_json::from_str(&json).expect("written JSON parses");

        assert_eq!(value["schema_version"], 3);
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
    fn schema_two_costs_migrate_to_schema_three() {
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

        assert_eq!(project.schema_version, 3);
        assert_eq!(project.settings.pile_head_level_m, Some(-1.25));
        assert_eq!(project.settings.pile_costs.items[0].cost_per_m3, 190.0);
        assert_eq!(project.units.costs, "GBP");
        assert_eq!(project.settings.viewer.symbol_scale_percent, 100);
        assert_eq!(project.settings.viewer.foreground_layer, "load-points");
        assert!(project.settings.viewer.show_grid);
    }

    fn project_fixture() -> PilePlanProject {
        PilePlanProject {
            schema: "IFCPP".to_string(),
            schema_version: 3,
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
                    enabled_pile_sizes: vec![],
                    enabled_pile_tip_levels: vec![],
                },
                viewer_utilization: Default::default(),
                active_pile_sizes: vec![],
                active_pile_tip_levels: vec![],
                pile_legend: None,
                viewer: Default::default(),
            },
            user_state: ProjectUserState::with_default_pile_plan(
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
