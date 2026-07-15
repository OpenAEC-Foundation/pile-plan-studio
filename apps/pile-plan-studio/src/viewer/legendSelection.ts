import type { PileConfigurationOption } from "../core/projectTypes.ts";
import { aggregatePileOptionsForLoadPoints } from "../domain/pileOptionAggregation.ts";

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

export function getHighlightedGoverningCptId(input: {
  activeSelectedCptIds: number[];
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  selectedLoadPointIds: number[];
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
}): number | null {
  if (input.selectedLoadPointIds.length === 0) {
    return null;
  }

  const chosenKeys = input.selectedLoadPointIds.map(
    (loadPointId) => input.selectedPileOptionKeysByLoadPoint.get(loadPointId) ?? "",
  );
  const chosenKey = chosenKeys[0];
  if (!chosenKey || chosenKeys.some((key) => key !== chosenKey)) {
    return null;
  }

  const optionGroups = input.selectedLoadPointIds.map(
    (loadPointId) => input.pileOptionsByLoadPointId.get(loadPointId) ?? [],
  );
  const options = optionGroups.length === 1
    ? optionGroups[0]
    : aggregatePileOptionsForLoadPoints(optionGroups);
  const governingCptId = options.find(
    (option) => `${option.pile_size_mm}|${option.pile_tip_level_m}` === chosenKey,
  )?.governing_cpt_id ?? null;

  return shouldHighlightGoverningCpt(governingCptId, input.activeSelectedCptIds)
    ? governingCptId
    : null;
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
