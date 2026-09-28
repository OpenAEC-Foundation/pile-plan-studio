import { pileConfigurationToken } from "../../core/pileConfigurationKey.ts";
import type { PileConfigurationKey } from "../../core/projectTypes.ts";
import { isIlpResultStale } from "../../domain/pile-plans/ilp-optimization/ilpPlanRun.ts";
import { summarizeProjectCosts } from "../../domain/pile-plans/projectCostSummary.ts";
import { McpReadError, assignmentsForPlan, page, type ToolPayload } from "./readModel.ts";
import type { PlanAssessmentSnapshot } from "./planAssessments.ts";

function sameConfiguration(a: PileConfigurationKey | undefined, b: PileConfigurationKey | undefined): boolean {
  return a?.pile_size_mm === b?.pile_size_mm && a?.pile_tip_level_mm === b?.pile_tip_level_mm;
}

export async function comparePilePlans(
  snapshot: PlanAssessmentSnapshot,
  aId: string,
  bId: string,
  pagination: { limit: number; offset: number },
): Promise<ToolPayload> {
  const { state, marker } = snapshot;
  if (aId === bId) throw new McpReadError("same_plan");
  const planA = state.pilePlans.find((plan) => plan.id === aId);
  const planB = state.pilePlans.find((plan) => plan.id === bId);
  if (!planA || !planB) throw new McpReadError("unknown_id");
  if (!snapshot.calculateCost) throw new McpReadError("cost_unavailable");
  const assignmentsA = assignmentsForPlan(state, planA);
  const assignmentsB = assignmentsForPlan(state, planB);
  const locksA = new Set(planA.lockedLoadPointIds);
  const locksB = new Set(planB.lockedLoadPointIds);
  const unique = new Map<string, PileConfigurationKey>();
  for (const configuration of [...assignmentsA.values(), ...assignmentsB.values()]) {
    unique.set(pileConfigurationToken(configuration), configuration);
  }
  const costByToken = new Map<string, number | null>();
  for (const [token, configuration] of unique) {
    costByToken.set(token, await snapshot.calculateCost({
      pileSizeMm: configuration.pile_size_mm,
      pileTipLevelM: configuration.pile_tip_level_mm / 1000,
      pileHeadLevelM: state.pileHeadLevelM ?? 0,
      settings: state.pileCostSettings,
    }));
  }
  if (snapshot.isCurrent && !snapshot.isCurrent()) throw new McpReadError("project_changed");
  const costSummary = (assignments: typeof assignmentsA) => summarizeProjectCosts(
    [...assignments.values()].map((configuration) => costByToken.get(pileConfigurationToken(configuration))),
  );
  const costA = costSummary(assignmentsA);
  const costB = costSummary(assignmentsB);
  const complete = costA.missingCount === 0 && costB.missingCount === 0;
  const difference = complete ? costB.totalCost - costA.totalCost : null;
  const rows = state.loadPoints.flatMap((point) => {
    const a = assignmentsA.get(point.id);
    const b = assignmentsB.get(point.id);
    const lockA = locksA.has(point.id);
    const lockB = locksB.has(point.id);
    if (sameConfiguration(a, b) && lockA === lockB) return [];
    return [{ load_point_id: point.id, assignment_a: a ?? null, assignment_b: b ?? null,
      locked_a: lockA, locked_b: lockB, assignment_changed: !sameConfiguration(a, b), lock_changed: lockA !== lockB }];
  });
  const onlyA = rows.filter((row) => row.assignment_a && !row.assignment_b).length;
  const onlyB = rows.filter((row) => !row.assignment_a && row.assignment_b).length;
  const changed = rows.filter((row) => row.assignment_a && row.assignment_b && row.assignment_changed).length;
  return { ...marker, data: {
    plan_a: { id: planA.id, name: planA.name, assigned_count: assignmentsA.size, lock_count: locksA.size,
      active_pile_size_count: planA.activePileSizes.length, active_tip_level_count: planA.activePileTipLevelMms.length,
      known_subtotal: costA.totalCost, missing_cost_count: costA.missingCount, cost_complete: costA.missingCount === 0,
      has_optimization_result: !!planA.ilpResult, result_stale: isIlpResultStale(state, planA) },
    plan_b: { id: planB.id, name: planB.name, assigned_count: assignmentsB.size, lock_count: locksB.size,
      active_pile_size_count: planB.activePileSizes.length, active_tip_level_count: planB.activePileTipLevelMms.length,
      known_subtotal: costB.totalCost, missing_cost_count: costB.missingCount, cost_complete: costB.missingCount === 0,
      has_optimization_result: !!planB.ilpResult, result_stale: isIlpResultStale(state, planB) },
    currency_code: state.currencyCode,
    cost_difference: difference,
    cost_difference_percent: difference === null || costA.totalCost === 0 ? null : difference / costA.totalCost * 100,
    different_assignment_count: onlyA + onlyB + changed,
    different_lock_count: rows.filter((row) => row.lock_changed).length,
    assignments_only_in_a: onlyA, assignments_only_in_b: onlyB, changed_configurations: changed,
    technical_comparison_available: !state.analysisError && state.pileOptionsByLoadPointId.size === state.loadPoints.length,
    differences: page(rows, pagination),
  } };
}
