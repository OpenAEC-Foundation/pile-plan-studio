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
});
