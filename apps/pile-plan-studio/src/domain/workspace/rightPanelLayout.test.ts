import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampRightPanelSplit, rightPanelSplitAtPointer } from "./rightPanelLayout.ts";

describe("combined right panel layout", () => {
  it("uses viewport coordinates independently of interface scale", () => {
    assert.equal(rightPanelSplitAtPointer(660, 100, 800), 0.7);
    assert.equal(rightPanelSplitAtPointer(528, 80, 640), 0.7);
  });

  it("keeps both panes accessible when dragging outside the panel", () => {
    assert.equal(rightPanelSplitAtPointer(-100, 100, 800), 0.2);
    assert.equal(rightPanelSplitAtPointer(1500, 100, 800), 0.85);
    assert.equal(rightPanelSplitAtPointer(100, 100, 0), 0.7);
    assert.equal(clampRightPanelSplit(NaN), 0.7);
  });
});
