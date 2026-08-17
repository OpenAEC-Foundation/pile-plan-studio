import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TipLevelRegionTopology } from "../core/spatialTopologyContract.ts";
import { buildTipLevelRegionGeometry } from "./tipLevelRegionGeometry.ts";

describe("tip-level region geometry", () => {
  it("builds circles and a capsule segment at the shared marker scale", () => {
    const topology: TipLevelRegionTopology = {
      groups: [{
        pile_tip_level_m_key: -18000,
        legend_value_m: -18,
        components: [{
          load_point_ids: [1, 2],
          edges: [{ from_load_point_id: 1, to_load_point_id: 2 }],
        }],
      }],
    };

    const geometry = buildTipLevelRegionGeometry({
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 20 }],
        [2, { x: 30, y: 20 }],
      ]),
      symbolScalePercent: 100,
    });

    assert.equal(geometry[0].diameterPx, 18.5);
    assert.deepEqual(geometry[0].circles, [
      { loadPointId: 1, x: 10, y: 20, radius: 9.25 },
      { loadPointId: 2, x: 30, y: 20, radius: 9.25 },
    ]);
    assert.deepEqual(geometry[0].segments, [{
      fromLoadPointId: 1,
      toLoadPointId: 2,
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 20,
    }]);
  });

  it("keeps an isolated eligible node as one circle", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology: {
        groups: [{
          pile_tip_level_m_key: -12000,
          legend_value_m: -12,
          components: [{ load_point_ids: [7], edges: [] }],
        }],
      },
      pointsByLoadPointId: new Map([[7, { x: 4.5, y: 8.25 }]]),
      symbolScalePercent: 200,
    });

    assert.deepEqual(geometry[0].circles, [
      { loadPointId: 7, x: 4.5, y: 8.25, radius: 14.5 },
    ]);
    assert.deepEqual(geometry[0].segments, []);
  });

  it("excludes missing projected nodes and edges without both endpoints", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology: {
        groups: [{
          pile_tip_level_m_key: -18000,
          legend_value_m: -18,
          components: [{
            load_point_ids: [1, 2, 3],
            edges: [
              { from_load_point_id: 1, to_load_point_id: 2 },
              { from_load_point_id: 2, to_load_point_id: 3 },
            ],
          }],
        }],
      },
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 20 }],
        [3, { x: 50, y: 20 }],
      ]),
      symbolScalePercent: 100,
    });

    assert.deepEqual(geometry[0].circles.map(({ loadPointId }) => loadPointId), [1, 3]);
    assert.deepEqual(geometry[0].segments, []);
  });

  it("preserves deterministic core component order and emits no face primitives", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology: {
        groups: [{
          pile_tip_level_m_key: -15000,
          legend_value_m: -15,
          components: [
            { load_point_ids: [1, 2], edges: [] },
            { load_point_ids: [8], edges: [] },
          ],
        }],
      },
      pointsByLoadPointId: new Map([
        [1, { x: 1, y: 1 }],
        [2, { x: 2, y: 2 }],
        [8, { x: 8, y: 8 }],
      ]),
      symbolScalePercent: 100,
    });

    assert.deepEqual(geometry[0].circles.map(({ loadPointId }) => loadPointId), [1, 2, 8]);
    assert.deepEqual(Object.keys(geometry[0]).sort(), [
      "circles",
      "diameterPx",
      "legendValueM",
      "pileTipLevelMKey",
      "segments",
    ]);
  });
});
