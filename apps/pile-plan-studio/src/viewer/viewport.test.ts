import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampScale,
  fitViewportToPoints,
  centerViewportAtPoint,
  getViewportTransform,
  panViewport,
  projectViewPointToScreen,
  zoomViewportAtPoint,
  type Viewport,
} from "./viewport.ts";

describe("viewport interaction helpers", () => {
  it("centers an unrounded projected point at the current zoom, including layout compensation", () => {
    const viewport = { scale: 2.25, offsetX: -120, offsetY: 43 };
    const point = { x: 123.456, y: 345.678 };
    const compensation = { x: -45.5, y: 28.25 };
    const size = { width: 731.25, height: 532.75 };
    const centered = centerViewportAtPoint(viewport, point, size, compensation);
    assert.equal(centered.scale, viewport.scale);
    assert.ok(Math.abs(point.x * centered.scale + centered.offsetX + compensation.x - size.width / 2) < 1e-10);
    assert.ok(Math.abs(point.y * centered.scale + centered.offsetY + compensation.y - size.height / 2) < 1e-10);
    assert.deepEqual(viewport, { scale: 2.25, offsetX: -120, offsetY: 43 });
  });
  it("clamps zoom between 80 and 1000 percent", () => {
    assert.equal(clampScale(0.25), 0.8);
    assert.equal(clampScale(7.5), 7.5);
    assert.equal(clampScale(12), 10);
  });

  it("zooms around the cursor position", () => {
    const viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const next = zoomViewportAtPoint(viewport, {
      cursorX: 200,
      cursorY: 100,
      nextScale: 2,
    });

    assert.deepEqual(next, {
      scale: 2,
      offsetX: -200,
      offsetY: -100,
    });
  });

  it("pans by the pointer movement delta", () => {
    const viewport: Viewport = { scale: 1.5, offsetX: -20, offsetY: 40 };

    assert.deepEqual(panViewport(viewport, { deltaX: 15, deltaY: -10 }), {
      scale: 1.5,
      offsetX: -5,
      offsetY: 30,
    });
  });

  it("projects a viewer point to screen pixels without scaling the marker itself", () => {
    assert.deepEqual(
      projectViewPointToScreen(
        { x: 25, y: 40 },
        { width: 1000, height: 500 },
        { scale: 1.5, offsetX: -20, offsetY: 30 },
      ),
      {
        x: 355,
        y: 330,
      },
    );
  });

  it("formats a viewport as one stage transform", () => {
    assert.equal(
      getViewportTransform({ scale: 1.75, offsetX: -120, offsetY: 45 }),
      "translate(-120px, 45px) scale(1.75)",
    );
  });
});


it("fits selected projected points with padding and layout compensation using one scale",()=>{
 const original={scale:2,offsetX:-100,offsetY:50},size={width:800,height:600},comp={x:43,y:-17};
 const points=[{x:100,y:100},{x:700,y:400}];
 const fitted=fitViewportToPoints(original,points,size,comp);
 for(const p of points){const x=p.x*fitted.scale+fitted.offsetX+comp.x,y=p.y*fitted.scale+fitted.offsetY+comp.y;assert.ok(x>=63&&x<=737);assert.ok(y>=63&&y<=537);}
 assert.equal(fitViewportToPoints(original,[],size,comp),original);
 assert.equal(fitViewportToPoints(original,[{x:100,y:100}],size,comp).scale,10);
 assert.deepEqual(original,{scale:2,offsetX:-100,offsetY:50});
});
