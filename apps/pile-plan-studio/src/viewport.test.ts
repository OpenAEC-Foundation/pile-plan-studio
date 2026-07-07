import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { panViewport, zoomViewportAtPoint, type Viewport } from "./viewport.ts";

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
});
