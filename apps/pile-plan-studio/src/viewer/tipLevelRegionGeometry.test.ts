import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TipLevelRegionTopology } from "../core/spatialTopologyContract.ts";
import {
  buildTipLevelRegionGeometry,
  projectTipLevelRegionPoints,
} from "./tipLevelRegionGeometry.ts";

const topology: TipLevelRegionTopology = {
  groups: [{
    pile_tip_level_mm: -18000,
    legend_value_m: -18,
    site_ids: [1, 2, 3],
    edges: [
      { from_site_id: 1, to_site_id: 2 },
      { from_site_id: 2, to_site_id: 3 },
    ],
    faces: [{ boundary_site_ids: [1, 2, 3] }],
  }],
};

describe("tip-level region geometry", () => {
  it("projects fractional load-point coordinates without rounding", () => {
    const projected = projectTipLevelRegionPoints([{
      id: 9,
      name: "fractional",
      x_mm: 112.5,
      y_mm: 737.25,
      design_load_kn: 500,
    }], {
      bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      canvasSize: { width: 500, height: 400 },
      pixelsPerMillimeter: 0.2,
      projectCenterPx: { x: 250, y: 200 },
    });

    assert.deepEqual(projected, new Map([[9, { x: 172.5, y: 152.55 }]]));
  });

  it("builds faces, stroke inputs, and site circles with six pixels total margin", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology,
      pointsBySiteId: new Map([
        [1, { x: 10, y: 20 }],
        [2, { x: 30, y: 20 }],
        [3, { x: 20, y: 40 }],
      ]),
      symbolScalePercent: 100,
    });

    assert.equal(geometry[0].diameterPx, 16.5);
    assert.deepEqual(geometry[0].circles, [
      { siteId: 1, x: 10, y: 20, radius: 8.25 },
      { siteId: 2, x: 30, y: 20, radius: 8.25 },
      { siteId: 3, x: 20, y: 40, radius: 8.25 },
    ]);
    assert.deepEqual(geometry[0].segments, [{
      fromSiteId: 1,
      toSiteId: 2,
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 20,
    }, {
      fromSiteId: 2,
      toSiteId: 3,
      x1: 30,
      y1: 20,
      x2: 20,
      y2: 40,
    }]);
    assert.deepEqual(geometry[0].faces, [{
      boundarySiteIds: [1, 2, 3],
      points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 40 }],
    }]);
  });

  it("keeps projected sites and edges but drops a face with a missing boundary point", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology,
      pointsBySiteId: new Map([
        [1, { x: 10, y: 20 }],
        [2, { x: 30, y: 20 }],
      ]),
      symbolScalePercent: 200,
    });

    assert.equal(geometry[0].diameterPx, 27);
    assert.deepEqual(geometry[0].circles.map(({ siteId }) => siteId), [1, 2]);
    assert.equal(geometry[0].segments.length, 1);
    assert.deepEqual(geometry[0].faces, []);
  });
});
