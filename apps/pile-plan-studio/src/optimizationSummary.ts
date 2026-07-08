import type { GreedyOptimizedPileChoice } from "./projectTypes.ts";

export type OptimizationRunSummary = {
  appliedCount: number;
  changedCount: number;
};

export function summarizeOptimizationRun(
  previousChoiceKeys: Map<number, string>,
  choices: GreedyOptimizedPileChoice[],
  clearedLoadPointIds: number[] = [],
): OptimizationRunSummary {
  let changedCount = 0;

  for (const choice of choices) {
    const nextKey = `${choice.pile_size_mm}|${choice.pile_tip_level_m}`;
    if (previousChoiceKeys.get(choice.load_point_id) !== nextKey) {
      changedCount += 1;
    }
  }

  for (const loadPointId of clearedLoadPointIds) {
    if (previousChoiceKeys.get(loadPointId) !== "") {
      changedCount += 1;
    }
  }

  return {
    appliedCount: choices.length + clearedLoadPointIds.length,
    changedCount,
  };
}
