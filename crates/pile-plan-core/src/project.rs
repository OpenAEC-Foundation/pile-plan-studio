use std::collections::HashMap;

use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};

use crate::import::{ImportProfile, ImportRole, SourceFormat};

use crate::analysis::{BearingCapacity, Cpt, CptSelectionSettings, LoadPoint, PileCostSettings};
use crate::greedy_optimizer::{GreedyOptimizationSettings, OptimizationUnassignedReason};
use crate::pile_configuration::PileConfigurationKey;

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
    #[serde(default)]
    pub pile_head_level_m: Option<f64>,
    pub optimization: GreedyOptimizationSettings,
    #[serde(default)]
    pub viewer_utilization: ViewerUtilizationSettings,
    #[serde(default)]
    pub pile_legend: Option<ProjectLegendSettings>,
    #[serde(default)]
    pub viewer: ProjectViewerSettings,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectViewerSettings {
    #[serde(default = "default_symbol_scale_percent")]
    pub symbol_scale_percent: u32,
    #[serde(default = "default_foreground_layer")]
    pub foreground_layer: String,
    #[serde(default = "default_true")]
    pub show_grid: bool,
    #[serde(default = "default_true")]
    pub show_tip_level_regions: bool,
}

impl Default for ProjectViewerSettings {
    fn default() -> Self {
        Self {
            symbol_scale_percent: default_symbol_scale_percent(),
            foreground_layer: default_foreground_layer(),
            show_grid: true,
            show_tip_level_regions: true,
        }
    }
}

fn default_symbol_scale_percent() -> u32 {
    100
}

