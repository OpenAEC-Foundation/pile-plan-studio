import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getClosestVisibleMarkerKey,
  getCompactRingOffsets,
  getLoadPointVisualRadius,
  getMagnifiedMarkerSize,
  getOverlappingMarkerKeys,
} from "./markerFan.ts";

describe("marker fan-out", () => {
  it("resolves the CPT 54 case to the closest visible load point", () => {
    const markers = [
      { key: "load-point:224", left: 359.44, top: 388.84, right: 373.44, bottom: 402.84, visualRadius: 5.66 },
      { key: "load-point:226", left: 359.44, top: 385.39, right: 373.44, bottom: 399.39, visualRadius: 5.66 },
      { key: "load-point:296", left: 401.86, top: 388.84, right: 415.86, bottom: 402.84, visualRadius: 5.66 },
    ];

    assert.equal(
      getClosestVisibleMarkerKey({ x: 366.44, y: 395.84 }, "load-point:296", markers),
      "load-point:224",
    );
  });

  it("uses the visible pile shape instead of the larger click target for overlap", () => {
    assert.equal(getLoadPointVisualRadius(12), 4.85);
  });

  it("returns only markers that directly overlap the clicked marker", () => {
    const markers = [
      { key: "load-point:695", left: 0, top: 0, right: 14, bottom: 14, visualRadius: 6 },
      { key: "load-point:654", left: 5, top: 0, right: 19, bottom: 14, visualRadius: 6 },
      { key: "cpt:12", left: 10, top: 0, right: 25, bottom: 13, visualRadius: 6.5 },
      { key: "load-point:700", left: 50, top: 50, right: 64, bottom: 64, visualRadius: 6 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:695", markers), [
      "load-point:695",
      "load-point:654",
    ]);
  });

  it("requires one marker center to cross inside the other marker radius", () => {
    const markers = [
      { key: "load-point:1", left: 0, top: 0, right: 14, bottom: 14, visualRadius: 6 },
      { key: "load-point:2", left: 6, top: 0, right: 20, bottom: 14, visualRadius: 6 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:1", markers), ["load-point:1"]);
  });

  it("returns only the clicked marker when it is visually separate", () => {
    const markers = [
      { key: "load-point:1", left: 0, top: 0, right: 14, bottom: 14, visualRadius: 6 },
      { key: "cpt:2", left: 20, top: 20, right: 35, bottom: 33, visualRadius: 6.5 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:1", markers), ["load-point:1"]);
  });

  it("rejects a broad-phase rectangle overlap when visible radii do not touch", () => {
    const markers = [
      { key: "load-point:1", left: 0, top: 0, right: 14, bottom: 14, visualRadius: 5 },
      { key: "load-point:2", left: 10, top: 10, right: 24, bottom: 24, visualRadius: 5 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:1", markers), ["load-point:1"]);
  });

  it("does not fan out markers that only touch within antialiasing tolerance", () => {
    const markers = [
      { key: "load-point:1", left: 0, top: 0, right: 14, bottom: 14, visualRadius: 5 },
      { key: "load-point:2", left: 9.5, top: 0, right: 23.5, bottom: 14, visualRadius: 5 },
    ];

    assert.deepEqual(getOverlappingMarkerKeys("load-point:1", markers), ["load-point:1"]);
  });

  it("keeps the hovered marker fixed and packs neighbours on a compact ring", () => {
    const offsets = getCompactRingOffsets([
      { key: "anchor", x: 10, y: 20, radius: 15 },
      { key: "near", x: 11, y: 20, radius: 12 },
      { key: "far", x: 18, y: 20, radius: 12 },
    ], "anchor", 1.1);

    const anchor = offsets.find((offset) => offset.key === "anchor")!;
    const near = offsets.find((offset) => offset.key === "near")!;
    const far = offsets.find((offset) => offset.key === "far")!;

    assert.deepEqual(anchor, { key: "anchor", x: 0, y: 0 });
    assert.ok(Math.abs(Math.hypot(near.x, near.y) - Math.hypot(far.x, far.y)) < 0.001);
    assert.ok(Math.hypot(near.x, near.y) >= (15 + 12) * 1.1);
    assert.ok(Math.hypot(near.x - far.x, near.y - far.y) >= (12 + 12) * 1.1);
  });

  it("separates markers whose source positions are exactly equal", () => {
    const offsets = getCompactRingOffsets([
      { key: "load-point:1", x: 10, y: 20, radius: 14 },
      { key: "cpt:2", x: 10, y: 20, radius: 14 },
    ], "load-point:1", 1.1);

    assert.equal(offsets.length, 2);
    assert.deepEqual(offsets[0], { key: "load-point:1", x: 0, y: 0 });
    assert.ok(Math.hypot(offsets[0].x - offsets[1].x, offsets[0].y - offsets[1].y) >= 30.8);
  });

  it("makes the magnified symbol larger than its current screen size", () => {
    assert.equal(getMagnifiedMarkerSize(42, 39), 54.6);
    assert.equal(getMagnifiedMarkerSize(10, 10), 24);
  });
});
