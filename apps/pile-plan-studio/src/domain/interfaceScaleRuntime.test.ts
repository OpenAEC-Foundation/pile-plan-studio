import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applicationScaleFactor,
  applyDesktopInterfaceScale,
  loadInterfaceScale,
  saveInterfaceScale,
} from "./interfaceScaleRuntime.ts";

describe("interface scale runtime", () => {
  it("maps the logical percentage to a relative WebView factor", () => {
    assert.equal(applicationScaleFactor(50), 0.5);
    assert.equal(applicationScaleFactor(100), 1);
    assert.equal(applicationScaleFactor(114), 1.1);
    assert.equal(applicationScaleFactor(150), 1.5);
  });

  it("normalizes a stored preference and persists normalized values", async () => {
    const saved: Array<[string, number]> = [];
    assert.equal(await loadInterfaceScale({
      getSetting: async () => 147,
    }), 150);
    await saveInterfaceScale(73, {
      setSetting: async (key, value) => { saved.push([key, value]); },
    });
    assert.deepEqual(saved, [["interface-scale-percent", 70]]);
  });

  it("applies normalized native zoom only in the desktop runtime", async () => {
    const factors: number[] = [];
    assert.equal(await applyDesktopInterfaceScale(114, {
      isDesktop: true,
      setZoom: async (factor) => { factors.push(factor); },
    }), true);
    assert.deepEqual(factors, [1.1]);

    assert.equal(await applyDesktopInterfaceScale(80, {
      isDesktop: false,
      setZoom: async (factor) => { factors.push(factor); },
    }), false);
    assert.deepEqual(factors, [1.1]);
  });
});
