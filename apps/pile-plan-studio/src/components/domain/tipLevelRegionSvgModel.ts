import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";

export type TipLevelRegionSvgEdgePath = {
  d: string;
  strokeWidth: number;
  strokeLinecap: "butt";
};

export type TipLevelRegionSvgGroup = {
  key: string;
  color: string;
  opacity: 0.25;
  facePath: string | null;
  edgePath: TipLevelRegionSvgEdgePath | null;
  nodePath: string | null;
};

export type TipLevelRegionSvgModel = {
  className: "tip-level-region-overlay";
  ariaHidden: true;
  groups: TipLevelRegionSvgGroup[];
};

export function buildTipLevelRegionSvgModel(
  layers: PresentedTipLevelRegionLayer[],
): TipLevelRegionSvgModel {
  return {
    className: "tip-level-region-overlay",
    ariaHidden: true,
    groups: layers.map((layer) => ({
      key: `tip-level:${layer.pileTipLevelMKey}`,
      color: layer.color,
      opacity: layer.opacity,
      facePath: joinSubpaths(layer.faces.map(({ points }) => (
        `M ${points.map(({ x, y }, index) => `${index === 0 ? "" : "L "}${x} ${y}`).join(" ")} Z`
      ))),
      edgePath: layer.segments.length === 0 ? null : {
        d: joinSubpaths(layer.segments.map(({ x1, y1, x2, y2 }) => (
          `M ${x1} ${y1} L ${x2} ${y2}`
        )))!,
        strokeWidth: layer.diameterPx,
        strokeLinecap: "butt",
      },
      nodePath: joinSubpaths(layer.circles.map(({ x, y, radius }) => (
        `M ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y} `
          + `A ${radius} ${radius} 0 1 0 ${x + radius} ${y} Z`
      ))),
    })),
  };
}

function joinSubpaths(subpaths: string[]): string | null {
  return subpaths.length > 0 ? subpaths.join(" ") : null;
}
