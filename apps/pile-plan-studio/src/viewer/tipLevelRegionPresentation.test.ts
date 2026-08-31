import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LegendItems } from "../core/projectTypes.ts";
import type { TipLevelRegionGeometryLayer } from "./tipLevelRegionGeometry.ts";
import { presentTipLevelRegionGeometry } from "./tipLevelRegionPresentation.ts";

const legend: LegendItems = {
  encodingMode: "size-symbol",
  colorScheme: "tableau-extended",
  pileSizes: [],
  pileTipLevels: [
    { value: -20, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#202020", symbolAutomatic: true, colorAutomatic: true },
    { value: -10, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#101010", symbolAutomatic: true, colorAutomatic: true },
    { value: -15, symbol: { baseShape: "circle", fillPattern: "full" }, color: "#151515", symbolAutomatic: true, colorAutomatic: true },
  ],
};

function layer(legendValueM: number): TipLevelRegionGeometryLayer {
  return {
    pileTipLevelMKey: legendValueM * 1000,
    legendValueM,
    diameterPx: 18.5,
    faces: [],
    circles: [],
    segments: [],
  };
}

describe("tip-level region presentation", () => {
  it("maps exact legend colors and orders shallow PPN layers before deep layers", () => {
    const presented = presentTipLevelRegionGeometry([
      layer(-20),
      layer(-10),
      layer(-15),
    ], legend);

    assert.deepEqual(presented.map(({ legendValueM, color, opacity }) => ({
      legendValueM,
      color,
      opacity,
    })), [
      { legendValueM: -10, color: "#101010", opacity: 0.25 },
      { legendValueM: -15, color: "#151515", opacity: 0.25 },
      { legendValueM: -20, color: "#202020", opacity: 0.25 },
    ]);
  });

  it("omits geometry without an exact PPN legend entry", () => {
    const presented = presentTipLevelRegionGeometry([
      layer(-15),
      layer(-15.0004),
    ], legend);

    assert.deepEqual(presented.map(({ legendValueM }) => legendValueM), [-15]);
  });
});
