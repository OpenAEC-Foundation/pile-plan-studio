import { pileConfigurationToken } from "../../core/pileConfigurationKey.ts";
import type { calculatePileCostCore } from "../../core/analysisCoreClient.ts";
import type { IlpPlanResult, IlpSolution } from "../../core/ilpOptimizationTypes.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { isIlpResultStale, type IlpPlanRun } from "../../domain/pile-plans/ilp-optimization/ilpPlanRun.ts";
import { summarizeProjectCosts } from "../../domain/pile-plans/projectCostSummary.ts";
import type { IlpRunState } from "../optimization/ilpOptimizationController.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import { McpReadError, assignmentsForPlan, page, pageArgs, planForRead, type ToolPayload } from "./readModel.ts";
import { comparePilePlans } from "./planComparison.ts";

export type PlanAssessmentToolName =
  | "pile_get_plan"
  | "pile_get_plan_costs"
  | "pile_get_plan_optimization"
  | "pile_compare_plans"
  | "pile_get_current_optimization";

export type PlanAssessmentSnapshot = {
  state: ProjectState;
  marker: ProjectMarkerValue;
  calculateCost?: typeof calculatePileCostCore;
  isCurrent?: () => boolean;
  currentOptimization?: { run: IlpPlanRun | null; runState: IlpRunState; valid: boolean;
    runId?: string | null; timeLimitSeconds?: number | null; targetLoadPointIds?: number[] | null };
};

function solutionSummary(solution: IlpSolution) {
  return {
    cost: solution.cost,
    budget: solution.budget,
    reference: solution.reference,
    returned_plan: { proof: solution.proof, termination: solution.termination },
    counts: solution.counts,
    transitions: solution.transitions,
    score_milli: solution.score_milli,
    assignment_count: solution.assignments.length,
  };
}

function savedResult(result: IlpPlanResult, args: Record<string, unknown>) {
  return {
    solution: solutionSummary(result.solution),
    settings: result.settings,
    whole_plan_limits: result.whole_plan_limits,
    boundary_transitions: result.boundary_transitions,
    local_only: result.local_only,
    currency_code: result.currency_code,
    diagnostics: page(result.diagnostics, args),
  };
}

export async function readPlanAssessment(
  snapshot: PlanAssessmentSnapshot,
  name: PlanAssessmentToolName,
  rawArgs: unknown,
): Promise<ToolPayload> {
  const { state, marker } = snapshot;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  if (name === "pile_compare_plans") return comparePilePlans(snapshot,
    args.plan_a_id as string, args.plan_b_id as string, pageArgs(args));
  if (name === "pile_get_current_optimization") {
    const current = snapshot.currentOptimization;
    if (!current?.run) return { ...marker, data: { status: "none", transient: true } };
    const { run, runState } = current;
    const outcome = runState.outcome;
    let result: Record<string, unknown> | null = null;
    if (outcome?.status === "solved") result = {
      status: outcome.status, solution: solutionSummary(outcome.solution), diagnostics: page(outcome.diagnostics, args),
    };
    else if (outcome?.status === "blocked") result = {
      status: outcome.status, diagnostics: page(outcome.diagnostics, args),
      solvable_load_point_ids: page(outcome.solvable_load_point_ids, {
        limit: args.solvable_limit, offset: args.solvable_offset,
      }),
    };
    else if (outcome?.status === "infeasible") result = {
      status: outcome.status, diagnostics: page(outcome.diagnostics, args),
      proposal: outcome.proposal ? {
        required_limits: outcome.proposal.required_limits,
        increases: outcome.proposal.increases,
        minimality_proven: outcome.proposal.minimality_proven,
        witness_count: outcome.proposal.witness.length,
      } : null,
    };
    else if (outcome && outcome.status !== "cancelled") result = outcome;
    const committed=outcome?.status==="solved" && state.pilePlans.some(plan=>
      plan.id===run.target.id && plan.ilpResult?.solution===outcome.solution);
    return { ...marker, data: {
      transient: true,
      status: runState.stopping ? "stopping" : runState.running ? "running" : outcome?.status ?? (!current.valid ? "cancelled" : "none"),
      run_id: current.runId ?? null,
      time_limit_seconds: current.timeLimitSeconds ?? null,
      target_count: current.targetLoadPointIds?.length ?? null,
      source_plan_id: run.sourceId,
      destination_plan_id: run.target.id,
      destination_plan_name: run.target.name,
      phase: runState.progress?.phase ?? null,
      elapsed_ms: runState.progress?.elapsed_ms ?? null,
      incumbent_objective: runState.progress?.incumbent_objective ?? null,
      best_bound: runState.progress?.best_bound ?? null,
      relative_gap: runState.progress?.relative_gap ?? null,
      invalidated_by_project_change: !current.valid && outcome?.status !== "solved",
      committed,
      committed_destination_plan_id: committed ? run.target.id : null,
      result,
    } };
  }
  const plan = planForRead(state, args);
  const assignments = assignmentsForPlan(state, plan);
  if (name === "pile_get_plan") {
    return { ...marker, data: {
      id: plan.id, name: plan.name, active: plan.id === state.activePilePlanId,
      active_pile_sizes_mm: plan.activePileSizes,
      active_pile_tip_levels_mm: plan.activePileTipLevelMms,
      assignment_count: assignments.size,
      unassigned_count: state.loadPoints.length - assignments.size,
      locked_load_point_ids: page([...plan.lockedLoadPointIds].sort((a, b) => a - b), args),
      optimizer_unassigned_count: plan.optimizationUnassignedByLoadPoint.size,
      has_optimization_result: !!plan.ilpResult,
    } };
  }
  if (name === "pile_get_plan_optimization") {
    const activePlan = plan.id === state.activePilePlanId
      ? { ...plan, selectedPileConfigurationsByLoadPoint: assignments } : plan;
    return { ...marker, data: {
      plan_id: plan.id,
      optimizer_unassigned_count: plan.optimizationUnassignedByLoadPoint.size,
      result_stale: isIlpResultStale(state, activePlan),
      result: plan.ilpResult ? savedResult(plan.ilpResult, args) : null,
    } };
  }
  if (!snapshot.calculateCost) throw new McpReadError("cost_unavailable");
  const unique = new Map([...assignments.values()].map((configuration) => [
    pileConfigurationToken(configuration), configuration,
  ]));
  const byToken = new Map<string, number | null>();
  for (const [token, configuration] of unique) {
    byToken.set(token, await snapshot.calculateCost({
      pileSizeMm: configuration.pile_size_mm,
      pileTipLevelM: configuration.pile_tip_level_mm / 1000,
      pileHeadLevelM: state.pileHeadLevelM ?? 0,
      settings: state.pileCostSettings,
    }));
  }
  if (snapshot.isCurrent && !snapshot.isCurrent()) throw new McpReadError("project_changed");
  const costs = [...assignments.values()].map((configuration) => byToken.get(pileConfigurationToken(configuration)));
  const summary = summarizeProjectCosts(costs);
  return { ...marker, data: {
    plan_id: plan.id,
    currency_code: state.currencyCode,
    assigned_count: assignments.size,
    known_subtotal: summary.totalCost,
    missing_cost_count: summary.missingCount,
    complete: summary.missingCount === 0,
  } };
}
