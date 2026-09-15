import type { PilePlanData } from "../../core/projectFile.ts";
import type { LegendItems, PileSymbol } from "../../core/projectTypes.ts";

export type LegendConflict = {
  property: "symbol" | "color";
  kind: "size" | "tip";
  values: number[];
  pilePlanIds: string[];
};

export function groupLegendConflictsByProperty(
  conflicts: LegendConflict[],
): Record<LegendConflict["property"], LegendConflict[]> {
  return {
    symbol: conflicts.filter(({ property }) => property === "symbol"),
    color: conflicts.filter(({ property }) => property === "color"),
  };
}

export type LegendValuePlanUsageItem = {
  planId: string;
  planName: string;
  active: boolean;
  assignmentCount: number;
};

export type LegendValuePlanUsage = {
  current: LegendValuePlanUsageItem;
  inScope: LegendValuePlanUsageItem[];
  outsideScope: LegendValuePlanUsageItem[];
  activeOutsideScopeCount: number;
};

export function findCoactiveLegendConflicts(
  legend: LegendItems,
  pilePlans: PilePlanData[],
): LegendConflict[] {
  const channels: Array<Pick<LegendConflict, "property" | "kind">> = legend.encodingMode === "size-color-tip-region"
    ? [
        { property: "color", kind: "size" },
        { property: "color", kind: "tip" },
      ]
    : [
        { property: "symbol", kind: legend.encodingMode === "size-symbol" ? "size" : "tip" },
        { property: "color", kind: legend.encodingMode === "size-symbol" ? "tip" : "size" },
      ];
  const merged = new Map<string, LegendConflict>();

  for (const { property, kind } of channels) {
    const items = kind === "size" ? legend.pileSizes : legend.pileTipLevels;
    for (const plan of pilePlans) {
      const activeValues = new Set(kind === "size" ? plan.activePileSizes : plan.activePileTipLevelMms);
      const valuesByAppearance = new Map<string, number[]>();
      for (const item of items) {
        if (!activeValues.has(item.value)) continue;
        const appearance = property === "color"
          ? item.color.toUpperCase()
          : symbolToken(item.symbol);
        const values = valuesByAppearance.get(appearance) ?? [];
        values.push(item.value);
        valuesByAppearance.set(appearance, values);
      }
      for (const [appearance, values] of valuesByAppearance) {
        if (values.length < 2) continue;
        const key = `${property}|${kind}|${appearance}|${values.join(",")}`;
        const conflict = merged.get(key);
        if (conflict) {
          conflict.pilePlanIds.push(plan.id);
        } else {
          merged.set(key, { property, kind, values: [...values], pilePlanIds: [plan.id] });
        }
      }
    }
  }

  return [...merged.values()];
}

function symbolToken(symbol: PileSymbol): string {
  return `${symbol.baseShape}|${symbol.fillPattern}`;
}

export function getLegendValuePlanUsage(input: {
  plans: PilePlanData[];
  currentPlanId: string;
  scopePlanIds: ReadonlySet<string>;
  kind: "size" | "tip";
  value: number;
}): LegendValuePlanUsage {
  const usage = input.plans.map((plan): LegendValuePlanUsageItem => ({
    planId: plan.id,
    planName: plan.name,
    active: (input.kind === "size" ? plan.activePileSizes : plan.activePileTipLevelMms)
      .includes(input.value),
    assignmentCount: [...plan.selectedPileConfigurationsByLoadPoint.values()]
      .filter((configuration) => input.kind === "size"
        ? configuration.pile_size_mm === input.value
        : configuration.pile_tip_level_mm === input.value)
      .length,
  }));
  const current = usage.find(({ planId }) => planId === input.currentPlanId);
  if (!current) throw new Error(`Unknown current pile plan '${input.currentPlanId}'`);
  const relevantOtherPlans = usage.filter((item) => item.planId !== input.currentPlanId
    && (item.active || item.assignmentCount > 0));
  const outsideScope = relevantOtherPlans.filter(({ planId }) => !input.scopePlanIds.has(planId));

  return {
    current,
    inScope: relevantOtherPlans.filter(({ planId }) => input.scopePlanIds.has(planId)),
    outsideScope,
    activeOutsideScopeCount: outsideScope.filter(({ active }) => active).length,
  };
}