fn default_foreground_layer() -> String {
    "load-points".to_string()
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectPileSymbol {
    pub base_shape: String,
    pub fill_pattern: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectLegendValueStyle {
    pub value: f64,
    pub symbol: ProjectPileSymbol,
    pub color: String,
    #[serde(default = "default_true")]
    pub symbol_automatic: bool,
    #[serde(default = "default_true")]
    pub color_automatic: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ProjectLegendSettings {
    pub encoding_mode: String,
    #[serde(default = "default_legend_color_scheme")]
    pub color_scheme: String,
    #[serde(default)]
    pub pile_sizes: Vec<ProjectLegendValueStyle>,
    #[serde(default)]
    pub pile_tip_levels: Vec<ProjectLegendValueStyle>,
}

fn default_true() -> bool {
    true
}

fn default_legend_color_scheme() -> String {
    "tableau-extended".to_string()
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ViewerUtilizationSettings {
    pub minimum: f64,
    pub maximum: f64,
}

impl Default for ViewerUtilizationSettings {
    fn default() -> Self {
        Self {
            minimum: 0.0,
            maximum: 1.0,
        }
    }
}

impl ViewerUtilizationSettings {
    pub fn normalized(&self) -> Self {
        let minimum = self.minimum.clamp(0.0, 1.0);
        let maximum = self.maximum.clamp(0.0, 1.0);

        Self {
            minimum: minimum.min(maximum),
            maximum: minimum.max(maximum),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ProjectUserState {
    pub pile_plans: Vec<PilePlan>,
    pub active_pile_plan_id: String,
    pub manual_cpt_selections: HashMap<u32, Vec<u32>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PilePlan {
    pub id: String,
    pub name: String,
    pub active_pile_sizes: Vec<u32>,
    pub active_pile_tip_levels: Vec<f64>,
    pub selected_piles: HashMap<u32, SelectedPileChoice>,
    #[serde(default)]
    pub locked_load_point_ids: Vec<u32>,
    #[serde(default, deserialize_with = "deserialize_optimization_unassigned")]
    pub optimization_unassigned: HashMap<u32, OptimizationUnassignedReason>,
}

fn deserialize_optimization_unassigned<'de, D>(
    deserializer: D,
) -> Result<HashMap<u32, OptimizationUnassignedReason>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = HashMap::<u32, String>::deserialize(deserializer)?;
    Ok(raw
        .into_iter()
        .filter_map(|(load_point_id, reason)| {
            let reason = match reason.as_str() {
                "optimization_constraints" => OptimizationUnassignedReason::OptimizationConstraints,
                "configuration_limits" => OptimizationUnassignedReason::ConfigurationLimits,
                _ => return None,
            };
            Some((load_point_id, reason))
        })
        .collect())
}

impl PilePlan {
    pub fn default_with_selected_piles(
        selected_piles: HashMap<u32, SelectedPileChoice>,
        active_pile_sizes: Vec<u32>,
        active_pile_tip_levels: Vec<f64>,
    ) -> Self {
        Self {
            id: "pile-plan-1".to_string(),
            name: "Pile plan 1".to_string(),
            active_pile_sizes,
            active_pile_tip_levels,
            selected_piles,
            locked_load_point_ids: Vec::new(),
            optimization_unassigned: HashMap::new(),
        }
    }
}

impl ProjectUserState {
    pub fn with_default_pile_plan(
        selected_piles: HashMap<u32, SelectedPileChoice>,
        manual_cpt_selections: HashMap<u32, Vec<u32>>,
        active_pile_sizes: Vec<u32>,
        active_pile_tip_levels: Vec<f64>,
    ) -> Self {
        Self {
            pile_plans: vec![PilePlan::default_with_selected_piles(
                selected_piles,
                active_pile_sizes,
                active_pile_tip_levels,
            )],
            active_pile_plan_id: "pile-plan-1".to_string(),
            manual_cpt_selections,
        }
    }

    pub fn active_pile_plan(&self) -> Option<&PilePlan> {
        self.pile_plans
            .iter()
            .find(|plan| plan.id == self.active_pile_plan_id)
    }

    pub fn active_pile_plan_mut(&mut self) -> Option<&mut PilePlan> {
        self.pile_plans
            .iter_mut()
            .find(|plan| plan.id == self.active_pile_plan_id)
    }
}

#[derive(Deserialize)]
struct ProjectUserStateWire {
    #[serde(default)]
    pile_plans: Vec<PilePlan>,
    #[serde(default)]
    active_pile_plan_id: String,
    #[serde(default)]
    selected_piles: HashMap<u32, SelectedPileChoice>,
    #[serde(default)]
    manual_cpt_selections: HashMap<u32, Vec<u32>>,
}

impl<'de> Deserialize<'de> for ProjectUserState {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let wire = ProjectUserStateWire::deserialize(deserializer)?;
        let mut pile_plans = wire.pile_plans;

        if pile_plans.is_empty() {
            pile_plans.push(PilePlan::default_with_selected_piles(
                wire.selected_piles,
                Vec::new(),
                Vec::new(),
            ));
        }

        let mut plan_ids = std::collections::HashSet::new();
        if let Some(duplicate_id) = pile_plans
            .iter()
            .map(|plan| plan.id.as_str())
            .find(|id| !plan_ids.insert(*id))
        {
            return Err(D::Error::custom(format!(
                "duplicate pile plan id '{duplicate_id}'"
            )));
        }

        let active_pile_plan_id = if pile_plans
            .iter()
            .any(|plan| plan.id == wire.active_pile_plan_id)
        {
            wire.active_pile_plan_id
        } else {
            pile_plans[0].id.clone()
        };

        Ok(Self {
            pile_plans,
            active_pile_plan_id,
            manual_cpt_selections: wire.manual_cpt_selections,
        })
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SelectedPileChoice {
    #[serde(
        serialize_with = "serialize_project_pile_configuration",
        deserialize_with = "deserialize_project_pile_configuration"
    )]
    pub pile: Option<PileConfigurationKey>,
    pub external_references: Vec<ExternalReference>,
}

#[derive(Deserialize, Serialize)]
struct LegacyProjectPileConfigurationKey {
    pile_size_mm: u32,
    pile_tip_level_m_key: i64,
}

fn serialize_project_pile_configuration<S>(
    value: &Option<PileConfigurationKey>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    value
        .as_ref()
        .map(|key| LegacyProjectPileConfigurationKey {
            pile_size_mm: key.pile_size_mm,
            pile_tip_level_m_key: key.pile_tip_level_mm,
        })
        .serialize(serializer)
}

fn deserialize_project_pile_configuration<'de, D>(
    deserializer: D,
) -> Result<Option<PileConfigurationKey>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(
        Option::<LegacyProjectPileConfigurationKey>::deserialize(deserializer)?.map(|key| {
            PileConfigurationKey {
                pile_size_mm: key.pile_size_mm,
                pile_tip_level_mm: key.pile_tip_level_m_key,
            }
        }),
    )
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

    #[test]
    fn tip_level_regions_default_to_visible() {
        assert!(ProjectViewerSettings::default().show_tip_level_regions);
    }
    use crate::{CptSelectionAlgorithm, PileCostSettingsItem, PileCostShape};

    #[test]
    fn pile_plan_project_carries_alpha_project_state() {
        let project = sample_project();

        assert_eq!(project.schema, "IFCPP");
        assert_eq!(project.schema_version, 2);
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
                .active_pile_plan()
                .expect("active pile plan exists")
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

    #[test]
    fn pile_plan_round_trips_optimizer_unassigned_outcomes() {
        let mut project = sample_project();
        project.user_state.pile_plans[0]
            .optimization_unassigned
            .insert(7, crate::OptimizationUnassignedReason::ConfigurationLimits);

        let value = serde_json::to_value(&project).expect("project serializes");
        let restored: PilePlanProject =
            serde_json::from_value(value).expect("project deserializes");

        assert_eq!(
            restored.user_state.pile_plans[0]
                .optimization_unassigned
                .get(&7),
            Some(&crate::OptimizationUnassignedReason::ConfigurationLimits),
        );
    }

    #[test]
    fn pile_plan_defaults_missing_optimizer_outcomes_to_empty() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        value["user_state"]["pile_plans"][0]
            .as_object_mut()
            .expect("pile plan is an object")
            .remove("optimization_unassigned");

        let restored: PilePlanProject =
            serde_json::from_value(value).expect("legacy project deserializes");

        assert!(restored.user_state.pile_plans[0]
            .optimization_unassigned
            .is_empty());
    }

    #[test]
    fn pile_plan_discards_legacy_and_unknown_optimizer_reasons() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        value["user_state"]["pile_plans"][0]["optimization_unassigned"] = serde_json::json!({
            "1": "no_valid_option",
            "2": "group_member_without_valid_option",
            "3": "no_common_group_configuration",
            "4": "optimization_constraints",
            "5": "configuration_limits",
            "6": "future_reason"
        });

        let restored: PilePlanProject =
            serde_json::from_value(value).expect("legacy project deserializes");

        assert_eq!(
            restored.user_state.pile_plans[0].optimization_unassigned,
            HashMap::from([
                (
                    4,
                    crate::OptimizationUnassignedReason::OptimizationConstraints
                ),
                (5, crate::OptimizationUnassignedReason::ConfigurationLimits),
            ]),
        );
    }

    #[test]
    fn selected_piles_keep_the_legacy_ifcpp_tip_key_field() {
        let value = serde_json::to_value(sample_project()).expect("project serializes");
        let pile = &value["user_state"]["pile_plans"][0]["selected_piles"]["1"]["pile"];

        assert_eq!(pile["pile_tip_level_m_key"], -18_000);
        assert!(pile.get("pile_tip_level_mm").is_none());
    }

    #[test]
    fn legacy_selected_piles_migrate_to_one_active_pile_plan() {
        let project = sample_project();
        let selected_piles = project.user_state.pile_plans[0].selected_piles.clone();
        let mut value = serde_json::to_value(project).expect("project serializes");
        value["schema_version"] = serde_json::json!(1);
        let user_state = value
            .get_mut("user_state")
            .and_then(serde_json::Value::as_object_mut)
            .expect("user state is an object");
        user_state.remove("pile_plans");
        user_state.remove("active_pile_plan_id");
        user_state.insert(
            "selected_piles".to_string(),
            serde_json::to_value(selected_piles).expect("selected piles serialize"),
        );
        let parsed: PilePlanProject = serde_json::from_value(value).expect("legacy project loads");

        assert_eq!(parsed.user_state.active_pile_plan_id, "pile-plan-1");
        assert_eq!(parsed.user_state.pile_plans.len(), 1);
        assert_eq!(parsed.user_state.pile_plans[0].name, "Pile plan 1");
        assert!(parsed.user_state.pile_plans[0]
            .locked_load_point_ids
            .is_empty());
        assert_eq!(
            parsed.user_state.pile_plans[0]
                .selected_piles
                .get(&1)
                .and_then(|choice| choice.external_references[0].entity.as_deref()),
            Some("IfcPile")
        );
    }

    #[test]
    fn empty_or_unknown_active_plan_state_is_normalized() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        let user_state = value
            .get_mut("user_state")
            .and_then(serde_json::Value::as_object_mut)
            .expect("user state is an object");
        user_state.insert("pile_plans".to_string(), serde_json::json!([]));
        user_state.insert(
            "active_pile_plan_id".to_string(),
            serde_json::json!("missing-plan"),
        );

        let empty: PilePlanProject =
            serde_json::from_value(value.clone()).expect("empty plans normalize");
        assert_eq!(empty.user_state.pile_plans.len(), 1);
        assert_eq!(empty.user_state.active_pile_plan_id, "pile-plan-1");

        let user_state = value
            .get_mut("user_state")
            .and_then(serde_json::Value::as_object_mut)
            .expect("user state is an object");
        user_state.insert(
            "pile_plans".to_string(),
            serde_json::json!([{
                "id": "alternative",
                "name": "Alternative",
                "active_pile_sizes": [],
                "active_pile_tip_levels": [],
                "selected_piles": {},
                "locked_load_point_ids": []
            }]),
        );

        let unknown: PilePlanProject =
            serde_json::from_value(value).expect("unknown active plan normalizes");
        assert_eq!(unknown.user_state.active_pile_plan_id, "alternative");
    }

    #[test]
    fn duplicate_pile_plan_ids_are_rejected() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        let user_state = value
            .get_mut("user_state")
            .and_then(serde_json::Value::as_object_mut)
            .expect("user state is an object");
        let duplicate = user_state
            .get("pile_plans")
            .and_then(serde_json::Value::as_array)
            .expect("pile plans are an array")[0]
            .clone();
        user_state.insert(
            "pile_plans".to_string(),
            serde_json::json!([duplicate.clone(), duplicate]),
        );

        let error = serde_json::from_value::<PilePlanProject>(value)
            .expect_err("duplicate IDs must be rejected");
        assert!(error
            .to_string()
            .contains("duplicate pile plan id 'pile-plan-1'"));
    }

    #[test]
    fn legacy_project_defaults_new_utilization_settings() {
        let project = sample_project();
        let mut value = serde_json::to_value(project).expect("project serializes");
        let settings = value
            .get_mut("settings")
            .and_then(serde_json::Value::as_object_mut)
            .expect("settings are an object");
        settings.remove("viewer_utilization");
        settings
            .get_mut("optimization")
            .and_then(serde_json::Value::as_object_mut)
            .expect("optimization settings are an object")
            .remove("max_utilization");

        let parsed: PilePlanProject =
            serde_json::from_value(value).expect("legacy project deserializes");

        assert_eq!(parsed.settings.viewer_utilization.minimum, 0.0);
        assert_eq!(parsed.settings.viewer_utilization.maximum, 1.0);
        assert_eq!(parsed.settings.optimization.max_utilization, 1.0);
    }

    #[test]
    fn project_settings_accept_missing_pile_legend() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        value
            .get_mut("settings")
            .and_then(serde_json::Value::as_object_mut)
            .expect("settings are an object")
            .remove("pile_legend");

        let parsed: PilePlanProject =
            serde_json::from_value(value).expect("legacy settings deserialize");

        assert!(parsed.settings.pile_legend.is_none());
    }

    #[test]
    fn project_settings_round_trip_pile_legend() {
        let mut project = sample_project();
        let legend = ProjectLegendSettings {
            encoding_mode: "tip-symbol".to_string(),
            color_scheme: "colorblind-friendly".to_string(),
            pile_sizes: vec![ProjectLegendValueStyle {
                value: 320.0,
                symbol: ProjectPileSymbol {
                    base_shape: "square".to_string(),
                    fill_pattern: "top-half".to_string(),
                },
                color: "#0072B2".to_string(),
                symbol_automatic: false,
                color_automatic: true,
            }],
            pile_tip_levels: vec![],
        };
        project.settings.pile_legend = Some(legend.clone());

        let value = serde_json::to_value(project).expect("project serializes");
        let restored: PilePlanProject =
            serde_json::from_value(value).expect("project deserializes");

        assert_eq!(restored.settings.pile_legend, Some(legend));
    }

    #[test]
    fn project_legend_defaults_missing_assignment_metadata() {
        let mut value = serde_json::to_value(sample_project()).expect("project serializes");
        value["settings"]["pile_legend"] = serde_json::json!({
            "encoding_mode": "size-symbol",
            "pile_sizes": [{
                "value": 290.0,
                "symbol": { "base_shape": "circle", "fill_pattern": "full" },
                "color": "#4E79A7"
            }],
            "pile_tip_levels": []
        });

        let parsed: PilePlanProject =
            serde_json::from_value(value).expect("legacy legend deserializes");
        let legend = parsed
            .settings
            .pile_legend
            .expect("legend remains available");

        assert_eq!(legend.color_scheme, "tableau-extended");
        assert!(legend.pile_sizes[0].symbol_automatic);
        assert!(legend.pile_sizes[0].color_automatic);
    }

    #[test]
    fn viewer_utilization_settings_clamp_and_order_percentages() {
        assert_eq!(
            ViewerUtilizationSettings {
                minimum: 1.2,
                maximum: -0.1,
            }
            .normalized(),
            ViewerUtilizationSettings {
                minimum: 0.0,
                maximum: 1.0,
            }
        );
    }

    fn sample_project() -> PilePlanProject {
        PilePlanProject {
            schema: "IFCPP".to_string(),
            schema_version: 2,
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
                    monopoly_distance_m: 1.0,
                    max_angle_degrees: 120.0,
                },
                cpt_selection_by_load_point: HashMap::from([(
                    1,
                    CptSelectionSettings {
                        algorithm: CptSelectionAlgorithm::MaximumAngle,
                        max_distance_m: 18.0,
                        monopoly_distance_m: 1.0,
                        max_angle_degrees: 100.0,
                    },
                )]),
                pile_costs: PileCostSettings {
                    schema_version: 1,
                    items: vec![PileCostSettingsItem {
                        pile_size_mm: 290,
                        shape: PileCostShape::Round,
                        cost_per_m3: 1000.0,
                    }],
                },
                pile_head_level_m: Some(0.0),
                optimization: GreedyOptimizationSettings {
                    max_pile_sizes: 1,
                    max_pile_tip_levels: 1,
                    max_pile_configurations: 1,
                    max_utilization: 1.0,
                    candidate_source: Default::default(),
                },
                viewer_utilization: ViewerUtilizationSettings::default(),
                pile_legend: None,
                viewer: Default::default(),
            },
            user_state: ProjectUserState {
                pile_plans: vec![PilePlan {
                    id: "pile-plan-1".to_string(),
                    name: "Pile plan 1".to_string(),
                    active_pile_sizes: vec![290],
                    active_pile_tip_levels: vec![-18.0],
                    selected_piles: HashMap::from([(
                        1,
                        SelectedPileChoice {
                            pile: Some(PileConfigurationKey {
                                pile_size_mm: 290,
                                pile_tip_level_mm: -18000,
                            }),
                            external_references: vec![ExternalReference {
                                source_file: Some("model.ifc".to_string()),
                                global_id: Some("3Ab".to_string()),
                                entity: Some("IfcPile".to_string()),
                                description: Some("Future selected pile link".to_string()),
                            }],
                        },
                    )]),
                    locked_load_point_ids: Vec::new(),
                    optimization_unassigned: HashMap::new(),
                }],
                active_pile_plan_id: "pile-plan-1".to_string(),
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
