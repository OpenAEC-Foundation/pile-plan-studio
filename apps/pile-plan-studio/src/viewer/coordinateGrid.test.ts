import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as coordinateGrid from "./coordinateGrid.ts";
import { getCoordinateGridPattern } from "./coordinateGrid.ts";
import { createProjectViewTransform } from "./viewerGeometry.ts";

describe("coordinate grid", () => {
  it("exposes zoom-driven world spacing as a pure calculation", () => {
    assert.equal(typeof coordinateGrid.getZoomGridSpacing, "function");
  });

  it("chooses the nearest 1, 2, or 5 spacing around a 100 pixel target", () => {
    assert.equal(coordinateGrid.getZoomGridSpacing(0.2, 1), 500);
    assert.equal(coordinateGrid.getZoomGridSpacing(0.2, 2), 200);
    assert.equal(coordinateGrid.getZoomGridSpacing(0.2, 4), 100);
  });

  it("returns finite positive spacing for defensive minimum scales", () => {
    const spacing = coordinateGrid.getZoomGridSpacing(0, 0);
    assert.ok(Number.isFinite(spacing));
    assert.ok(spacing > 0);
  });

  it("anchors a repeating grid pattern to real coordinates across the viewport", () => {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 2_000 },
      { width: 1_000, height: 500 },
    );

    assert.deepEqual(getCoordinateGridPattern(transform, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    }), {
      spacing: 500,
      spacingPixels: 100,
      originX: 300,
      originY: 450,
    });
  });

  it("applies the same canvas-layout compensation as the marker stage", () => {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 2_000 },
      { width: 1_000, height: 500 },
    );
    const viewport = { scale: 4, offsetX: -300, offsetY: -200 };
    const base = getCoordinateGridPattern(transform, viewport);
    const shifted = getCoordinateGridPattern(transform, viewport, {
      canvasSize: { width: 1_400, height: 650 },
      compensation: { x: 120, y: -40 },
    });

    assert.equal(shifted.originX, base.originX + 120);
    assert.equal(shifted.originY, base.originY - 40);
  });

  it("keeps world spacing unchanged when only the visible canvas size changes", () => {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 2_000 },
      { width: 1_000, height: 500 },
    );
    const viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const compact = getCoordinateGridPattern(transform, viewport, {
      canvasSize: { width: 1_000, height: 500 },
      compensation: { x: 0, y: 0 },
    });
    const wide = getCoordinateGridPattern(transform, viewport, {
      canvasSize: { width: 1_900, height: 500 },
      compensation: { x: 0, y: 0 },
    });

    assert.equal(wide.spacing, compact.spacing);
    assert.equal(wide.spacingPixels, compact.spacingPixels);
  });

});
