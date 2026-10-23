import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSelectionOverviewRows, selectionRowsAtPointer } from "./selectionOverviewLayout.ts";

test("resizing selection rows accounts for compact UI scaling and clamps valid row counts", () => {
  assert.equal(selectionRowsAtPointer(4, 25.6, 0.8), 5);
  assert.equal(selectionRowsAtPointer(4, 32, 1), 5);
  assert.equal(selectionRowsAtPointer(4, -1000, 0.8), 1);
  assert.equal(selectionRowsAtPointer(4, 1000, 0.8), 12);
  assert.equal(clampSelectionOverviewRows(NaN), 4);
});
