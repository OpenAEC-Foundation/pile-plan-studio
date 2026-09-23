import {
  projectPointPixels,
  type ProjectViewTransform,
} from "./viewerGeometry.ts";
import type { Viewport } from "./viewport.ts";

export type CoordinateGridPattern = {
  spacing: number;
  spacingPixels: number;
  originX: number;
  originY: number;
};

export function getZoomGridSpacing(
  pixelsPerMillimeter: number,
  viewportScale: number,
  targetPixels = 100,
): number {
  const effectivePixelsPerMillimeter = Math.max(
    Math.abs(pixelsPerMillimeter * viewportScale),
    1e-9,
  );
  const idealSpacing = Math.max(Math.abs(targetPixels), 1) / effectivePixelsPerMillimeter;
  const magnitude = 10 ** Math.floor(Math.log10(idealSpacing));
  const candidates = [1, 2, 5, 10].map((factor) => factor * magnitude);

  return candidates.reduce((nearest, candidate) => (
    Math.abs(Math.log(candidate / idealSpacing)) < Math.abs(Math.log(nearest / idealSpacing))
      ? candidate
      : nearest
  ));
}

export function getCoordinateGridPattern(
  transform: ProjectViewTransform,
  viewport: Viewport,
  layout?: {
    canvasSize: { width: number; height: number };
    compensation: { x: number; y: number };
  },
): CoordinateGridPattern {
  const compensation = layout?.compensation ?? { x: 0, y: 0 };
  const spacing = getZoomGridSpacing(transform.pixelsPerMillimeter, viewport.scale);
  const origin = projectPointPixels({ x_mm: 0, y_mm: 0 }, transform);

  return {
    spacing,
    spacingPixels: spacing * transform.pixelsPerMillimeter * viewport.scale,
    originX: origin.x * viewport.scale + viewport.offsetX + compensation.x,
    originY: origin.y * viewport.scale + viewport.offsetY + compensation.y,
  };
}
