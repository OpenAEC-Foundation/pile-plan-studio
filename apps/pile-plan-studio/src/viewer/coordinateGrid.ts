import type { ProjectBounds } from "../core/projectTypes.ts";

export type CoordinateGridLine = {
  coordinate: number;
  position: number;
};

export type CoordinateGrid = {
  spacing: number;
  vertical: CoordinateGridLine[];
  horizontal: CoordinateGridLine[];
};

const VIEW_PADDING_PERCENT = 10;
const PROJECT_VIEW_PERCENT = 80;
const TARGET_LINE_COUNT = 12;

export function getNiceGridSpacing(worldSpan: number, scale: number): number {
  const raw = Math.max(worldSpan, 1) / (TARGET_LINE_COUNT * Math.max(scale, 0.01));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function getCoordinateGridLines(bounds: ProjectBounds, scale: number): CoordinateGrid {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const spacing = getNiceGridSpacing(Math.max(width, height), scale);
  const worldPaddingX = width * VIEW_PADDING_PERCENT / PROJECT_VIEW_PERCENT;
  const worldPaddingY = height * VIEW_PADDING_PERCENT / PROJECT_VIEW_PERCENT;

  return {
    spacing,
    vertical: coordinateLines(
      bounds.minX - worldPaddingX,
      bounds.maxX + worldPaddingX,
      spacing,
      (coordinate) => VIEW_PADDING_PERCENT
        + (coordinate - bounds.minX) / width * PROJECT_VIEW_PERCENT,
    ),
    horizontal: coordinateLines(
      bounds.minY - worldPaddingY,
      bounds.maxY + worldPaddingY,
      spacing,
      (coordinate) => 100 - VIEW_PADDING_PERCENT
        - (coordinate - bounds.minY) / height * PROJECT_VIEW_PERCENT,
    ),
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
