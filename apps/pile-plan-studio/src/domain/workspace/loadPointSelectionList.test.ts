import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoadPoint } from "../../core/projectTypes.ts";
import { buildLoadPointSelectionBlocks, resolveLoadPointSelectionContext } from "./loadPointSelectionList.ts";

const point = (id: number): LoadPoint => ({ id, name: `Load point ${id}`, x_mm: 0, y_mm: 0, design_load_kn: id * 10 });

describe("selected load point display blocks", () => {
  it("retains the multiselection while inspecting members and navigates in displayed group order", () => {
    const points = [1, 4, 7, 2, 5, 3, 8].map(point);
    const groups = [{ load_point_ids: [3, 1, 2] }, { load_point_ids: [5, 4] }];
    const context = resolveLoadPointSelectionContext(points, [1, 4, 7], groups, []);
    assert.deepEqual(context, [1, 2, 3, 4, 5, 7]);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [3], groups, context), context);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [4, 5], groups, context), context);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [8], groups, context), [8]);
    assert.deepEqual(resolveLoadPointSelectionContext(points, [], groups, context), []);
    assert.deepEqual(resolveLoadPointSelectionContext(points.filter(p => p.id !== 3), [1], groups, context), [1, 2, 4, 5, 7]);
  });
  it("keeps interleaved core groups together without omitting loose points or mutating inputs", () => {
    const points = [1, 4, 7, 2, 5, 3, 8].map(point);
    const groups = [{ load_point_ids: [3, 1, 2] }, { load_point_ids: [5, 4] }, { load_point_ids: [7] }];
    const before = structuredClone({ points, groups });
    const blocks = buildLoadPointSelectionBlocks(points, points.map(({ id }) => id), groups);
    assert.deepEqual(blocks.map(block => block.loadPoints.map(({ id }) => id)), [[1, 2, 3], [4, 5], [7], [8]]);
    assert.deepEqual(blocks.map(block => block.groupLoadPointIds), [[3, 1, 2], [5, 4], null, null]);
    assert.equal(blocks[0].loadPoints[0], points[0]);
    assert.deepEqual({ points, groups }, before);
  });

  it("includes the entire core group as context without adding unrelated groups", () => {
    const blocks = buildLoadPointSelectionBlocks([1, 2, 3, 4, 5].map(point), [2], [
      { load_point_ids: [1, 2, 3] }, { load_point_ids: [4, 5] },
    ]);
    assert.deepEqual(blocks.map(block => ({ ids: block.loadPoints.map(({ id }) => id), group: block.groupLoadPointIds })),
      [{ ids: [1, 2, 3], group: [1, 2, 3] }]);
  });

  it("preserves ungrouped project order and handles an empty selection", () => {
    assert.deepEqual(buildLoadPointSelectionBlocks([point(4), point(1)], [1, 4], []).map(block => block.loadPoints[0].id), [4, 1]);
    assert.deepEqual(buildLoadPointSelectionBlocks([], [], [{ load_point_ids: [1, 2] }]), []);
  });
});
