import type { PileConfigurationOption } from "./projectTypes.ts";

export type LegendSelectionFilter = {
  pileSizes: number[];
  pileTipLevels: number[];
};

export function toggleLegendSelectionFilter(
  filters: LegendSelectionFilter,
  kind: "size" | "tip",
  value: number,
): LegendSelectionFilter {
  return kind === "size"
    ? { ...filters, pileSizes: toggleValue(filters.pileSizes, value, false) }
    : { ...filters, pileTipLevels: toggleValue(filters.pileTipLevels, value, true) };
}

export function getLoadPointIdsForLegendSelection(
  chosenOptions: Map<number, PileConfigurationOption | null>,
  filters: LegendSelectionFilter,
): number[] {
  return [...chosenOptions.entries()]
    .filter(([, option]) => {
      if (!option) {
        return false;
      }

      const sizeMatches = filters.pileSizes.length === 0 || filters.pileSizes.includes(option.pile_size_mm);
      const tipMatches = filters.pileTipLevels.length === 0 || filters.pileTipLevels.includes(option.pile_tip_level_m);
      return sizeMatches && tipMatches;
    })
    .map(([loadPointId]) => loadPointId);
}

export function shouldHighlightGoverningCpt(governingCptId: number | null, activeSelectedCptIds: number[]): boolean {
  return governingCptId !== null && activeSelectedCptIds.includes(governingCptId);
}

function toggleValue(values: number[], value: number, descending: boolean): number[] {
  const nextValues = new Set(values);

  if (nextValues.has(value)) {
    nextValues.delete(value);
  } else {
    nextValues.add(value);
  }

  return [...nextValues].sort((left, right) => (descending ? right - left : left - right));
}
