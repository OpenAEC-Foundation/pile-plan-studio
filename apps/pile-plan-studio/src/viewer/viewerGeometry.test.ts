import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createProjectViewTransform,
  getCanvasLayoutCompensation,
  getProjectBounds,
  projectPoint,
  projectPointPixels,
  resizeProjectViewTransform,
} from "./viewerGeometry.ts";
import type { Cpt, LoadPoint } from "../core/projectTypes.ts";

const loadPoints: LoadPoint[] = [
  { id: 1, name: "Load point 1", x_mm: 0, y_mm: 0, design_load_kn: 100 },
  { id: 2, name: "Load point 2", x_mm: 100, y_mm: 200, design_load_kn: 250 },
];

const cpts: Cpt[] = [
  { id: 11, name: "CPT 11", x_mm: 50, y_mm: -50 },
  { id: 12, name: "CPT 12", x_mm: 200, y_mm: 100 },
];

describe("viewer geometry", () => {
  it("calculates bounds across load points and CPTs", () => {
    assert.deepEqual(getProjectBounds(loadPoints, cpts), {
      minX: 0,
      maxX: 200,
      minY: -50,
      maxY: 200,
    });
  });

  it("falls back to CPT bounds when there are no load points", () => {
    assert.deepEqual(getProjectBounds([], cpts), {
      minX: 50,
      maxX: 200,
      minY: -50,
      maxY: 100,
    });
  });

  it("uses one pixel scale for x and y on a wide canvas", () => {
    const bounds = { minX: 0, maxX: 2_000, minY: 0, maxY: 2_000 };
    const canvas = { width: 1_000, height: 500 };
    const transform = createProjectViewTransform(bounds, canvas);
    const origin = projectPoint({ x_mm: 0, y_mm: 0 }, transform);
    const xPoint = projectPoint({ x_mm: 1_000, y_mm: 0 }, transform);
    const yPoint = projectPoint({ x_mm: 0, y_mm: 1_000 }, transform);

    const xDistancePx = (xPoint.x - origin.x) / 100 * canvas.width;
    const yDistancePx = (origin.y - yPoint.y) / 100 * canvas.height;
    assert.equal(xDistancePx, yDistancePx);
    assert.deepEqual(origin, { x: 30, y: 90 });
    assert.deepEqual(projectPoint({ x_mm: 2_000, y_mm: 2_000 }, transform), { x: 70, y: 10 });
  });

  it("centers the spare vertical space on a tall canvas", () => {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 1_000 },
      { width: 500, height: 1_000 },
    );

    assert.deepEqual(projectPoint({ x_mm: 0, y_mm: 0 }, transform), { x: 10, y: 60 });
    assert.deepEqual(projectPoint({ x_mm: 2_000, y_mm: 1_000 }, transform), { x: 90, y: 40 });
  });

  it("preserves the absolute project position when a panel changes the canvas", () => {
    const initial = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 1_000 },
      { width: 1_000, height: 500 },
    );
    const resized = resizeProjectViewTransform(initial, {
      canvasSize: { width: 1_200, height: 500 },
      canvasOriginDelta: { x: 200, y: 0 },
      viewportScale: 1,
    });
    const before = projectPoint({ x_mm: 1_000, y_mm: 500 }, initial);
    const after = projectPoint({ x_mm: 1_000, y_mm: 500 }, resized);

    assert.equal(initial.pixelsPerMillimeter, resized.pixelsPerMillimeter);
    assert.equal(before.x / 100 * 1_000 + 200, after.x / 100 * 1_200);
    assert.equal(before.y / 100 * 500, after.y / 100 * 500);
  });

  it("reveals space at a resized edge without recentering the project", () => {
    const initial = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 1_000 },
      { width: 1_000, height: 500 },
    );
    const resized = resizeProjectViewTransform(initial, {
      canvasSize: { width: 1_200, height: 500 },
      canvasOriginDelta: { x: 0, y: 0 },
      viewportScale: 1,
    });
    const before = projectPoint({ x_mm: 1_000, y_mm: 500 }, initial);
    const after = projectPoint({ x_mm: 1_000, y_mm: 500 }, resized);

    assert.ok(Math.abs(before.x / 100 * 1_000 - after.x / 100 * 1_200) < 1e-9);
  });

  it("preserves exact marker pixels instead of resolving resized percentages", () => {
    const initial = createProjectViewTransform(
      { minX: 0, maxX: 2_000, minY: 0, maxY: 1_000 },
      { width: 1_003.375, height: 501.625 },
    );
    const before = projectPointPixels({ x_mm: 713.25, y_mm: 618.75 }, initial);
    const resized = resizeProjectViewTransform(initial, {
      canvasSize: { width: 1_487.875, height: 501.625 },
      canvasOriginDelta: { x: 0, y: 0 },
      viewportScale: 3.64,
    });

    assert.deepEqual(projectPointPixels({ x_mm: 713.25, y_mm: 618.75 }, resized), before);
  });

  it("keeps a fixed world point at one screen position through every layout resize step", () => {
    const anchor = { left: 202.39584350585938, top: 222.73959350585938 };
    const point = { x: 87.4194, y: 395.686 };
    const viewport = { scale: 4.37, offsetX: -2096.16, offsetY: -928.637 };
    const canvasOrigins = [
      anchor,
      { left: 202.39584350585938, top: 200.34375 },
      { left: 202.39584350585938, top: 222.73959350585938 },
      { left: 202.39584350585938, top: 179.55209350585938 },
    ];
    const expected = {
      x: anchor.left + viewport.offsetX + point.x * viewport.scale,
      y: anchor.top + viewport.offsetY + point.y * viewport.scale,
    };

    for (const origin of canvasOrigins) {
      const compensation = getCanvasLayoutCompensation(anchor, origin);
      assert.ok(Math.abs(
        origin.left + compensation.x + viewport.offsetX + point.x * viewport.scale - expected.x,
      ) < 1e-9);
      assert.ok(Math.abs(
        origin.top + compensation.y + viewport.offsetY + point.y * viewport.scale - expected.y,
      ) < 1e-9);
    }
  });

  it("preserves distinct sub-percentage positions for nearby load points", () => {
    const sampleBounds = {
      minX: 5700.3992184,
      maxX: 141130.9999848,
      minY: -30812.6001984,
      maxY: 74199.999936,
    };

    const transform = createProjectViewTransform(sampleBounds, { width: 1_000, height: 700 });
    const loadPoint695 = projectPoint({ x_mm: 122600, y_mm: 4150 }, transform);
    const loadPoint654 = projectPoint({ x_mm: 122600, y_mm: 5250 }, transform);

    assert.notEqual(loadPoint695.y, loadPoint654.y);
    assert.ok(Math.abs(loadPoint695.y - loadPoint654.y) < 1);
  });
});
