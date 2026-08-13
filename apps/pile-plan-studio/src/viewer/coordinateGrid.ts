import {
  getVisibleProjectBounds,
  projectPoint,
  projectPointPixels,
  type ProjectViewTransform,
} from "./viewerGeometry.ts";
import type { Viewport } from "./viewport.ts";

export type CoordinateGridLine = {
  coordinate: number;
  position: number;
};

export type CoordinateGrid = {
  spacing: number;
  vertical: CoordinateGridLine[];
  horizontal: CoordinateGridLine[];
};

export type CoordinateGridPattern = {
  spacing: number;
  spacingPixels: number;
  originX: number;
  originY: number;
};

const TARGET_LINE_COUNT = 12;

export function getNiceGridSpacing(worldSpan: number, scale: number): number {
  const raw = Math.max(worldSpan, 1) / (TARGET_LINE_COUNT * Math.max(scale, 0.01));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function getCoordinateGridLines(transform: ProjectViewTransform, scale: number): CoordinateGrid {
  const visibleBounds = getVisibleProjectBounds(transform);
  const width = visibleBounds.maxX - visibleBounds.minX;
  const height = visibleBounds.maxY - visibleBounds.minY;
  const spacing = getNiceGridSpacing(Math.max(width, height), scale);
  const centerX = (transform.bounds.minX + transform.bounds.maxX) / 2;
  const centerY = (transform.bounds.minY + transform.bounds.maxY) / 2;

  return {
    spacing,
    vertical: coordinateLines(
      visibleBounds.minX,
      visibleBounds.maxX,
      spacing,
      (coordinate) => projectPoint({ x_mm: coordinate, y_mm: centerY }, transform).x,
    ),
    horizontal: coordinateLines(
      visibleBounds.minY,
      visibleBounds.maxY,
      spacing,
      (coordinate) => projectPoint({ x_mm: centerX, y_mm: coordinate }, transform).y,
    ),
  };
}

export function getCoordinateGridPattern(
  transform: ProjectViewTransform,
  viewport: Viewport,
  layout?: {
    canvasSize: { width: number; height: number };
    compensation: { x: number; y: number };
  },
): CoordinateGridPattern {
  const canvasSize = layout?.canvasSize ?? transform.canvasSize;
  const compensation = layout?.compensation ?? { x: 0, y: 0 };
  const visibleWorldSpan = Math.max(
    canvasSize.width / (transform.pixelsPerMillimeter * viewport.scale),
    canvasSize.height / (transform.pixelsPerMillimeter * viewport.scale),
  );
  const spacing = getNiceGridSpacing(
    visibleWorldSpan,
    1,
  );
  const origin = projectPointPixels({ x_mm: 0, y_mm: 0 }, transform);

  return {
    spacing,
    spacingPixels: spacing * transform.pixelsPerMillimeter * viewport.scale,
    originX: origin.x * viewport.scale + viewport.offsetX + compensation.x,
    originY: origin.y * viewport.scale + viewport.offsetY + compensation.y,
  };
}

function coordinateLines(
  minimum: number,
  maximum: number,
  spacing: number,
  project: (coordinate: number) => number,
): CoordinateGridLine[] {
  const lines: CoordinateGridLine[] = [];
  const first = Math.ceil(minimum / spacing) * spacing;
  for (let coordinate = first; coordinate <= maximum + spacing * 1e-9; coordinate += spacing) {
    const position = project(coordinate);
    if (position >= 0 && position <= 100) lines.push({ coordinate, position });
  }
  return lines;
}
