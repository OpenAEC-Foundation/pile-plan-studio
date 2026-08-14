import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as coordinateGrid from "./coordinateGrid.ts";
import { getCoordinateGridLines, getCoordinateGridPattern, getNiceGridSpacing } from "./coordinateGrid.ts";
import { createProjectViewTransform, projectPoint } from "./viewerGeometry.ts";

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

  it("keeps computed grid positions stable and aligns the origin across layout changes", () => {
    const rootScale = 0.8;
    const devicePixelRatio = 1.5;
    const spacingPixels = 110.4166666667;
    const globalOrigin = { x: 421.2375, y: 245.80475 };
    const layouts = [
      {
        canvasScreen: { x: 330.3958435, y: 222.7395935 },
        gridScreen: { x: 331.0625, y: 223.40625 },
      },
      {
        canvasScreen: { x: 370.3958435, y: 200.34375 },
        gridScreen: { x: 371.0625, y: 201.0104218 },
      },
    ];

    const aligned = layouts.map(({ canvasScreen, gridScreen }) => (
      coordinateGrid.alignCoordinateGridPatternToDevicePixels(
        {
          spacing: 1_000,
          spacingPixels,
          originX: (globalOrigin.x - canvasScreen.x) / rootScale,
          originY: (globalOrigin.y - canvasScreen.y) / rootScale,
        },
        {
          canvasScreen,
          gridScreen,
          rootScale,
          devicePixelRatio,
        },
      )
    ));

    for (let index = -5; index <= 10; index += 1) {
      const firstVertical = layouts[0].gridScreen.x
        + (aligned[0].originX + index * spacingPixels) * rootScale;
      const secondVertical = layouts[1].gridScreen.x
        + (aligned[1].originX + index * spacingPixels) * rootScale;
      const firstHorizontal = layouts[0].gridScreen.y
        + (aligned[0].originY + index * spacingPixels) * rootScale;
      const secondHorizontal = layouts[1].gridScreen.y
        + (aligned[1].originY + index * spacingPixels) * rootScale;

      assert.ok(Math.abs(firstVertical - secondVertical) < 1e-9);
      assert.ok(Math.abs(firstHorizontal - secondHorizontal) < 1e-9);
    }

    assert.equal(
      (layouts[0].gridScreen.x + aligned[0].originX * rootScale) * devicePixelRatio,
      Math.round(globalOrigin.x * devicePixelRatio),
    );
    assert.equal(
      (layouts[0].gridScreen.y + aligned[0].originY * rootScale) * devicePixelRatio,
      Math.round(globalOrigin.y * devicePixelRatio),
    );
  });
});
