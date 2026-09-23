import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LoadPointGroup } from "../core/loadPointGroupContract.ts";
import type { LoadPointTopology } from "../core/tipLevelRegionContract.ts";
import { buildLoadPointGroupGeometry } from "./loadPointGroupGeometry.ts";

const groups: LoadPointGroup[] = [{ load_point_ids: [1, 2, 3] }];
const topology: LoadPointTopology = {
  load_point_ids: [1, 2, 3, 4],
  edges: [
    { from_load_point_id: 1, to_load_point_id: 2 },
    { from_load_point_id: 2, to_load_point_id: 3 },
    { from_load_point_id: 3, to_load_point_id: 4 },
  ],
  faces: [
    { boundary_load_point_ids: [1, 2, 3] },
    { boundary_load_point_ids: [2, 3, 4] },
  ],
};

describe("load-point group geometry", () => {
  it("uses only group members, internal Gabriel edges, and fully owned faces", () => {
    const geometry = buildLoadPointGroupGeometry({
      groups,
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 10 }],
        [2, { x: 30, y: 10 }],
        [3, { x: 30, y: 30 }],
        [4, { x: 10, y: 30 }],
      ]),
      symbolScalePercent: 100,
      selectedLoadPointIds: new Set([2]),
      conflictingLoadPointIds: new Set(),
    });

    assert.equal(geometry.length, 1);
    assert.equal(geometry[0].state, "default");
    assert.equal(geometry[0].isSelectionContext, true);
    assert.equal(geometry[0].diameterPx, 14.5);
    assert.equal(geometry[0].circles[0].radius + 1, 8.25);
    assert.deepEqual(geometry[0].circles.map(({ loadPointId }) => loadPointId), [1, 2, 3]);
    assert.deepEqual(geometry[0].segments.map(({ fromLoadPointId, toLoadPointId }) => (
      [fromLoadPointId, toLoadPointId]
    )), [[1, 2], [2, 3]]);
    assert.deepEqual(geometry[0].faces.map(({ boundaryLoadPointIds }) => boundaryLoadPointIds), [
      [1, 2, 3],
    ]);
  });

  it("does not invent a diagonal across an L-shaped group", () => {
    const [geometry] = buildLoadPointGroupGeometry({
      groups,
      topology: { ...topology, faces: [] },
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 10 }],
        [2, { x: 30, y: 10 }],
        [3, { x: 30, y: 30 }],
      ]),
      symbolScalePercent: 100,
      selectedLoadPointIds: new Set(),
      conflictingLoadPointIds: new Set(),
    });

    assert.deepEqual(geometry.segments.map(({ fromLoadPointId, toLoadPointId }) => (
      [fromLoadPointId, toLoadPointId]
    )), [[1, 2], [2, 3]]);
    assert.deepEqual(geometry.faces, []);
  });

  it("uses one selected contour only when every group member is selected", () => {
    const [geometry] = buildLoadPointGroupGeometry({
      groups,
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 10 }],
        [2, { x: 30, y: 10 }],
        [3, { x: 30, y: 30 }],
      ]),
      symbolScalePercent: 100,
      selectedLoadPointIds: new Set([1, 2, 3]),
      conflictingLoadPointIds: new Set(),
    });

    assert.equal(geometry.state, "selected");
    assert.equal(geometry.isSelectionContext, false);
  });

  it("keeps a partially selected group visible when ordinary group contours are hidden", () => {
    const input = {
      groups,
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 10 }],
        [2, { x: 30, y: 10 }],
        [3, { x: 30, y: 30 }],
      ]),
      symbolScalePercent: 100,
      conflictingLoadPointIds: new Set<number>(),
      showDefaultGroups: false,
    };

    assert.deepEqual(buildLoadPointGroupGeometry({
      ...input,
      selectedLoadPointIds: new Set<number>(),
    }), []);
    assert.equal(buildLoadPointGroupGeometry({
      ...input,
      selectedLoadPointIds: new Set([2]),
    })[0]?.state, "default");
    assert.equal(buildLoadPointGroupGeometry({
      ...input,
      selectedLoadPointIds: new Set([1, 2, 3]),
    })[0]?.state, "selected");
  });

  it("uses the selection contour for a selected conflict while retaining the conflict", () => {
    const geometry = buildLoadPointGroupGeometry({
      groups: [...groups, { load_point_ids: [4] }],
      topology,
      pointsByLoadPointId: new Map([
        [1, { x: 10, y: 10 }],
        [2, { x: 30, y: 10 }],
        [3, { x: 30, y: 30 }],
        [4, { x: 10, y: 30 }],
      ]),
      symbolScalePercent: 200,
      selectedLoadPointIds: new Set([1, 2, 3]),
      conflictingLoadPointIds: new Set([3]),
    });

    assert.equal(geometry.length, 1);
    assert.equal(geometry[0].state, "selected");
    assert.equal(geometry[0].hasConflict, true);
    assert.equal(geometry[0].diameterPx, 25);
  });
});
