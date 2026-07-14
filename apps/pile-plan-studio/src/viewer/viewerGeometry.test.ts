import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getProjectBounds, projectPoint } from "./viewerGeometry.ts";
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

  it("projects coordinates into a stable view box", () => {
    assert.deepEqual(projectPoint({ x_mm: 0, y_mm: -50 }, getProjectBounds(loadPoints, cpts)), {
      x: 10,
      y: 90,
    });
    assert.deepEqual(projectPoint({ x_mm: 200, y_mm: 200 }, getProjectBounds(loadPoints, cpts)), {
      x: 90,
      y: 10,
    });
  });

  it("preserves distinct sub-percentage positions for nearby load points", () => {
    const sampleBounds = {
      minX: 5700.3992184,
      maxX: 141130.9999848,
      minY: -30812.6001984,
      maxY: 74199.999936,
    };

    const loadPoint695 = projectPoint({ x_mm: 122600, y_mm: 4150 }, sampleBounds);
    const loadPoint654 = projectPoint({ x_mm: 122600, y_mm: 5250 }, sampleBounds);

    assert.notEqual(loadPoint695.y, loadPoint654.y);
    assert.ok(Math.abs(loadPoint695.y - loadPoint654.y) < 1);
  });
});
