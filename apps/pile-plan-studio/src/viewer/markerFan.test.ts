import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getClosestVisibleMarkerKey,
  getLoadPointVisualRadius,
  getMagnifiedMarkerOffsets,
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

  it("keeps the hovered marker fixed and moves neighbours away in their relative directions", () => {
    const offsets = getMagnifiedMarkerOffsets([
      { key: "left", x: 10, y: 20 },
      { key: "middle", x: 14, y: 20 },
      { key: "upper-right", x: 18, y: 16 },
    ], 28, "middle", 10);

    const left = offsets.find((offset) => offset.key === "left")!;
    const middle = offsets.find((offset) => offset.key === "middle")!;
    const upperRight = offsets.find((offset) => offset.key === "upper-right")!;

    assert.deepEqual(middle, { key: "middle", x: 0, y: 0 });
    assert.ok(left.x < 0);
    assert.ok(upperRight.x > 0);
    assert.ok(upperRight.y < 0);
    assert.ok(Math.hypot(middle.x - left.x, middle.y - left.y) >= 28);
  });

  it("separates markers whose source positions are exactly equal", () => {
    const offsets = getMagnifiedMarkerOffsets([
      { key: "load-point:1", x: 10, y: 20 },
      { key: "cpt:2", x: 10, y: 20 },
    ], 28, "load-point:1");

    assert.equal(offsets.length, 2);
    assert.deepEqual(offsets[0], { key: "load-point:1", x: 0, y: 0 });
    assert.ok(Math.hypot(offsets[0].x - offsets[1].x, offsets[0].y - offsets[1].y) >= 28);
  });

  it("makes the magnified symbol larger than its current screen size", () => {
    assert.equal(getMagnifiedMarkerSize(42, 39), 54.6);
    assert.equal(getMagnifiedMarkerSize(10, 10), 24);
  });
});
