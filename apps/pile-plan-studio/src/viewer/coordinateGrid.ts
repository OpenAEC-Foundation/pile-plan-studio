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

export function alignCoordinateGridPatternToDevicePixels(
  pattern: CoordinateGridPattern,
  layout: {
    canvasScreen: { x: number; y: number };
    gridScreen: { x: number; y: number };
    rootScale: number;
    devicePixelRatio: number;
  },
): CoordinateGridPattern {
  // Align the pattern origin as a best effort. Repeated CSS-gradient lines may
  // still rasterize differently when their physical spacing is fractional.
  const rootScale = Math.max(Math.abs(layout.rootScale), Number.EPSILON);
  const devicePixelRatio = Math.max(Math.abs(layout.devicePixelRatio), Number.EPSILON);
  const desiredScreenX = layout.canvasScreen.x + pattern.originX * rootScale;
  const desiredScreenY = layout.canvasScreen.y + pattern.originY * rootScale;
  const alignedScreenX = Math.round(desiredScreenX * devicePixelRatio) / devicePixelRatio;
  const alignedScreenY = Math.round(desiredScreenY * devicePixelRatio) / devicePixelRatio;

  return {
    ...pattern,
    originX: (alignedScreenX - layout.gridScreen.x) / rootScale,
    originY: (alignedScreenY - layout.gridScreen.y) / rootScale,
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
