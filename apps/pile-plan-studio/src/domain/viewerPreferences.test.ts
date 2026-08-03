import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeViewerPreferences } from "./viewerPreferences.ts";

describe("viewer preferences", () => {
  it("defaults to full-size load points in the foreground", () => {
    assert.deepEqual(normalizeViewerPreferences(undefined), {
      symbolScalePercent: 100,
      foregroundLayer: "load-points",
    });
  });

  it("clamps symbol size and rejects unknown layers", () => {
    assert.deepEqual(normalizeViewerPreferences({
      symbolScalePercent: 260,
      foregroundLayer: "unknown",
    }), {
      symbolScalePercent: 200,
      foregroundLayer: "load-points",
    });
  });
});
