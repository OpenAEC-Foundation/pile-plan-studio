import type {
  GreedyOptimizedPileChoice,
  GreedyUnassignedLoadPoint,
} from "../core/projectTypes.ts";

export type OptimizationRunSummary = {
  assignedCount: number;
  changedCount: number;
  noValidOptionCount: number;
  optimizerUnassignedCount: number;
};

export function summarizeOptimizationRun(
  previousChoiceKeys: Map<number, string>,
  choices: GreedyOptimizedPileChoice[],
  unassigned: GreedyUnassignedLoadPoint[] = [],
): OptimizationRunSummary {
  let changedCount = 0;

  for (const choice of choices) {
    const nextKey = `${choice.pile_size_mm}|${choice.pile_tip_level_m}`;
    if (previousChoiceKeys.get(choice.load_point_id) !== nextKey) {
      changedCount += 1;
    }
  }

  for (const item of unassigned) {
    const previous = previousChoiceKeys.get(item.load_point_id);
    if (previous !== undefined && previous !== "") {
      changedCount += 1;
    }
  }

  const noValidOptionCount = unassigned.filter(
    (item) => item.reason === "no_valid_option",
  ).length;

  return {
    assignedCount: choices.length,
    changedCount,
    noValidOptionCount,
    optimizerUnassignedCount: unassigned.length - noValidOptionCount,
  };
}
