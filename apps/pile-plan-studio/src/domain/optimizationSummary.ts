import type { GreedyOptimizedPileChoice } from "../core/projectTypes.ts";

export type OptimizationRunSummary = {
  assignedCount: number;
  changedCount: number;
  unassignedCount: number;
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
    const previous = previousChoiceKeys.get(loadPointId);
    if (previous !== undefined && previous !== "") {
      changedCount += 1;
    }
  }

  return {
    assignedCount: choices.length,
    changedCount,
    unassignedCount: clearedLoadPointIds.length,
  };
}
