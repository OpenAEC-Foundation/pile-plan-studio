use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::import::{ImportProfile, ImportRole, SourceFormat};

use crate::analysis::{
    BearingCapacity, Cpt, CptSelectionSettings, GreedyOptimizationSettings, LoadPoint,
    PileConfigurationKey, PileCostSettings,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PilePlanProject {
    pub schema: String,
    pub schema_version: u32,
    pub application: ProjectApplication,
    pub metadata: ProjectMetadata,
    pub units: ProjectUnits,
    pub inputs: ProjectInputs,
    pub settings: ProjectSettings,
    pub user_state: ProjectUserState,
    pub import_log: Vec<ProjectImportLogEntry>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectApplication {
    pub name: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectMetadata {
    pub name: String,
    pub author: Option<String>,
    pub organization: Option<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub description: Option<String>,
    pub external_references: Vec<ExternalReference>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ExternalReference {
    pub source_file: Option<String>,
    pub global_id: Option<String>,
    pub entity: Option<String>,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectUnits {
    pub coordinates: String,
    pub design_loads: String,
    pub pile_tip_levels: String,
    pub bearing_capacities: String,
    pub costs: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectInputs {
    pub load_points: Vec<LoadPoint>,
    pub cpts: Vec<Cpt>,
    pub bearing_capacities: Vec<BearingCapacity>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectSettings {
    pub global_cpt_selection: CptSelectionSettings,
    pub cpt_selection_by_load_point: HashMap<u32, CptSelectionSettings>,
    pub pile_costs: PileCostSettings,
    pub optimization: GreedyOptimizationSettings,
    pub active_pile_sizes: Vec<u32>,
    pub active_pile_tip_levels: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectUserState {
    pub selected_piles: HashMap<u32, SelectedPileChoice>,
    pub manual_cpt_selections: HashMap<u32, Vec<u32>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SelectedPileChoice {
    pub pile: Option<PileConfigurationKey>,
    pub external_references: Vec<ExternalReference>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectImportLogEntry {
    pub source_file: String,
    pub imported_at: Option<String>,
    pub sheet_name: Option<String>,
    pub mapped_columns: HashMap<String, String>,
    pub warnings: Vec<String>,
    #[serde(default)]
    pub source_role: Option<ImportRole>,
    #[serde(default)]
    pub source_format: Option<SourceFormat>,
    #[serde(default)]
    pub schema_version: Option<String>,
    #[serde(default)]
    pub source_profile: Option<ImportProfile>,
    #[serde(default)]
    pub profile_details: HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CptSelectionAlgorithm, PileCostSettingsItem, PileCostShape};

    #[test]
    fn pile_plan_project_carries_alpha_project_state() {
        let project = sample_project();

        assert_eq!(project.schema, "IFCPP");
        assert_eq!(project.schema_version, 1);
        assert_eq!(project.inputs.load_points[0].design_load_kn, 250.0);
        assert_eq!(
            project
                .settings
                .cpt_selection_by_load_point
                .get(&1)
                .expect("per-load-point settings exist")
                .max_distance_m,
            18.0
        );
        assert_eq!(
            project.user_state.manual_cpt_selections.get(&1),
            Some(&vec![10, 11])
        );
        assert_eq!(
            project
                .user_state
                .selected_piles
                .get(&1)
                .and_then(|choice| choice.external_references[0].entity.as_deref()),
            Some("IfcPile")
        );
    }

    #[test]
    fn pile_plan_project_serializes_without_losing_state() {
        let project = sample_project();
        let json = serde_json::to_string(&project).expect("project serializes");
        let parsed: PilePlanProject = serde_json::from_str(&json).expect("project deserializes");

        assert_eq!(parsed, project);
    }

    fn sample_project() -> PilePlanProject {
        PilePlanProject {
            schema: "IFCPP".to_string(),
            schema_version: 1,
            application: ProjectApplication {
                name: "Pile Plan Studio".to_string(),
                version: "0.1.0-alpha".to_string(),
            },
            metadata: ProjectMetadata {
                name: "Alpha sample".to_string(),
                author: Some("DevAEC".to_string()),
                organization: None,
                created_at: None,
                modified_at: None,
                description: Some("Small alpha project model fixture".to_string()),
                external_references: vec![ExternalReference {
                    source_file: Some("model.ifc".to_string()),
                    global_id: Some("2Yx".to_string()),
                    entity: Some("IfcProject".to_string()),
                    description: Some("Future IFC project link".to_string()),
                }],
            },
            units: ProjectUnits {
                coordinates: "mm".to_string(),
                design_loads: "kN".to_string(),
                pile_tip_levels: "m".to_string(),
                bearing_capacities: "kN".to_string(),
                costs: "EUR".to_string(),
            },
            inputs: ProjectInputs {
                load_points: vec![LoadPoint {
                    id: 1,
                    name: "Load point 1".to_string(),
                    x_mm: 1000.0,
                    y_mm: 2000.0,
                    design_load_kn: 250.0,
                }],
                cpts: vec![Cpt {
                    id: 10,
                    name: "CPT 10".to_string(),
                    x_mm: 0.0,
                    y_mm: 0.0,
                }],
                bearing_capacities: vec![BearingCapacity {
                    cpt_id: 10,
                    pile_tip_level_m: -18.0,
                    pile_size_mm: 290,
                    frd_kn: 750.0,
                }],
            },
            settings: ProjectSettings {
                global_cpt_selection: CptSelectionSettings {
                    algorithm: CptSelectionAlgorithm::Quadrants,
                    max_distance_m: 25.0,
                    max_angle_degrees: 120.0,
                },
                cpt_selection_by_load_point: HashMap::from([(
                    1,
                    CptSelectionSettings {
                        algorithm: CptSelectionAlgorithm::MaximumAngle,
                        max_distance_m: 18.0,
                        max_angle_degrees: 100.0,
                    },
                )]),
                pile_costs: PileCostSettings {
                    schema_version: 1,
                    pile_head_level_m: 0.0,
                    items: vec![PileCostSettingsItem {
                        pile_size_mm: 290,
                        shape: PileCostShape::Round,
                        cost_per_m3_eur: 1000.0,
                    }],
                },
                optimization: GreedyOptimizationSettings {
                    max_pile_sizes: 1,
                    max_pile_tip_levels: 1,
                    max_pile_configurations: 1,
                    enabled_pile_sizes: vec![290],
                    enabled_pile_tip_levels: vec![-18.0],
                    baseline_pile_sizes: vec![],
                    baseline_pile_tip_levels: vec![],
                    baseline_pile_configurations: vec![],
                },
                active_pile_sizes: vec![290],
                active_pile_tip_levels: vec![-18.0],
            },
            user_state: ProjectUserState {
                selected_piles: HashMap::from([(
                    1,
                    SelectedPileChoice {
                        pile: Some(PileConfigurationKey {
                            pile_size_mm: 290,
                            pile_tip_level_m_key: -18000,
                        }),
                        external_references: vec![ExternalReference {
                            source_file: Some("model.ifc".to_string()),
                            global_id: Some("3Ab".to_string()),
                            entity: Some("IfcPile".to_string()),
                            description: Some("Future selected pile link".to_string()),
                        }],
                    },
                )]),
                manual_cpt_selections: HashMap::from([(1, vec![10, 11])]),
            },
            import_log: vec![ProjectImportLogEntry {
                source_file: "Draagvermogens.xlsx".to_string(),
                imported_at: None,
                sheet_name: Some("Sheet1".to_string()),
                mapped_columns: HashMap::from([("FRD".to_string(), "frd_kn".to_string())]),
                warnings: vec!["Example warning".to_string()],
                source_role: None,
                source_format: None,
                schema_version: None,
                source_profile: None,
                profile_details: HashMap::new(),
            }],
        }
    }
}
