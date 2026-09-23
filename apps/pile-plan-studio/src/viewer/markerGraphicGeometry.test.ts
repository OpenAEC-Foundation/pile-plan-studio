import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCptRingRadius,
  getCptSymbolScale,
  getLoadPointRingRadius,
  getMarkerDrawPriority,
  getMarkerHitDiameter,
} from "./markerGraphicGeometry.ts";

describe("shared marker graphic geometry", () => {
  it("keeps selected load point and CPT rings at the existing outer radii", () => {
    assert.equal(getLoadPointRingRadius(100), 7.75);
    assert.equal(getCptRingRadius(100), 8.125);
    assert.equal(getLoadPointRingRadius(200), 13);
  });

  it("aligns the group contour and selected ring outer edges", () => {
    assert.equal(getLoadPointRingRadius(100) + 0.5, 8.25);
  });

  it("makes transparent hit boxes cover the visible ring", () => {
    assert.equal(getMarkerHitDiameter("load-point", 100, true), 16.5);
    assert.equal(getMarkerHitDiameter("cpt", 100, true), 17.25);
    assert.equal(getMarkerHitDiameter("load-point", 100, false), 10.5);
  });

  it("keeps the CPT viewBox uniformly scaled inside its 15 by 13 marker box", () => {
    assert.equal(getCptSymbolScale(0.75), 9.75 / 22);
  });

  it("draws selected, raised and hovered markers above ordinary foreground markers", () => {
    assert.equal(getMarkerDrawPriority({ kind: "cpt", foregroundLayer: "load-points", selected: true, raised: false, hovered: false }), 30);
    assert.equal(getMarkerDrawPriority({ kind: "load-point", foregroundLayer: "cpts", selected: false, raised: false, hovered: true }), 50);
    assert.equal(getMarkerDrawPriority({ kind: "load-point", foregroundLayer: "cpts", selected: false, raised: false, hovered: false }), 10);
    assert.equal(getMarkerDrawPriority({ kind: "cpt", foregroundLayer: "cpts", selected: false, raised: false, hovered: false }), 20);
  });
});
