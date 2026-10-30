export type Viewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function centerViewportAtPoint(
  viewport: Viewport,
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
  compensation: { x: number; y: number },
): Viewport {
  return {
    scale: viewport.scale,
    offsetX: canvasSize.width / 2 - compensation.x - point.x * viewport.scale,
    offsetY: canvasSize.height / 2 - compensation.y - point.y * viewport.scale,
  };
}

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
  return Math.min(10, Math.max(0.8, Number(scale.toFixed(2))));
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

/** Fit already-projected points; project geometry and layout compensation stay independent. */
export function fitViewportToPoints(viewport:Viewport,points:readonly {x:number;y:number}[],size:{width:number;height:number},compensation:{x:number;y:number}):Viewport {
 if(!points.length||size.width<=0||size.height<=0)return viewport;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const padding=Math.min(64,size.width/4,size.height/4);
 const raw=Math.min((size.width-2*padding)/Math.max(1,maxX-minX),(size.height-2*padding)/Math.max(1,maxY-minY));
 // Round down so scale rounding cannot push an extremity outside the padding.
 const scale=clampScale(Math.floor(raw*100)/100);
 return centerViewportAtPoint({...viewport,scale},{x:(minX+maxX)/2,y:(minY+maxY)/2},size,compensation);
}
