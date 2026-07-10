export type Viewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function zoomViewportAtPoint(
  viewport: Viewport,
  input: {
    cursorX: number;
    cursorY: number;
    nextScale: number;
  },
): Viewport {
  const scaleRatio = input.nextScale / viewport.scale;

  return {
    scale: input.nextScale,
    offsetX: input.cursorX - (input.cursorX - viewport.offsetX) * scaleRatio,
    offsetY: input.cursorY - (input.cursorY - viewport.offsetY) * scaleRatio,
  };
}

export function panViewport(
  viewport: Viewport,
  input: {
    deltaX: number;
    deltaY: number;
  },
): Viewport {
  return {
    scale: viewport.scale,
    offsetX: viewport.offsetX + input.deltaX,
    offsetY: viewport.offsetY + input.deltaY,
  };
}

export function clampScale(scale: number): number {
  return Math.min(5, Math.max(0.8, Number(scale.toFixed(2))));
}

export function projectViewPointToScreen(
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (point.x / 100) * canvasSize.width * viewport.scale + viewport.offsetX,
    y: (point.y / 100) * canvasSize.height * viewport.scale + viewport.offsetY,
  };
}

export function getViewportTransform(viewport: Viewport): string {
  return `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`;
}
