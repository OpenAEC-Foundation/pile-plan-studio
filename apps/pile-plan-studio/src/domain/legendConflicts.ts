import type { PilePlanData } from "../core/projectFile.ts";
import type { LegendItems, PileSymbol } from "../core/projectTypes.ts";

export type LegendConflict = {
  property: "symbol" | "color";
  values: number[];
  pilePlanIds: string[];
};

export function findCoactiveLegendConflicts(
  legend: LegendItems,
  pilePlans: PilePlanData[],
): LegendConflict[] {
  const symbolKind = legend.encodingMode === "size-symbol" ? "size" : "tip";
  const channels = [
    { property: "symbol" as const, kind: symbolKind },
    { property: "color" as const, kind: symbolKind === "size" ? "tip" as const : "size" as const },
  ];
  const merged = new Map<string, LegendConflict>();

  for (const { property, kind } of channels) {
    const items = kind === "size" ? legend.pileSizes : legend.pileTipLevels;
    for (const plan of pilePlans) {
      const activeValues = new Set(kind === "size" ? plan.activePileSizes : plan.activePileTipLevels);
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
        const key = `${property}|${appearance}|${values.join(",")}`;
        const conflict = merged.get(key);
        if (conflict) {
          conflict.pilePlanIds.push(plan.id);
        } else {
          merged.set(key, { property, values: [...values], pilePlanIds: [plan.id] });
        }
      }
    }
  }

  return [...merged.values()];
}

function symbolToken(symbol: PileSymbol): string {
  return `${symbol.baseShape}|${symbol.fillPattern}`;
}

export function otherActivePlanNames(
  plans: PilePlanData[],
  currentId: string,
  kind: "size" | "tip",
  value: number,
): string[] {
  return plans
    .filter((plan) => plan.id !== currentId
      && (kind === "size" ? plan.activePileSizes : plan.activePileTipLevels).includes(value))
    .map(({ name }) => name);
}
