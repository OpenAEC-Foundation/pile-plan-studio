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
