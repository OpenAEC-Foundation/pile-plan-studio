import type {
  GreedyOptimizedPileChoice,
  GreedyUnassignedLoadPoint,
  PileConfigurationKey,
} from "../core/projectTypes.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";

export type OptimizationRunSummary = {
  assignedCount: number;
  changedCount: number;
  noValidOptionCount: number;
  optimizerUnassignedCount: number;
};

export function summarizeOptimizationRun(
  previousChoiceKeys: Map<number, PileConfigurationKey>,
  choices: GreedyOptimizedPileChoice[],
  unassigned: GreedyUnassignedLoadPoint[] = [],
): OptimizationRunSummary {
  let changedCount = 0;

  for (const choice of choices) {
    if (!samePileConfiguration(
      previousChoiceKeys.get(choice.load_point_id),
      choice.configuration,
    )) {
      changedCount += 1;
    }
  }

  for (const item of unassigned) {
    const previous = previousChoiceKeys.get(item.load_point_id);
    if (previous !== undefined) {
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
