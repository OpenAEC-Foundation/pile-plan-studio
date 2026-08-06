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
  encodingMode: LegendItems["encodingMode"];
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
  const sizeStyles = new Map(input.legend.pileSizes.map((item) => [item.value, item]));
  const tipStyles = new Map(input.legend.pileTipLevels.map((item) => [item.value, item]));
  const enabledSizes = new Set(input.enabled.pileSizes);
  const enabledTips = new Set(input.enabled.pileTipLevels);
  const usedSizes = new Set(input.used.pileSizes);
  const usedTips = new Set(input.used.pileTipLevels);

  const pileSizes = uniqueSorted([
    ...sizeStyles.keys(),
    ...enabledSizes,
    ...usedSizes,
  ], false).map((value) => ({
    value,
    ...(sizeStyles.get(value) ?? fallbackStyle(value)),
    state: presentationState(enabledSizes.has(value), usedSizes.has(value)),
  }));
  const pileTipLevels = uniqueSorted([
    ...tipStyles.keys(),
    ...enabledTips,
    ...usedTips,
  ], true).map((value) => ({
    value,
    ...(tipStyles.get(value) ?? fallbackStyle(value)),
    state: presentationState(enabledTips.has(value), usedTips.has(value)),
  }));

  return { encodingMode: input.legend.encodingMode, pileSizes, pileTipLevels };
}

function fallbackStyle(value: number): LegendItems["pileSizes"][number] {
  return {
    value,
    symbol: { baseShape: "circle", fillPattern: "full" },
    color: "#8C989F",
  };
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
