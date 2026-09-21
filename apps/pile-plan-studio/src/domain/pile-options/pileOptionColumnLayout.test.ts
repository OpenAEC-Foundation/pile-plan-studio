import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPileOptionColumns } from "./pileOptionTable.ts";
import { defaultPileOptionColumnLayout, normalizePileOptionColumnLayouts, movePileOptionColumn, setPileOptionColumnVisible, getVisiblePileOptionColumns } from "./pileOptionColumnLayout.ts";

describe("pile option column layouts", () => {
  it("keeps existing defaults and separate layouts for single and multiple selections", () => {
    const layouts = normalizePileOptionColumnLayouts(undefined);
    assert.deepEqual(getVisiblePileOptionColumns(1, layouts.single), getPileOptionColumns(1));
    assert.deepEqual(getVisiblePileOptionColumns(2, layouts.multiple), getPileOptionColumns(2));
    const changed = movePileOptionColumn(layouts.single, "cost", "status");
    assert.notDeepEqual(changed, layouts.single);
    assert.deepEqual(layouts.multiple, defaultPileOptionColumnLayout(2));
  });

  it("normalizes old, corrupt and future settings without losing valid order or visibility", () => {
    const layouts = normalizePileOptionColumnLayouts({ single: [
      { key: "cost", visible: false }, { key: "unknown", visible: true },
      { key: "cost", visible: true }, null, { key: "size", visible: "no" },
    ], multiple: "invalid" });
    assert.deepEqual(layouts.single.slice(0, 2), [{ key: "cost", visible: false }, { key: "size", visible: true }]);
    assert.equal(layouts.single.length, getPileOptionColumns(1).length);
    assert.deepEqual(normalizePileOptionColumnLayouts(JSON.parse(JSON.stringify(layouts))), layouts);
    assert.deepEqual(layouts.multiple, defaultPileOptionColumnLayout(2));
  });

  it("moves hidden columns to a drop target without changing the other columns' order", () => {
    const initial = setPileOptionColumnVisible(defaultPileOptionColumnLayout(1), "size", false);
    const moved = movePileOptionColumn(initial, "size", "symbol");
    assert.deepEqual(moved[0], { key: "size", visible: false });
    assert.equal(initial[0].key, "symbol");
    assert.deepEqual(movePileOptionColumn(moved, "size", "size"), moved);
    assert.deepEqual(movePileOptionColumn(initial, "symbol", "frd").map(column => column.key),
      ["size", "tip", "status", "cost", "use", "governing", "frd", "symbol"]);
    assert.deepEqual(movePileOptionColumn(initial, "frd", "symbol").map(column => column.key),
      ["frd", "symbol", "size", "tip", "status", "cost", "use", "governing"]);
    assert.equal(getVisiblePileOptionColumns(1, moved).some(column => column.key === "size"), false);
  });

  it("always retains a visible column and recovers an all-hidden saved layout", () => {
    let layout = defaultPileOptionColumnLayout(1);
    for (const { key } of layout) layout = setPileOptionColumnVisible(layout, key, false);
    assert.equal(layout.filter(column => column.visible).length, 1);
    const restored = normalizePileOptionColumnLayouts({ single: layout.map(column => ({ ...column, visible: false })) });
    assert.ok(restored.single.some(column => column.visible));
  });
});
