import type {
  GreedyOptimizationResult,
  GreedyUnassignedReason,
} from "../.././core/projectTypes.ts";
import { summarizeOptimizationRun } from "../../domain/optimizationSummary.ts";

export type OptimizationTargetScope = "all" | "selected";
export type OptimizationLimitScope = "target" | "whole-plan";

export type SimpleOptimizationLimits = {
  sizes: number;
  tips: number;
  configurations: number;
};

export function clampOptimizationLimits(
  limits: SimpleOptimizationLimits,
  activePileSizes: number[],
  activePileTipLevels: number[],
): SimpleOptimizationLimits {
  const sizes = clampInteger(limits.sizes, activePileSizes.length);
  const tips = clampInteger(limits.tips, activePileTipLevels.length);
  return {
    sizes,
    tips,
    configurations: clampInteger(limits.configurations, sizes * tips),
  };
}

export function getOptimizationTargetIds(
  scope: OptimizationTargetScope,
  allIds: number[],
  selectedIds: number[],
  _lockedIds: number[] = [],
): number[] {
  return scope === "selected" ? selectedIds : allIds;
}

export function applyOptimizationResult(input: {
  previousChoices: Map<number, string>;
  result: GreedyOptimizationResult;
}) {
  const nextChoices = new Map(input.previousChoices);
  const affectedLoadPointIds = [...new Set([
    ...input.result.assignments.map((choice) => choice.load_point_id),
    ...input.result.unassigned.map((item) => item.load_point_id),
  ])].sort((left, right) => left - right);
  affectedLoadPointIds.forEach((id) => nextChoices.delete(id));
  input.result.assignments.forEach((choice) => {
    nextChoices.set(choice.load_point_id, `${choice.pile_size_mm}|${choice.pile_tip_level_m}`);
  });
  const optimizationUnassignedByLoadPoint = new Map<number, GreedyUnassignedReason>(
    input.result.unassigned.map((item) => [item.load_point_id, item.reason]),
  );

  return {
    choices: nextChoices,
    affectedLoadPointIds,
    optimizationUnassignedByLoadPoint,
    summary: summarizeOptimizationRun(
      input.previousChoices,
      input.result.assignments,
      input.result.unassigned,
    ),
  };
}

function clampInteger(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  const finite = Number.isFinite(value) ? Math.round(value) : maximum;
  return Math.max(1, Math.min(finite, maximum));
}
