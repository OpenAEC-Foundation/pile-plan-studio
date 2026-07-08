import type { Cpt, LoadPoint, ProjectBounds, ViewPoint } from "./projectTypes";

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 100;
const VIEW_PADDING = 10;

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
  bounds: ProjectBounds,
): ViewPoint {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const xRatio = (point.x_mm - bounds.minX) / width;
  const yRatio = (point.y_mm - bounds.minY) / height;

  return {
    x: Math.round(VIEW_PADDING + xRatio * (VIEW_WIDTH - VIEW_PADDING * 2)),
    y: Math.round(VIEW_HEIGHT - VIEW_PADDING - yRatio * (VIEW_HEIGHT - VIEW_PADDING * 2)),
  };
}
