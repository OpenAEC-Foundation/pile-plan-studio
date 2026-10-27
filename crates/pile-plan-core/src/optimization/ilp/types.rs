use crate::{
    LoadPointGroup, OptimizationLimitScope, PileConfigurationKey, PileConfigurationOption,
    PileCostSettings, ProjectLoadPoint,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IlpCandidateSource {
    AllAvailable,
    ActiveLegend,
    Custom,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IlpOptimizationSettings {
    #[serde(default)]
    pub allow_pile_count_changes: bool,
    #[serde(default = "default_max_piles_per_cap")]
    pub max_piles_per_cap: u8,
    #[serde(default = "default_allowed_pile_counts")]
    pub allowed_pile_counts: Vec<u8>,
    #[serde(default)]
    pub skip_unsolvable_units: bool,
    #[serde(default = "coherence_enabled_by_default")]
    pub optimize_coherence: bool,
    pub max_pile_tip_levels: Option<u32>,
    pub max_pile_sizes: Option<u32>,
    pub max_pile_configurations: Option<u32>,
    pub max_utilization: f64,
    pub candidate_source: IlpCandidateSource,
    #[serde(default)]
    pub custom_configurations: Vec<PileConfigurationKey>,
    pub budget_basis_points: u32,
    pub transition_weights: IlpTransitionWeights,
}
impl Default for IlpOptimizationSettings {
    fn default() -> Self {
        Self {
            allow_pile_count_changes: false,
            max_piles_per_cap: default_max_piles_per_cap(),
            allowed_pile_counts: default_allowed_pile_counts(),
            skip_unsolvable_units: false,
            optimize_coherence: true,
            max_pile_tip_levels: None,
            max_pile_sizes: None,
            max_pile_configurations: None,
            max_utilization: 1.0,
            candidate_source: IlpCandidateSource::AllAvailable,
            custom_configurations: Vec::new(),
            budget_basis_points: 500,
            transition_weights: IlpTransitionWeights::default(),
        }
    }
}
fn default_max_piles_per_cap() -> u8 {
    6
}
fn default_allowed_pile_counts() -> Vec<u8> {
    (1..=crate::pile_cap_proposals::MAX_PILE_CAP_COUNT).collect()
}
fn coherence_enabled_by_default() -> bool {
    true
}
impl IlpOptimizationSettings {
    pub fn is_valid(&self) -> bool {
        (1..=crate::pile_cap_proposals::MAX_PILE_CAP_COUNT).contains(&self.max_piles_per_cap)
            && self
                .allowed_pile_counts
                .iter()
                .all(|n| (1..=crate::pile_cap_proposals::MAX_PILE_CAP_COUNT).contains(n))
            && self
                .allowed_pile_counts
                .iter()
                .any(|n| *n <= self.max_piles_per_cap)
            && self
                .allowed_pile_counts
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                == self.allowed_pile_counts.len()
            && self
                .custom_configurations
                .iter()
                .all(|c| c.pile_size_mm > 0)
            && self.max_utilization.is_finite()
            && self.max_utilization >= 0.0
            && self.max_utilization <= 1.0
            && [
                self.max_pile_sizes,
                self.max_pile_tip_levels,
                self.max_pile_configurations,
            ]
            .iter()
            .all(|n| n.is_none_or(|n| n > 0))
    }
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpTransitionWeights {
    pub tip_only_milli: u32,
    pub size_only_milli: u32,
    #[serde(default)]
    pub pile_count_milli: u32,
    /// Read-only compatibility for historical result settings; never used by the solver.
    #[serde(
        default,
        rename = "both_milli",
        skip_serializing_if = "Option::is_none"
    )]
    pub legacy_both_milli: Option<u32>,
}
impl Default for IlpTransitionWeights {
    fn default() -> Self {
        Self {
            tip_only_milli: 1000,
            size_only_milli: 1000,
            pile_count_milli: 1000,
            legacy_both_milli: None,
        }
    }
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IlpOptimizationInput {
    #[serde(default)]
    pub pile_cap_context: Option<crate::ProjectDocumentDraft>,
    pub load_points: Vec<ProjectLoadPoint>,
    pub groups: Vec<LoadPointGroup>,
    pub options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub target_load_point_ids: Vec<u32>,
    pub current_assignments: HashMap<u32, PileConfigurationKey>,
    pub locked_load_point_ids: Vec<u32>,
    pub candidate_configurations: Vec<PileConfigurationKey>,
    pub pile_head_level_m: Option<f64>,
    pub cost_settings: PileCostSettings,
    pub settings: IlpOptimizationSettings,
    pub limit_scope: OptimizationLimitScope,
    pub include_boundary_transitions: bool,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IlpRunRequest {
    pub run_id: String,
    #[serde(default)]
    pub local_only: bool,
    pub input: IlpOptimizationInput,
    pub time_limit_ms: Option<u32>,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IlpPhase {
    Preparation,
    CostReference,
    Spatial,
    LimitDiagnosis,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IlpTermination {
    Completed,
    Stopped,
    TimeLimit,
    Cancelled,
    SolverError,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IlpProof {
    Optimal,
    Feasible,
    Infeasible,
    Unknown,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpAssignment {
    pub load_point_id: u32,
    pub configuration: PileConfigurationKey,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpCounts {
    pub tip_levels: u32,
    pub pile_sizes: u32,
    pub configurations: u32,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpTransitionCounts {
    #[serde(default, skip_serializing_if = "is_zero")]
    pub pile_count: u32,
    pub tip_only: u32,
    pub size_only: u32,
    pub both: u32,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpCostReference {
    pub cost: u64,
    pub proof: IlpProof,
    pub termination: IlpTermination,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpSolution {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pile_cap_proposals: Vec<crate::PileCapProposal>,
    pub assignments: Vec<IlpAssignment>,
    pub cost: u64,
    pub budget: u64,
    pub reference: IlpCostReference,
    pub counts: IlpCounts,
    pub transitions: IlpTransitionCounts,
    pub score_milli: u64,
    pub proof: IlpProof,
    pub termination: IlpTermination,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpDiagnostic {
    pub code: String,
    pub load_point_ids: Vec<u32>,
    pub blocking: bool,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct IlpLimitProposal {
    pub required_limits: IlpCounts,
    pub increases: IlpCounts,
    pub minimality_proven: bool,
    pub witness: Vec<IlpAssignment>,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IlpProgress {
    /// Preparation notices retained when stopping with an intermediate solution.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<IlpDiagnostic>,
    pub phase: IlpPhase,
    pub elapsed_ms: u64,
    pub incumbent_objective: Option<f64>,
    pub best_bound: Option<f64>,
    pub relative_gap: Option<f64>,
    /// Validated incumbent, included only when it improves; never a drawing mutation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub best_solution: Option<IlpSolution>,
    /// Internal backend candidate, independently validated by the session before publication.
    #[serde(skip)]
    pub(crate) choices: Option<Vec<usize>>,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IlpOptimizationOutcome {
    Solved {
        solution: IlpSolution,
        diagnostics: Vec<IlpDiagnostic>,
    },
    Blocked {
        diagnostics: Vec<IlpDiagnostic>,
        solvable_load_point_ids: Vec<u32>,
    },
    Infeasible {
        diagnostics: Vec<IlpDiagnostic>,
        proposal: Option<IlpLimitProposal>,
    },
    NoSolution {
        phase: IlpPhase,
        termination: IlpTermination,
    },
    Cancelled,
    Failed {
        code: String,
    },
}
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum IlpEvent {
    Progress {
        run_id: String,
        progress: IlpProgress,
    },
    Finished {
        run_id: String,
        outcome: IlpOptimizationOutcome,
    },
}

/// Historical optimizer outcome owned by a pile plan, independent of current run settings.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct IlpPlanResult {
    pub solution: IlpSolution,
    pub diagnostics: Vec<IlpDiagnostic>,
    pub settings: IlpOptimizationSettings,
    pub whole_plan_limits: bool,
    pub boundary_transitions: bool,
    pub local_only: bool,
    pub currency_code: String,
    /// Versioned frontend content fingerprint used only to label stale historical results.
    pub basis_fingerprint: String,
}

fn is_zero(value: &u32) -> bool {
    *value == 0
}
