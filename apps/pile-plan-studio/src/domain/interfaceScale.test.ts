import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_INTERFACE_SCALE,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  normalizeInterfaceScale,
  stepInterfaceScale,
} from "./interfaceScale.ts";

describe("interface scale", () => {
  it("uses the compact baseline as 100 percent", () => {
    assert.equal(DEFAULT_INTERFACE_SCALE, 100);
    assert.equal(normalizeInterfaceScale(undefined), 100);
  });

  it("clamps and snaps values to the supported ten-percent range", () => {
    assert.equal(MIN_INTERFACE_SCALE, 50);
    assert.equal(MAX_INTERFACE_SCALE, 150);
    assert.equal(normalizeInterfaceScale(12), 50);
    assert.equal(normalizeInterfaceScale(176), 150);
    assert.equal(normalizeInterfaceScale(114), 110);
    assert.equal(normalizeInterfaceScale(116), 120);
  });

  it("steps without leaving the supported range", () => {
    assert.equal(stepInterfaceScale(100, 1), 110);
    assert.equal(stepInterfaceScale(100, -1), 90);
    assert.equal(stepInterfaceScale(150, 1), 150);
    assert.equal(stepInterfaceScale(50, -1), 50);
  });
});
