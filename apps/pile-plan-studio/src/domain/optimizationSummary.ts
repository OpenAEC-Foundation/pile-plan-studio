import type {
  GreedyOptimizedPileChoice,
  OptimizationUnassignedLoadPoint,
  PileConfigurationKey,
} from "../core/projectTypes.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";

export type OptimizationRunSummary = {
  assignedCount: number;
  changedCount: number;
  technicalUnassignedCount: number;
  optimizerUnassignedCount: number;
};

export function summarizeOptimizationRun(
  previousChoiceKeys: Map<number, PileConfigurationKey>,
  choices: GreedyOptimizedPileChoice[],
  unassigned: OptimizationUnassignedLoadPoint[] = [],
  _unassignedGroupCount = 0,
  technicalUnassignedLoadPointIds: number[] = [],
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

  for (const loadPointId of new Set([
    ...unassigned.map((item) => item.load_point_id),
    ...technicalUnassignedLoadPointIds,
  ])) {
    const previous = previousChoiceKeys.get(loadPointId);
    if (previous !== undefined) {
      changedCount += 1;
    }
  }

  const technicalUnassignedCount = new Set(technicalUnassignedLoadPointIds).size;
  const optimizerUnassignedCount = unassigned.length;

  return {
    assignedCount: choices.length,
    changedCount,
    technicalUnassignedCount,
    optimizerUnassignedCount,
  };
}
