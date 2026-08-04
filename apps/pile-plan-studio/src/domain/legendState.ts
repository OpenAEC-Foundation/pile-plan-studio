import type { LegendItems } from "../core/projectTypes.ts";
import type { ActivePileConfigurations } from "./activePileConfigurations.ts";

export type LegendPresentationState =
  | "enabled-used"
  | "enabled-unused"
  | "disabled-used"
  | "disabled-unused";

export type LegendPresentationInput = {
  legend: LegendItems;
  enabled: ActivePileConfigurations;
  used: ActivePileConfigurations;
};

export type LegendPresentation = {
  pileSizes: Array<LegendItems["pileSizes"][number] & { state: LegendPresentationState }>;
  pileTipLevels: Array<LegendItems["pileTipLevels"][number] & { state: LegendPresentationState }>;
};

export function deriveUsedPileConfigurations(optionKeys: Iterable<string>): ActivePileConfigurations {
  const configurations = [...optionKeys].flatMap((key) => {
    const [size, tip] = key.split("|").map(Number);
    return Number.isFinite(size) && Number.isFinite(tip) ? [{ size, tip }] : [];
  });

  return {
    pileSizes: uniqueSorted(configurations.map(({ size }) => size), false),
    pileTipLevels: uniqueSorted(configurations.map(({ tip }) => tip), true),
  };
}

export function buildLegendPresentation(input: LegendPresentationInput): LegendPresentation {
  const sizeShapes = new Map(input.legend.pileSizes.map((item) => [item.value, item.shape]));
  const tipColors = new Map(input.legend.pileTipLevels.map((item) => [item.value, item.color]));
  const enabledSizes = new Set(input.enabled.pileSizes);
  const enabledTips = new Set(input.enabled.pileTipLevels);
  const usedSizes = new Set(input.used.pileSizes);
  const usedTips = new Set(input.used.pileTipLevels);

  const pileSizes = uniqueSorted([
    ...sizeShapes.keys(),
    ...enabledSizes,
    ...usedSizes,
  ], false).map((value) => ({
    value,
    shape: sizeShapes.get(value) ?? "circle",
    state: presentationState(enabledSizes.has(value), usedSizes.has(value)),
  }));
  const pileTipLevels = uniqueSorted([
    ...tipColors.keys(),
    ...enabledTips,
    ...usedTips,
  ], true).map((value) => ({
    value,
    color: tipColors.get(value) ?? "#8c989f",
    state: presentationState(enabledTips.has(value), usedTips.has(value)),
  }));

  return { pileSizes, pileTipLevels };
}

function presentationState(enabled: boolean, used: boolean): LegendPresentationState {
  if (enabled) {
    return used ? "enabled-used" : "enabled-unused";
  }

  return used ? "disabled-used" : "disabled-unused";
}

function uniqueSorted(values: Iterable<number>, descending: boolean): number[] {
  return [...new Set(values)].sort((left, right) => descending ? right - left : left - right);
}
