import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyDesktopInterfaceScale,
  loadInterfaceScale,
  saveInterfaceScale,
} from "./interfaceScaleRuntime.ts";

describe("interface scale runtime", () => {
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
    assert.deepEqual(factors, [0.88]);

    assert.equal(await applyDesktopInterfaceScale(80, {
      isDesktop: false,
      setZoom: async (factor) => { factors.push(factor); },
    }), false);
    assert.deepEqual(factors, [0.88]);
  });
});
