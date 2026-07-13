import type {
  BearingCapacity,
  LegendItems,
  PileConfigurationOption,
  PileConfigurationStyle,
  PileShape,
} from "../core/projectTypes";

const PILE_SHAPES: PileShape[] = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "triangle-down",
  "triangle-left",
  "triangle-right",
  "pentagon",
  "star",
  "thin-diamond",
  "hexagon",
  "octagon",
];

const PILE_TIP_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#76b7b2",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
];

export function getLegendItems(bearingCapacities: BearingCapacity[]): LegendItems {
  const pileSizes = uniqueValues(bearingCapacities.map((capacity) => capacity.pile_size_mm)).map((value, index) => ({
    value,
    shape: PILE_SHAPES[index % PILE_SHAPES.length],
  }));
  const pileTipLevels = uniqueValues(bearingCapacities.map((capacity) => capacity.pile_tip_level_m))
    .sort((left, right) => right - left)
    .map((value, index) => ({
      value,
      color: getPileTipColor(index),
    }));

  return { pileSizes, pileTipLevels };
}

export function getConfigurationStyle(
  configuration: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  legend: LegendItems,
): PileConfigurationStyle {
  return {
    shape: legend.pileSizes.find((item) => item.value === configuration.pile_size_mm)?.shape ?? "circle",
    color: legend.pileTipLevels.find((item) => item.value === configuration.pile_tip_level_m)?.color ?? "#8c989f",
  };
}

function getPileTipColor(index: number): string {
  if (index < PILE_TIP_COLORS.length) {
    return PILE_TIP_COLORS[index];
  }

  const hue = Math.round((index * 137.508) % 360);
  const saturation = 62 + (index % 3) * 8;
  const lightness = 46 + (index % 4) * 6;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function uniqueValues(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
