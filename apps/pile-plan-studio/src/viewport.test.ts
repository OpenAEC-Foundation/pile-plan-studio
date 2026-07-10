import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getViewportTransform,
  panViewport,
  projectViewPointToScreen,
  zoomViewportAtPoint,
  type Viewport,
} from "./viewport.ts";

describe("viewport interaction helpers", () => {
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
