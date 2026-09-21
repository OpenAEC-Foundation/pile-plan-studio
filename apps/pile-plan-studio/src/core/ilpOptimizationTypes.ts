import type { LoadPointGroup } from "./loadPointGroupContract.ts";
import type { LoadPoint, PileConfigurationKey, PileConfigurationOption, PileCostSettings, OptimizationLimitScope } from "./projectTypes.ts";

export type IlpTransitionWeights = { tip_only_milli: number; size_only_milli: number; /** Historical result metadata only; ignored for new optimizations. */ both_milli?: number };
export type IlpOptimizationSettings = {
  skip_unsolvable_units: boolean;
  optimize_coherence: boolean;
  max_pile_tip_levels: number | null; max_pile_sizes: number | null; max_pile_configurations: number | null;
  max_utilization: number; candidate_source: "all_available" | "active_legend" | "custom";
  custom_configurations?: PileConfigurationKey[];
  budget_basis_points: number; transition_weights: IlpTransitionWeights;
};
export type OptimizationTargetScope = "all" | "selected";
export type IlpOptimizationContractInput = {
  groups: LoadPointGroup[];
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
  targetLoadPointIds: number[];
  lockedLoadPointIds: number[];
  currentAssignments: Map<number, PileConfigurationKey>;
  limitScope: OptimizationLimitScope;
  pileHeadLevelM: number | null;
  costSettings: PileCostSettings;
  candidateConfigurations: PileConfigurationKey[];
  loadPoints: LoadPoint[]; settings: IlpOptimizationSettings; includeBoundaryTransitions: boolean;
};
export type IlpRunRequest = { runId: string; input: IlpOptimizationContractInput; timeLimitMs: number | null; localOnly?: boolean };
export type IlpPhase = "preparation" | "cost_reference" | "spatial" | "limit_diagnosis";
export type IlpTermination = "completed" | "time_limit" | "stopped" | "cancelled" | "solver_error";
export type IlpProof = "optimal" | "feasible" | "infeasible" | "unknown";
export type IlpCounts = { tip_levels: number; pile_sizes: number; configurations: number };
export type IlpAssignment = { load_point_id: number; configuration: PileConfigurationKey };
export type IlpSolution = {
  assignments: IlpAssignment[]; cost: number; budget: number;
  reference: { cost: number; proof: IlpProof; termination: IlpTermination };
  counts: IlpCounts; transitions: { tip_only: number; size_only: number; both: number };
  score_milli: number; proof: IlpProof; termination: IlpTermination;
};
export type IlpDiagnostic = { code: string; load_point_ids: number[]; blocking: boolean };
export type IlpPlanResult = {
  solution: IlpSolution; diagnostics: IlpDiagnostic[]; settings: IlpOptimizationSettings;
  whole_plan_limits: boolean; boundary_transitions: boolean; local_only: boolean;
  currency_code: string; basis_fingerprint: string;
};
export type IlpLimitProposal = { required_limits: IlpCounts; increases: IlpCounts; minimality_proven: boolean; witness: IlpAssignment[] };
export type IlpOptimizationOutcome =
  | { status: "solved"; solution: IlpSolution; diagnostics: IlpDiagnostic[] }
  | { status: "blocked"; diagnostics: IlpDiagnostic[]; solvable_load_point_ids: number[] }
  | { status: "infeasible"; diagnostics: IlpDiagnostic[]; proposal: IlpLimitProposal | null }
  | { status: "no_solution"; phase: IlpPhase; termination: IlpTermination }
  | { status: "cancelled" }
  | { status: "failed"; code: string };
export type IlpProgress = { phase: IlpPhase; elapsed_ms: number; incumbent_objective: number | null; best_bound: number | null; relative_gap: number | null; best_solution?: IlpSolution; diagnostics?: IlpDiagnostic[] };
export type IlpEvent = { kind: "progress"; run_id: string; progress: IlpProgress } | { kind: "finished"; run_id: string; outcome: IlpOptimizationOutcome };
