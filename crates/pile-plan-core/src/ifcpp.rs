use std::fmt;

use serde_json::Error as JsonError;

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
    let project: PilePlanProject = serde_json::from_str(input)?;
    validate_ifcpp_project(&project)?;

    Ok(project)
}

pub fn write_ifcpp_string(project: &PilePlanProject) -> Result<String, IfcppError> {
    validate_ifcpp_project(project)?;

    Ok(serde_json::to_string_pretty(project)?)
}

pub fn validate_ifcpp_project(project: &PilePlanProject) -> Result<(), IfcppError> {
    if project.schema != "IFCPP" {
        return Err(IfcppError::InvalidSchema(project.schema.clone()));
    }

    if project.schema_version != 1 {
        return Err(IfcppError::UnsupportedSchemaVersion(project.schema_version));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CptSelectionAlgorithm, CptSelectionSettings, GreedyOptimizationSettings, PileCostSettings,
        ProjectApplication, ProjectImportLogEntry, ProjectInputs, ProjectMetadata, ProjectSettings,
        ProjectUnits, ProjectUserState,
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
    fn reads_sample_project_ifcpp_fixture() {
        let project = read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp"))
            .expect("sample IFCPP fixture reads");

        assert_eq!(project.metadata.name, "Sample Project");
        assert_eq!(project.inputs.load_points.len(), 328);
        assert_eq!(project.inputs.cpts.len(), 77);
        assert_eq!(project.inputs.bearing_capacities.len(), 2340);
        assert_eq!(project.settings.pile_costs.items.len(), 10);
    }

    fn project_fixture() -> PilePlanProject {
        PilePlanProject {
            schema: "IFCPP".to_string(),
            schema_version: 1,
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
                    max_angle_degrees: 120.0,
                },
                cpt_selection_by_load_point: Default::default(),
                pile_costs: PileCostSettings {
                    schema_version: 1,
                    pile_head_level_m: 0.0,
                    items: vec![],
                },
                optimization: GreedyOptimizationSettings {
                    max_pile_sizes: 0,
                    max_pile_tip_levels: 0,
                    max_pile_configurations: 0,
                    enabled_pile_sizes: vec![],
                    enabled_pile_tip_levels: vec![],
                    baseline_pile_sizes: vec![],
                    baseline_pile_tip_levels: vec![],
                    baseline_pile_configurations: vec![],
                },
                active_pile_sizes: vec![],
                active_pile_tip_levels: vec![],
            },
            user_state: ProjectUserState {
                selected_piles: Default::default(),
                manual_cpt_selections: Default::default(),
            },
            import_log: vec![ProjectImportLogEntry {
                source_file: "created manually".to_string(),
                imported_at: None,
                sheet_name: None,
                mapped_columns: Default::default(),
                warnings: vec![],
                source_role: None,
                source_format: None,
                schema_version: None,
            }],
        }
    }
}
