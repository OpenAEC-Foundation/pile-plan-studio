import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";

const layers: PresentedTipLevelRegionLayer[] = [{
  pileTipLevelMKey: -18000,
  legendValueM: -18,
  diameterPx: 16.5,
  color: "#4E79A7",
  opacity: 0.25,
  faces: [{
    boundarySiteIds: [1, 2, 3],
    points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 40 }],
  }],
  segments: [{
    fromSiteId: 1,
    toSiteId: 2,
    x1: 10,
    y1: 20,
    x2: 30,
    y2: 20,
  }],
  circles: [
    { siteId: 1, x: 10, y: 20, radius: 8.25 },
    { siteId: 2, x: 30, y: 20, radius: 8.25 },
  ],
}];

describe("tip-level region SVG model", () => {
  it("batches faces, butt-capped edges, and circles into three ordered paths", () => {
    const model = buildTipLevelRegionSvgModel(layers);
    const group = model.groups[0];

    assert.deepEqual({
      key: group.key,
      color: group.color,
      opacity: group.opacity,
    }, {
      key: "tip-level:-18000",
      color: "#4E79A7",
      opacity: 0.25,
    });
    assert.equal(group.facePath, "M 10 20 L 30 20 L 20 40 Z");
    assert.deepEqual(group.edgePath, {
      d: "M 10 20 L 30 20",
      strokeWidth: 16.5,
      strokeLinecap: "butt",
    });
    assert.equal(
      group.nodePath,
      "M 18.25 20 A 8.25 8.25 0 1 0 1.75 20 A 8.25 8.25 0 1 0 18.25 20 Z "
        + "M 38.25 20 A 8.25 8.25 0 1 0 21.75 20 A 8.25 8.25 0 1 0 38.25 20 Z",
    );
    assert.deepEqual(Object.keys(group).slice(-3), ["facePath", "edgePath", "nodePath"]);
  });
});
