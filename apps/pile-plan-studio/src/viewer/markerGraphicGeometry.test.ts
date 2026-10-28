import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDashedOutlineDasharray,
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


describe("compact dashed viewer outlines", () => {
  it("scales compact dashes and gaps with the symbol while preserving line weight", () => {
    for(const baseDash of [2,3]){
      const normal=getDashedOutlineDasharray(0.75,baseDash);
      assert.equal(normal,`${baseDash} ${baseDash}`);
      for(const scale of [0.075,0.15,0.375]){
        const compact=getDashedOutlineDasharray(scale,baseDash);
        const [dash,gap]=compact.split(" ").map(Number);
        assert.ok(Math.abs(dash/scale-baseDash/0.75)<1e-10);
        assert.equal(dash,gap);
      }
    }
  });
  it("retains the existing dash rhythm for normal and larger symbols", () => {
    assert.deepEqual(getDashedOutlineDasharray(1.5,3),getDashedOutlineDasharray(0.75,3));
  });
});
