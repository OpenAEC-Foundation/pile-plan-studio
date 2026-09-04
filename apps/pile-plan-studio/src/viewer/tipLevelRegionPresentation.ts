import type { LegendItems } from "../core/projectTypes.ts";
import type { TipLevelRegionGeometryLayer } from "./tipLevelRegionGeometry.ts";

export type PresentedTipLevelRegionLayer = TipLevelRegionGeometryLayer & {
  color: string;
  opacity: 0.25;
};

export function presentTipLevelRegionGeometry(
  geometry: TipLevelRegionGeometryLayer[],
  legend: LegendItems,
): PresentedTipLevelRegionLayer[] {
  const colorsByTipLevel = new Map(
    legend.pileTipLevels.map(({ value, color }) => [value, color]),
  );

  return geometry
    .flatMap((layer) => {
      const color = colorsByTipLevel.get(layer.legendValueM);
      return color ? [{ ...layer, color, opacity: 0.25 as const }] : [];
    })
    .sort((first, second) => second.legendValueM - first.legendValueM);
}
