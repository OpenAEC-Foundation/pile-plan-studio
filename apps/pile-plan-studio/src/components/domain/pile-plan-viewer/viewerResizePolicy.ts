import { getCanvasLayoutCompensation } from "../../../viewer/viewerGeometry.ts";
import type { LocalCanvasRect } from "./viewerDomCoordinates.ts";

export type ViewerWindowMetrics = {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
};

export type ViewerLayoutSnapshot = {
  rect: LocalCanvasRect;
  metrics: ViewerWindowMetrics;
  compensation: { x: number; y: number };
  anchor: { left: number; top: number };
};

export function getViewerWindowMetrics(): ViewerWindowMetrics {
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

export function hasViewerWindowMetricsChanged(
  previous: ViewerWindowMetrics,
  current: ViewerWindowMetrics,
): boolean {
  return previous.innerWidth !== current.innerWidth
    || previous.innerHeight !== current.innerHeight
    || previous.devicePixelRatio !== current.devicePixelRatio;
}

export function nextViewerLayoutSnapshot(
  previous: ViewerLayoutSnapshot,
  rect: LocalCanvasRect,
  metrics: ViewerWindowMetrics,
  kind: "global" | "local",
): ViewerLayoutSnapshot {
  const compensation = kind === "global"
    ? {
        x: previous.compensation.x + (rect.width - previous.rect.width) / 2,
        y: previous.compensation.y + (rect.height - previous.rect.height) / 2,
      }
    : getCanvasLayoutCompensation(previous.anchor, rect);
  const anchor = kind === "global"
    ? { left: rect.left + compensation.x, top: rect.top + compensation.y }
    : previous.anchor;

  return { rect, metrics, compensation, anchor };
}
