import { pileConfigurationToken } from "../core/pileConfigurationKey.ts";
import type { PilePlanData } from "../core/projectFile.ts";

export type ProjectCostSummary = {
  missingCount: number;
  totalCost: number;
};

export function summarizeProjectCosts(costs: Array<number | null | undefined>): ProjectCostSummary {
  return costs.reduce<ProjectCostSummary>(
    (summary, cost) => {
      if (cost === null || cost === undefined) {
        return { ...summary, missingCount: summary.missingCount + 1 };
      }

      return { ...summary, totalCost: summary.totalCost + cost };
    },
    { missingCount: 0, totalCost: 0 },
  );
}

export function summarizePilePlanCosts(
  pilePlans: PilePlanData[],
  pileCostByOptionKey: Map<string, number | null>,
): Map<string, ProjectCostSummary> {
  return new Map(pilePlans.map((plan) => [
    plan.id,
    summarizeProjectCosts(
      [...plan.selectedPileConfigurationsByLoadPoint.values()]
        .map((configuration) => pileCostByOptionKey.get(pileConfigurationToken(configuration))),
    ),
  ]));
}
