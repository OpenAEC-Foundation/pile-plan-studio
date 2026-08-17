import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getTipLevelRegionToggle } from "./tipLevelRegionToggle.ts";

describe("tip-level region ribbon toggle", () => {
  it("shows hidden regions and hides visible regions", () => {
    assert.deepEqual(getTipLevelRegionToggle(false), {
      labelKey: "view.showTipLevelRegions",
      nextVisible: true,
    });
    assert.deepEqual(getTipLevelRegionToggle(true), {
      labelKey: "view.hideTipLevelRegions",
      nextVisible: false,
    });
  });
});
