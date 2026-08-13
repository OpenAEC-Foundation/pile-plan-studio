import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCoordinateGridLines, getCoordinateGridPattern, getNiceGridSpacing } from "./coordinateGrid.ts";
import { createProjectViewTransform, projectPoint } from "./viewerGeometry.ts";

describe("coordinate grid", () => {
  it("uses 1, 2, or 5 times a power of ten", () => {
    assert.equal(getNiceGridSpacing(12_000, 1), 1_000);
    assert.equal(getNiceGridSpacing(36_000, 1), 5_000);
    assert.equal(getNiceGridSpacing(120_000, 2), 5_000);
  });

  it("aligns grid lines to absolute coordinate multiples", () => {
    const transform = createProjectViewTransform(
      { minX: 12_300, maxX: 32_300, minY: -7_700, maxY: 12_300 },
      { width: 1_000, height: 500 },
    );
    const grid = getCoordinateGridLines(transform, 1);

    assert.ok(grid.vertical.length > 0);
    assert.ok(grid.horizontal.length > 0);
    assert.ok(grid.vertical.every((line) => line.coordinate % grid.spacing === 0));
    assert.ok(grid.horizontal.every((line) => line.coordinate % grid.spacing === 0));
    assert.ok(grid.vertical.every((line) => line.position >= 0 && line.position <= 100));
    assert.ok(grid.horizontal.every((line) => line.position >= 0 && line.position <= 100));
  });

  it("projects grid lines with the same equal-axis transform as markers", () => {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 2_000 },
      { width: 1_000, height: 500 },
    );
    const grid = getCoordinateGridLines(transform, 1);
    const vertical = grid.vertical.find((line) => line.coordinate === 1_000)!;
    const horizontal = grid.horizontal.find((line) => line.coordinate === 1_000)!;
    const marker = projectPoint({ x_mm: 1_000, y_mm: 1_000 }, transform);

    assert.equal(vertical.position, marker.x);
    assert.equal(horizontal.position, marker.y);
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
});
