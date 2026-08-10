import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BROWSER_BASELINE_ZOOM,
  applyRuntimeBaseline,
  layoutScaleFromWidths,
  screenToLocal,
} from "./uiBaseline.ts";

describe("UI baseline geometry", () => {
  it("uses browser 80 percent as the compact application baseline", () => {
    assert.equal(BROWSER_BASELINE_ZOOM, 0.8);
    assert.equal(layoutScaleFromWidths(800, 1000), 0.8);
    assert.equal(screenToLocal(80, 0.8), 100);
  });

  it("falls back to an unscaled coordinate system for invalid dimensions", () => {
    assert.equal(layoutScaleFromWidths(0, 1000), 1);
    assert.equal(layoutScaleFromWidths(800, 0), 1);
    assert.equal(screenToLocal(80, 0), 80);
  });

  it("marks only the browser document for compact CSS layout", () => {
    const toggles: Array<[string, boolean]> = [];
    const root = { classList: { toggle: (name: string, enabled: boolean) => toggles.push([name, enabled]) } };

    applyRuntimeBaseline(false, root);
    applyRuntimeBaseline(true, root);

    assert.deepEqual(toggles, [
      ["browser-compact-baseline", true],
      ["browser-compact-baseline", false],
    ]);
  });
});
