import type { Cpt, LoadPoint, ProjectBounds, ViewPoint } from "../core/projectTypes";

const VIEW_PADDING_RATIO = 0.1;

export const VIEWER_LAYOUT_CHANGE_EVENT = "pile-plan-viewer-layout-change";

export type ProjectViewTransform = {
  bounds: ProjectBounds;
  canvasSize: { width: number; height: number };
  pixelsPerMillimeter: number;
  projectCenterPx: { x: number; y: number };
};

export function getCanvasLayoutCompensation(
  anchor: { left: number; top: number },
  current: { left: number; top: number },
): { x: number; y: number } {
  return {
    x: anchor.left - current.left,
    y: anchor.top - current.top,
  };
}

export function getProjectBounds(loadPoints: LoadPoint[], cpts: Cpt[]): ProjectBounds {
  const points = [...loadPoints, ...cpts];

  if (points.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x_mm)),
    maxX: Math.max(...points.map((point) => point.x_mm)),
    minY: Math.min(...points.map((point) => point.y_mm)),
    maxY: Math.max(...points.map((point) => point.y_mm)),
  };
}

export function projectPoint(
  point: Pick<LoadPoint | Cpt, "x_mm" | "y_mm">,
  transform: ProjectViewTransform,
): ViewPoint {
  const pixels = projectPointPixels(point, transform);

  return {
    x: pixels.x / transform.canvasSize.width * 100,
    y: pixels.y / transform.canvasSize.height * 100,
  };
}

export function projectPointPixels(
  point: Pick<LoadPoint | Cpt, "x_mm" | "y_mm">,
  transform: ProjectViewTransform,
): ViewPoint {
  const { bounds, pixelsPerMillimeter } = transform;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: transform.projectCenterPx.x + (point.x_mm - centerX) * pixelsPerMillimeter,
    y: transform.projectCenterPx.y - (point.y_mm - centerY) * pixelsPerMillimeter,
  };
}

export function createProjectViewTransform(
  bounds: ProjectBounds,
  canvasSize: { width: number; height: number },
): ProjectViewTransform {
  const safeCanvasSize = {
    width: Math.max(canvasSize.width, 1),
    height: Math.max(canvasSize.height, 1),
  };
  const worldWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const worldHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const availableWidth = safeCanvasSize.width * (1 - VIEW_PADDING_RATIO * 2);
  const availableHeight = safeCanvasSize.height * (1 - VIEW_PADDING_RATIO * 2);

  return {
    bounds,
    canvasSize: safeCanvasSize,
    pixelsPerMillimeter: Math.min(availableWidth / worldWidth, availableHeight / worldHeight),
    projectCenterPx: {
      x: safeCanvasSize.width / 2,
      y: safeCanvasSize.height / 2,
    },
  };
}

export function resizeProjectViewTransform(
  transform: ProjectViewTransform,
  input: {
    canvasSize: { width: number; height: number };
    canvasOriginDelta: { x: number; y: number };
    viewportScale: number;
  },
): ProjectViewTransform {
  const safeScale = Math.max(input.viewportScale, Number.EPSILON);

  return {
    ...transform,
    canvasSize: {
      width: Math.max(input.canvasSize.width, 1),
      height: Math.max(input.canvasSize.height, 1),
    },
    projectCenterPx: {
      x: transform.projectCenterPx.x + input.canvasOriginDelta.x / safeScale,
      y: transform.projectCenterPx.y + input.canvasOriginDelta.y / safeScale,
    },
  };
}

export function getVisibleProjectBounds(transform: ProjectViewTransform): ProjectBounds {
  const centerX = (transform.bounds.minX + transform.bounds.maxX) / 2;
  const centerY = (transform.bounds.minY + transform.bounds.maxY) / 2;

  return {
    minX: centerX - transform.projectCenterPx.x / transform.pixelsPerMillimeter,
    maxX: centerX + (transform.canvasSize.width - transform.projectCenterPx.x) / transform.pixelsPerMillimeter,
    minY: centerY - (transform.canvasSize.height - transform.projectCenterPx.y) / transform.pixelsPerMillimeter,
    maxY: centerY + transform.projectCenterPx.y / transform.pixelsPerMillimeter,
  };
}
