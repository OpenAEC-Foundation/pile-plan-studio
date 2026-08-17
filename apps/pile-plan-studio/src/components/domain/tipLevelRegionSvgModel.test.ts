import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";

const layers: PresentedTipLevelRegionLayer[] = [{
  pileTipLevelMKey: -18000,
  legendValueM: -18,
  diameterPx: 18.5,
  color: "#4E79A7",
  opacity: 0.25,
  segments: [{
    fromLoadPointId: 9,
    toLoadPointId: 2,
    x1: 30,
    y1: 20,
    x2: 10,
    y2: 20,
  }],
  circles: [
    { loadPointId: 9, x: 30, y: 20, radius: 9.25 },
    { loadPointId: 2, x: 10, y: 20, radius: 9.25 },
  ],
}];

describe("tip-level region SVG model", () => {
  it("puts opacity on the PPN group and emits rounded lines before circles", () => {
    const model = buildTipLevelRegionSvgModel(layers);

    assert.equal(model.className, "tip-level-region-overlay");
    assert.equal(model.ariaHidden, true);
    assert.equal(model.groups.length, 1);
    assert.deepEqual({
      key: model.groups[0].key,
      fill: model.groups[0].fill,
      stroke: model.groups[0].stroke,
      opacity: model.groups[0].opacity,
    }, {
      key: "tip-level:-18000",
      fill: "#4E79A7",
      stroke: "#4E79A7",
      opacity: 0.25,
    });
    assert.deepEqual(model.groups[0].lines, [{
      key: "segment:2:9",
      x1: 30,
      y1: 20,
      x2: 10,
      y2: 20,
      strokeWidth: 18.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }]);
    assert.deepEqual(model.groups[0].circles, [
      { key: "circle:9", cx: 30, cy: 20, r: 9.25 },
      { key: "circle:2", cx: 10, cy: 20, r: 9.25 },
    ]);
    assert.equal(Object.hasOwn(model.groups[0].lines[0], "opacity"), false);
    assert.equal(Object.hasOwn(model.groups[0].circles[0], "opacity"), false);
    assert.deepEqual(Object.keys(model.groups[0]).slice(-2), ["lines", "circles"]);
  });
});
