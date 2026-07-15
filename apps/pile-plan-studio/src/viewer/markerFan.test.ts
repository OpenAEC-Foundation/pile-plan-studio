import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getClosestVisibleMarkerKey,
  getLoadPointVisualRadius,
  getOverlappingMarkerKeys,
  getSeparatedMarkerOffsets,
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

  it("keeps the anchor fixed and minimally separates markers along their source directions", () => {
    const offsets = getSeparatedMarkerOffsets([
      { key: "anchor", x: 10, y: 20, radius: 5 },
      { key: "right", x: 11, y: 20, radius: 5 },
      { key: "lower-right", x: 12, y: 22, radius: 5 },
    ], "anchor", 1.1);

    const anchor = offsets.find((offset) => offset.key === "anchor")!;
    const right = offsets.find((offset) => offset.key === "right")!;
    const lowerRight = offsets.find((offset) => offset.key === "lower-right")!;

    assert.deepEqual(anchor, { key: "anchor", x: 0, y: 0 });
    assert.equal(right.y, 0);
    assert.ok(right.x > 0);
    assert.ok(Math.abs(lowerRight.x - lowerRight.y) < 0.001);
    assert.ok(lowerRight.x > 0);
    assert.ok(Math.hypot(right.x, right.y) >= 5.5);
    assert.ok(Math.hypot(lowerRight.x, lowerRight.y) >= 5.5);
    assert.ok(Math.hypot(right.x - lowerRight.x, right.y - lowerRight.y) >= 5.5);
    assert.ok(Math.max(Math.hypot(right.x, right.y), Math.hypot(lowerRight.x, lowerRight.y)) < 12);
  });

  it("separates markers whose source positions are exactly equal", () => {
    const offsets = getSeparatedMarkerOffsets([
      { key: "load-point:1", x: 10, y: 20, radius: 5 },
      { key: "cpt:2", x: 10, y: 20, radius: 5 },
    ], "load-point:1", 1.1);

    assert.equal(offsets.length, 2);
    assert.deepEqual(offsets[0], { key: "load-point:1", x: 0, y: 0 });
    assert.ok(Math.hypot(offsets[0].x - offsets[1].x, offsets[0].y - offsets[1].y) >= 5.5);
  });
});
