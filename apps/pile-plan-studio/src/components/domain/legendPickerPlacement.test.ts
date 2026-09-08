import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRightAlignedLegendPopoverMaxWidth,
  shouldOpenLegendPickerAbove,
} from "./legendPickerPlacement.ts";

describe("shouldOpenLegendPickerAbove", () => {
  it("opens above when the popover is clipped below and there is more room above", () => {
    assert.equal(shouldOpenLegendPickerAbove(500, 524, 150, 200, 574), true);
  });

  it("keeps opening below when the popover fits", () => {
    assert.equal(shouldOpenLegendPickerAbove(300, 324, 150, 200, 574), false);
  });

  it("keeps opening below near the top when that side has more room", () => {
    assert.equal(shouldOpenLegendPickerAbove(210, 234, 400, 200, 574), false);
  });
});

describe("right-aligned legend popover width", () => {
  it("keeps the preferred width when the popover can expand leftward", () => {
    assert.equal(getRightAlignedLegendPopoverMaxWidth(750, 100, 8), 460);
  });

  it("limits the width only when the left boundary leaves less room", () => {
    assert.equal(getRightAlignedLegendPopoverMaxWidth(330, 100, 8), 222);
  });
});
