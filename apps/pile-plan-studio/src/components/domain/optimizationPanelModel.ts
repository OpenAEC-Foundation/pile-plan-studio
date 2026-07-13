import type { GreedyOptimizedPileChoice } from "../.././core/projectTypes.ts";

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
): number[] {
  return scope === "selected" ? selectedIds : allIds;
}

export function applyOptimizationChoices(input: {
  previousChoices: Map<number, string>;
  targetIds: number[];
  choices: GreedyOptimizedPileChoice[];
}) {
  const nextChoices = new Map(input.previousChoices);
  const previousForTargets = new Map(input.targetIds.map((id) => [id, nextChoices.get(id)]));
  input.targetIds.forEach((id) => nextChoices.delete(id));
  input.choices.forEach((choice) => {
    nextChoices.set(choice.load_point_id, `${choice.pile_size_mm}|${choice.pile_tip_level_m}`);
  });

  const used = [...nextChoices.values()].map((key) => key.split("|").map(Number));
  const changedCount = input.targetIds.filter((id) => previousForTargets.get(id) !== nextChoices.get(id)).length;

  return {
    choices: nextChoices,
    activePileSizes: [...new Set(used.map(([size]) => size))].sort((a, b) => a - b),
    activePileTipLevels: [...new Set(used.map(([, tip]) => tip))].sort((a, b) => a - b),
    summary: { appliedCount: input.targetIds.length, changedCount },
  };
}

function clampInteger(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  const finite = Number.isFinite(value) ? Math.round(value) : maximum;
  return Math.max(1, Math.min(finite, maximum));
}
