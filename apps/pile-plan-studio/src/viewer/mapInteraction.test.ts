import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldStartMapPan } from "./mapInteraction.ts";

describe("map interaction", () => {
  it("starts panning with the left mouse button on empty map space", () => {
    assert.equal(shouldStartMapPan({ button: 0, targetIsInteractive: false }), true);
  });

  it("does not start panning with the left mouse button on map controls", () => {
    assert.equal(shouldStartMapPan({ button: 0, targetIsInteractive: true }), false);
  });

  it("does not start panning with the right mouse button", () => {
    assert.equal(shouldStartMapPan({ button: 2, targetIsInteractive: false }), false);
  });
});
