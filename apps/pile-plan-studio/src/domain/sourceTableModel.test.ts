import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSourceTable, filterAndSortSourceRows } from "./sourceTableModel.ts";

describe("normalized source tables", () => {
  it("builds interpreted columns for every source role", () => {
    const loadPoints = buildSourceTable("load_points", {
      loadPoints: [{ id: 2, name: "LP 2", x_mm: 100, y_mm: 200, design_load_kn: 350 }],
      cpts: [],
      bearingCapacities: [],
    });
    const cpts = buildSourceTable("cpts", {
      loadPoints: [],
      cpts: [{ id: 7, name: "CPT 7", x_mm: 300, y_mm: 400 }],
      bearingCapacities: [],
    });
    const advice = buildSourceTable("bearing_capacities", {
      loadPoints: [],
      cpts: [],
      bearingCapacities: [{ cpt_id: 7, pile_size_mm: 320, pile_tip_level_m: -18, frd_kn: 900 }],
    });

    assert.deepEqual(loadPoints.columns.map(({ key }) => key), ["id", "x", "y", "fed"]);
    assert.deepEqual(cpts.columns.map(({ key }) => key), ["id", "x", "y"]);
    assert.deepEqual(advice.columns.map(({ key }) => key), ["cpt", "size", "tip", "capacity"]);
  });

  it("combines exact column filters by default and sorts numeric values numerically", () => {
    const rows = [
      { id: 10, x: 500, y: 0, fed: 90 },
      { id: 2, x: 150, y: 0, fed: 190 },
      { id: 3, x: 250, y: 0, fed: 150 },
    ];

    assert.deepEqual(
      filterAndSortSourceRows(
        rows,
        { x: { value: "500", mode: "exact" }, fed: { value: "90", mode: "exact" } },
        { key: "id", direction: "asc" },
      ),
      [rows[0]],
    );
  });

  it("supports contains matching as an explicit per-column option", () => {
    const rows = [
      { id: 10, x: 500 },
      { id: 2, x: 150 },
      { id: 3, x: 250 },
    ];

    assert.deepEqual(
      filterAndSortSourceRows(rows, { x: { value: "5", mode: "contains" } }, null),
      rows,
    );
  });
});
