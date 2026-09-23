import type { CoordinateGridPattern } from "./coordinateGrid.ts";

export type GridCanvasFrame = {
  bitmapWidth: number;
  bitmapHeight: number;
  cssLeft: number;
  cssTop: number;
  cssWidth: number;
  cssHeight: number;
  strokePx: number;
  verticalX: number[];
  horizontalY: number[];
};

type ScreenRect = { left: number; top: number; width: number; height: number };

function visibleLinePixels(
  origin: number,
  spacing: number,
  screenStart: number,
  screenLength: number,
  rootScale: number,
  devicePixelRatio: number,
  bitmapOrigin: number,
  strokePx: number,
): number[] {
  const localSpacing = spacing * rootScale;
  if (!Number.isFinite(localSpacing) || localSpacing <= 0) return [];

  const localOrigin = origin * rootScale;
  const firstIndex = Math.ceil((-strokePx / devicePixelRatio - localOrigin) / localSpacing);
  const lastIndex = Math.floor(
    (screenLength + strokePx / devicePixelRatio - localOrigin) / localSpacing,
  );
  const lines: number[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const physicalCenter = Math.round(
      (screenStart + localOrigin + index * localSpacing) * devicePixelRatio,
    );
    lines.push(physicalCenter - bitmapOrigin - Math.floor(strokePx / 2));
  }
  return lines;
}

export function getCoordinateGridCanvasFrame(
  pattern: CoordinateGridPattern,
  layout: {
    screen: ScreenRect;
    rootScale: number;
    devicePixelRatio: number;
  },
): GridCanvasFrame {
  const { screen } = layout;
  const rootScale = Math.max(Math.abs(layout.rootScale), Number.EPSILON);
  const devicePixelRatio = Math.max(Math.abs(layout.devicePixelRatio), Number.EPSILON);
  const bitmapOriginX = Math.floor(screen.left * devicePixelRatio);
  const bitmapOriginY = Math.floor(screen.top * devicePixelRatio);
  const bitmapWidth = Math.max(
    1,
    Math.ceil((screen.left + screen.width) * devicePixelRatio) - bitmapOriginX,
  );
  const bitmapHeight = Math.max(
    1,
    Math.ceil((screen.top + screen.height) * devicePixelRatio) - bitmapOriginY,
  );
  const strokePx = Math.max(1, Math.round(devicePixelRatio * rootScale));

  return {
    bitmapWidth,
    bitmapHeight,
    cssLeft: (bitmapOriginX / devicePixelRatio - screen.left) / rootScale,
    cssTop: (bitmapOriginY / devicePixelRatio - screen.top) / rootScale,
    cssWidth: bitmapWidth / (devicePixelRatio * rootScale),
    cssHeight: bitmapHeight / (devicePixelRatio * rootScale),
    strokePx,
    verticalX: visibleLinePixels(
      pattern.originX,
      pattern.spacingPixels,
      screen.left,
      screen.width,
      rootScale,
      devicePixelRatio,
      bitmapOriginX,
      strokePx,
    ),
    horizontalY: visibleLinePixels(
      pattern.originY,
      pattern.spacingPixels,
      screen.top,
      screen.height,
      rootScale,
      devicePixelRatio,
      bitmapOriginY,
      strokePx,
    ),
  };
}
