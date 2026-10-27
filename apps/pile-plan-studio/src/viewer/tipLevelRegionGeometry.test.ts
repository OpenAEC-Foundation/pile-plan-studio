import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TipLevelRegionTopology } from "../core/tipLevelRegionContract.ts";
import type { ProjectedPileCap } from "./pileCapProposalGeometry.ts";
import {
  buildTipLevelRegionGeometry,
  projectTipLevelRegionPoints,
} from "./tipLevelRegionGeometry.ts";

const topology: TipLevelRegionTopology = {
  groups: [{
    pile_tip_level_mm: -18000,
    legend_value_m: -18,
    load_point_ids: [1, 2, 3],
    edges: [
      { from_load_point_id: 1, to_load_point_id: 2 },
      { from_load_point_id: 2, to_load_point_id: 3 },
    ],
    faces: [{ boundary_load_point_ids: [1, 2, 3] }],
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

  it("builds faces, stroke inputs, and load-point circles with six pixels total margin", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 20 }],
        [2, { x: 30, y: 20 }],
        [3, { x: 20, y: 40 }],
      ]),
      symbolScalePercent: 100,
    });

    assert.equal(geometry[0].diameterPx, 16.5);
    assert.deepEqual(geometry[0].circles, [
      { loadPointId: 1, x: 10, y: 20, radius: 8.25 },
      { loadPointId: 2, x: 30, y: 20, radius: 8.25 },
      { loadPointId: 3, x: 20, y: 40, radius: 8.25 },
    ]);
    assert.deepEqual(geometry[0].segments, [{
      fromLoadPointId: 1,
      toLoadPointId: 2,
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 20,
    }, {
      fromLoadPointId: 2,
      toLoadPointId: 3,
      x1: 30,
      y1: 20,
      x2: 20,
      y2: 40,
    }]);
    assert.deepEqual(geometry[0].faces, [{
      boundaryLoadPointIds: [1, 2, 3],
      points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 40 }],
    }]);
  });

  it("keeps projected load points and edges but drops a face with a missing boundary point", () => {
    const geometry = buildTipLevelRegionGeometry({
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 20 }],
        [2, { x: 30, y: 20 }],
      ]),
      symbolScalePercent: 200,
    });

    assert.equal(geometry[0].diameterPx, 27);
    assert.deepEqual(geometry[0].circles.map(({ loadPointId }) => loadPointId), [1, 2]);
    assert.equal(geometry[0].segments.length, 1);
    assert.deepEqual(geometry[0].faces, []);
  });
});

function proposalLayout(points: { x: number; y: number }[]): ProjectedPileCap {
  return {
    sourceIds: [1, 2], points, bounds: { x: 0, y: 0, width: 40, height: 40 }, crowded: false,
    preview: {
      proposal: { load_point_ids: [1, 2], pile_count: points.length, quarter_turns: 0,
        configuration: { pile_size_mm: 320, pile_tip_level_mm: -18000 } },
      status: "active", center: { x_mm: 0, y_mm: 0 }, positions: [], options: [], cpt_ids: [],
      missing_selection_load_point_ids: [], total_load_kn: 1000, load_per_pile_kn: 500,
    },
  };
}

it("region geometry replaces original cap nodes with all displayed proposal positions", () => {
  const pointsByLoadPointId = new Map([[1, { x: 10, y: 20 }], [2, { x: 30, y: 20 }], [3, { x: 20, y: 60 }]]);
  const points = [{ x: 0, y: 20 }, { x: 20, y: 20 }, { x: 40, y: 20 }];
  const [layer] = buildTipLevelRegionGeometry({ topology, pointsByLoadPointId, symbolScalePercent: 100,
    pileCapLayouts: [proposalLayout(points)] });
  assert.deepEqual(layer.circles.map(({ x, y }) => ({ x, y })), [{ x: 20, y: 60 }, ...points]);
  assert.ok(layer.segments.every(s => [s.x1, s.x2].every(x => x !== 10 && x !== 30)), "old cap endpoints are removed from connections");
  assert.deepEqual([...pointsByLoadPointId.values()], [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 20, y: 60 }]);
});

it("region geometry follows shrinking and rotated cap positions without leaving old nodes", () => {
  const pointsByLoadPointId = new Map([[1, { x: 10, y: 20 }], [2, { x: 30, y: 20 }], [3, { x: 20, y: 60 }]]);
  for (const points of [[{ x: 20, y: 20 }], [{ x: 20, y: 0 }, { x: 20, y: 20 }, { x: 20, y: 40 }]]) {
    const [layer] = buildTipLevelRegionGeometry({ topology, pointsByLoadPointId, symbolScalePercent: 100,
      pileCapLayouts: [proposalLayout(points)] });
    assert.deepEqual(layer.circles.map(({ x, y }) => ({ x, y })), [{ x: 20, y: 60 }, ...points]);
    assert.ok(layer.segments.every(s => s.x1 === 20 && s.x2 === 20));
  }
});

it("proposal footprints do not override the core's tip-level region eligibility", () => {
  const pointsByLoadPointId = new Map([[1, { x: 10, y: 20 }], [2, { x: 30, y: 20 }], [3, { x: 20, y: 60 }]]);
  const cap = proposalLayout([{ x: 0, y: 0 }]);
  cap.preview.proposal.configuration!.pile_tip_level_mm = -19000;
  const ordinary = buildTipLevelRegionGeometry({ topology, pointsByLoadPointId, symbolScalePercent: 100 });
  assert.deepEqual(buildTipLevelRegionGeometry({ topology, pointsByLoadPointId, symbolScalePercent: 100,
    pileCapLayouts: [cap] }), ordinary);
});

it("a twenty-pile region fills the large grid footprint with a simple outside boundary", () => {
  const points = Array.from({ length: 20 }, (_, i) => ({ x: (i % 5) * 10, y: Math.floor(i / 5) * 10 }));
  const [layer] = buildTipLevelRegionGeometry({
    topology: { groups: [{ ...topology.groups[0], edges: [], faces: [] }] },
    pointsByLoadPointId: new Map([[1, { x: 10, y: 20 }], [2, { x: 30, y: 20 }]]),
    symbolScalePercent: 100, pileCapLayouts: [proposalLayout(points)],
  });
  assert.equal(layer.circles.length, 20);
  assert.equal(layer.faces.length, 1);
  assert.equal(layer.faces[0].points.length, 4);
  assert.ok(layer.segments.every(s => (s.x1 === s.x2 && [0, 40].includes(s.x1))
    || (s.y1 === s.y2 && [0, 30].includes(s.y1))));
});
