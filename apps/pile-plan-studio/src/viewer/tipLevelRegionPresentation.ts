import type { LegendItems } from "../core/projectTypes.ts";
import type { TipLevelRegionGeometryLayer } from "./tipLevelRegionGeometry.ts";

export type PresentedTipLevelRegionLayer = TipLevelRegionGeometryLayer & {
  color: string;
  opacity: 0.25;
};

export function presentTipLevelRegionGeometry(
  geometry: TipLevelRegionGeometryLayer[],
  legend: LegendItems,
  activePileTipLevels?: Iterable<number>,
): PresentedTipLevelRegionLayer[] {
  const activeTips = activePileTipLevels ? new Set(activePileTipLevels) : null;
  const colorsByTipLevel = new Map(
    legend.pileTipLevels.map(({ value, color }) => [value, color]),
  );

  return geometry
    .flatMap((layer) => {
      const configuredColor = colorsByTipLevel.get(layer.legendValueM);
      if (!configuredColor) return [];
      const color = legend.encodingMode === "size-color-tip-region"
        && activeTips !== null
        && !activeTips.has(layer.legendValueM)
        ? "#8C989F"
        : configuredColor;
      return [{ ...layer, color, opacity: 0.25 as const }];
    })
    .sort((first, second) => second.legendValueM - first.legendValueM);
}
