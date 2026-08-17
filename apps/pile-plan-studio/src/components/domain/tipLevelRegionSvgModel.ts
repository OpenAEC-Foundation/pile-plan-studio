import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";

export type TipLevelRegionSvgLine = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  strokeLinecap: "round";
  strokeLinejoin: "round";
};

export type TipLevelRegionSvgCircle = {
  key: string;
  cx: number;
  cy: number;
  r: number;
};

export type TipLevelRegionSvgGroup = {
  key: string;
  fill: string;
  stroke: string;
  opacity: 0.25;
  lines: TipLevelRegionSvgLine[];
  circles: TipLevelRegionSvgCircle[];
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
      fill: layer.color,
      stroke: layer.color,
      opacity: layer.opacity,
      lines: layer.segments.map((segment) => ({
        key: `segment:${Math.min(segment.fromLoadPointId, segment.toLoadPointId)}:${Math.max(segment.fromLoadPointId, segment.toLoadPointId)}`,
        x1: segment.x1,
        y1: segment.y1,
        x2: segment.x2,
        y2: segment.y2,
        strokeWidth: layer.diameterPx,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      })),
      circles: layer.circles.map((circle) => ({
        key: `circle:${circle.loadPointId}`,
        cx: circle.x,
        cy: circle.y,
        r: circle.radius,
      })),
    })),
  };
}
