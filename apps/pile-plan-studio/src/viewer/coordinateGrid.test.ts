import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCoordinateGridLines, getNiceGridSpacing } from "./coordinateGrid.ts";

describe("coordinate grid", () => {
  it("uses 1, 2, or 5 times a power of ten", () => {
    assert.equal(getNiceGridSpacing(12_000, 1), 1_000);
    assert.equal(getNiceGridSpacing(36_000, 1), 5_000);
    assert.equal(getNiceGridSpacing(120_000, 2), 5_000);
  });

  it("aligns grid lines to absolute coordinate multiples", () => {
    const grid = getCoordinateGridLines({ minX: 12_300, maxX: 32_300, minY: -7_700, maxY: 12_300 }, 1);

    assert.ok(grid.vertical.length > 0);
    assert.ok(grid.horizontal.length > 0);
    assert.ok(grid.vertical.every((line) => line.coordinate % grid.spacing === 0));
    assert.ok(grid.horizontal.every((line) => line.coordinate % grid.spacing === 0));
    assert.ok(grid.vertical.every((line) => line.position >= 0 && line.position <= 100));
    assert.ok(grid.horizontal.every((line) => line.position >= 0 && line.position <= 100));
  });
});
