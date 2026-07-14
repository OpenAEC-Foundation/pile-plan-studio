import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getFanOffsets, getOverlappingMarkerKeys } from "./markerFan.ts";

describe("marker fan-out", () => {
  it("returns the connected overlap group for the clicked marker", () => {
    const markers = [
      { key: "load-point:695", left: 0, top: 0, right: 14, bottom: 14 },
      { key: "load-point:654", left: 10, top: 0, right: 24, bottom: 14 },
      { key: "cpt:12", left: 20, top: 0, right: 35, bottom: 13 },
      { key: "load-point:700", left: 50, top: 50, right: 64, bottom: 64 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:695", markers), [
      "load-point:695",
      "load-point:654",
      "cpt:12",
    ]);
  });

  it("returns only the clicked marker when it is visually separate", () => {
    const markers = [
      { key: "load-point:1", left: 0, top: 0, right: 14, bottom: 14 },
      { key: "cpt:2", left: 20, top: 20, right: 35, bottom: 33 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:1", markers), ["load-point:1"]);
  });

  it("places every fanned marker at a distinct radial offset", () => {
    const offsets = getFanOffsets(4, 28);

    assert.equal(offsets.length, 4);
    assert.equal(new Set(offsets.map(({ x, y }) => `${x.toFixed(3)}|${y.toFixed(3)}`)).size, 4);
    for (const offset of offsets) {
      assert.ok(Math.abs(Math.hypot(offset.x, offset.y) - 28) < 0.001);
    }
  });
});
