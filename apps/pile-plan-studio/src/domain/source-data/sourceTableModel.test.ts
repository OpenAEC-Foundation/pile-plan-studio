import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceTable,
  filterAndSortSourceRows,
  getSourceLoadPointSelection,
  getSourceSelectionRevealScrollTop,
} from "./sourceTableModel.ts";

describe("normalized source tables", () => {
  it("selects a Shift range in visible row order and skips unavailable rows", () => {
    assert.deepEqual(getSourceLoadPointSelection({
      rowIds: [40, 10, 30, 20],
      clickedId: 20,
      anchorId: 10,
      unavailableIds: new Set([30]),
      shiftKey: true,
      additiveKey: false,
    }), {
      mode: "replace",
      loadPointIds: [10, 20],
      anchorId: 10,
    });
  });

  it("toggles one row with Ctrl or Cmd and moves the range anchor", () => {
    assert.deepEqual(getSourceLoadPointSelection({
      rowIds: [10, 20, 30],
      clickedId: 30,
      anchorId: 10,
      unavailableIds: new Set(),
      shiftKey: false,
      additiveKey: true,
    }), {
      mode: "toggle",
      loadPointIds: [30],
      anchorId: 30,
    });
  });

  it("adds a Shift range when Ctrl or Cmd is also held", () => {
    assert.deepEqual(getSourceLoadPointSelection({
      rowIds: [10, 20, 30, 40],
      clickedId: 40,
      anchorId: 20,
      unavailableIds: new Set(),
      shiftKey: true,
      additiveKey: true,
    }), {
      mode: "add",
      loadPointIds: [20, 30, 40],
      anchorId: 20,
    });
  });

  it("preserves the table scroll position for a selection initiated by a table row", () => {
    assert.equal(getSourceSelectionRevealScrollTop({
      currentScrollTop: 15,
      selectedRowIndex: 0,
      rowHeight: 30,
      viewportHeight: 600,
      initiatedInTable: true,
    }), 15);
  });

  it("centers a partially visible selection that originated outside the source table", () => {
    assert.equal(getSourceSelectionRevealScrollTop({
      currentScrollTop: 15,
      selectedRowIndex: 0,
      rowHeight: 30,
      viewportHeight: 600,
      initiatedInTable: false,
    }), 0);
  });

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
