import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectViewTransform,
  projectPointPixels,
} from "./viewerGeometry.ts";
import { projectPileCapPreviews } from "./pileCapProposalGeometry.ts";
import type { PileCapPreview } from "../core/pileCapProposalTypes.ts";
import { effectiveSymbolScale } from "./hoverCandidates.ts";
const preview = {
  proposal: {
    load_point_ids: [1, 2],
    pile_count: 3,
    quarter_turns: 0,
    configuration: null,
  },
  status: "active",
  center: { x_mm: 550, y_mm: 0 },
  positions: [
    { x_mm: -550, y_mm: 0 },
    { x_mm: 550, y_mm: 0 },
    { x_mm: 1650, y_mm: 0 },
  ],
  options: [],
  cpt_ids: [],
  missing_selection_load_point_ids: [],
  total_load_kn: 1200,
  load_per_pile_kn: 400,
} satisfies PileCapPreview;
test("schematic projection keeps the center and does not mutate world positions", () => {
  const transform = createProjectViewTransform(
    { minX: -5000, maxX: 5000, minY: -5000, maxY: 5000 },
    { width: 800, height: 600 },
  );
  const original = structuredClone(preview.positions);
  const [result] = projectPileCapPreviews([preview], [], transform, 100);
  const center = projectPointPixels(preview.center, transform);
  assert.equal(result.points.length, 3);
  assert.ok(
    Math.abs(result.points.reduce((s, p) => s + p.x, 0) / 3 - center.x) < 1e-9,
  );
  assert.deepEqual(preview.positions, original);
});
test("external neighbors shrink the complete pattern; original members are excluded", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 10000, minY: 0, maxY: 10000 },
    { width: 800, height: 600 },
  );
  const own = [
    { id: 1, x_mm: 0, y_mm: 0 },
    { id: 2, x_mm: 1100, y_mm: 0 },
  ];
  const [free] = projectPileCapPreviews([preview], own, transform, 100);
  const [tight] = projectPileCapPreviews(
    [preview],
    [...own, { id: 3, x_mm: 900, y_mm: 0 }],
    transform,
    100,
  );
  assert.ok(
    tight.points[2].x - tight.points[0].x < free.points[2].x - free.points[0].x,
  );
  assert.deepEqual(tight.sourceIds, [1, 2]);
});
test("inactive groups produce no hypothetical markers", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    { width: 800, height: 600 },
  );
  assert.deepEqual(
    projectPileCapPreviews(
      [{ ...preview, status: "group_changed" }],
      [],
      transform,
      100,
    ),
    [],
  );
});

test("symbol-based schematic spacing never enlarges the original projected pattern", () => {
  for (const extent of [10000, 100000]) {
    const transform = createProjectViewTransform(
      { minX: 0, maxX: extent, minY: 0, maxY: extent },
      { width: 800, height: 600 },
    );
    const [small] = projectPileCapPreviews([preview], [], transform, 50);
    const [large] = projectPileCapPreviews([preview], [], transform, 100);
    assert.ok(large.bounds.width <= 45);
    const originalStep = 1100 * transform.pixelsPerMillimeter;
    for (const cap of [small, large]) {
      assert.ok(cap.points[1].x - cap.points[0].x <= originalStep + 1e-8);
    }
  }
});

test("adjacent cap contours and symbols fit without overlapping at multiple symbol sizes", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 30000, minY: 0, maxY: 30000 },
    { width: 800, height: 600 },
  );
  for (const size of [50, 100, 200]) {
    const distance = 52 * effectiveSymbolScale(size) / transform.pixelsPerMillimeter;
    const neighbor = { ...preview,
      proposal: { ...preview.proposal, load_point_ids: [3, 4] },
      center: { x_mm: preview.center.x_mm + distance, y_mm: 0 },
      positions: preview.positions.map(p => ({ ...p, x_mm: p.x_mm + distance })),
    };
    const [left, right] = projectPileCapPreviews([preview, neighbor], [], transform, size);
    assert.ok(left.bounds.x + left.bounds.width < right.bounds.x);
    for (const cap of [left, right]) {
      const center = projectPointPixels(cap.preview.center, transform);
      assert.ok(Math.abs(cap.points[1].x - center.x) < 1e-8);
    }
  }
});

test("a nearby ordinary marker keeps clearance from the complete cap contour", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 30000, minY: 0, maxY: 30000 },
    { width: 800, height: 600 },
  );
  const neighbor = { id: 3, x_mm: preview.center.x_mm + 26.25 / transform.pixelsPerMillimeter, y_mm: 0 };
  const [cap] = projectPileCapPreviews([preview], [neighbor], transform, 100);
  const point = projectPointPixels(neighbor, transform);
  assert.ok(cap.bounds.x + cap.bounds.width < point.x - 5.25);
  const [free] = projectPileCapPreviews([preview], [], transform, 100);
  assert.ok(cap.bounds.width < free.bounds.width);
});

test("internal overlap is allowed to clear an ordinary location outside the cap", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 30000, minY: 0, maxY: 30000 },
    { width: 800, height: 600 },
  );
  for (const size of [50, 100, 200]) {
    const symbol = effectiveSymbolScale(size);
    const neighbor = { id: 3, x_mm: preview.center.x_mm + 26 * symbol / transform.pixelsPerMillimeter, y_mm: 0 };
    const [cap] = projectPileCapPreviews([preview], [neighbor], transform, size);
    const other = projectPointPixels(neighbor, transform);
    assert.ok(cap.points[1].x - cap.points[0].x < 12 * symbol, "members may overlap");
    for (const point of cap.points) {
      assert.ok(Math.hypot(point.x - other.x, point.y - other.y) > 14 * symbol, "external location stays clear");
    }
  }
});

test("neighboring proposals compress their own members to avoid overlap between groups", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 30000, minY: 0, maxY: 30000 },
    { width: 800, height: 600 },
  );
  const distance = 25 / transform.pixelsPerMillimeter;
  const neighbor = { ...preview,
    proposal: { ...preview.proposal, load_point_ids: [3, 4] },
    center: { x_mm: preview.center.x_mm + distance, y_mm: 0 },
    positions: preview.positions.map(p => ({ ...p, x_mm: p.x_mm + distance })),
  };
  const [left, right] = projectPileCapPreviews([preview, neighbor], [], transform, 100);
  assert.ok(left.bounds.x + left.bounds.width < right.bounds.x);
  assert.ok(left.points[1].x - left.points[0].x < 9);
  for (const a of left.points) for (const b of right.points) {
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 10.5);
  }
});

test("an impossibly crowded location retains its center and flags unavoidable overlap", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 140000, minY: 0, maxY: 60000 },
    { width: 900, height: 750 },
  );
  const [cap] = projectPileCapPreviews([preview], [{ id: 3, x_mm: 600, y_mm: 0 }], transform, 100);
  const center = projectPointPixels(preview.center, transform);
  assert.ok(cap.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepEqual(cap.points[1], center);
  assert.ok(cap.points[1].x - cap.points[0].x >= 3 - 1e-8, "members retain a visible separation of one third of a symbol diameter");
  assert.equal(cap.crowded, true);
});

test("a changed cap never widens the original group's closer spacing", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 30000, minY: 0, maxY: 30000 },
    { width: 800, height: 600 },
  );
  const sources = [{ id: 1, x_mm: 225, y_mm: 0 }, { id: 2, x_mm: 875, y_mm: 0 }];
  const [cap] = projectPileCapPreviews([preview], sources, transform, 200);
  assert.ok(cap.points[1].x - cap.points[0].x <= 650 * transform.pixelsPerMillimeter + 1e-8);
});

test("even the readability floor never enlarges a very tightly spaced original group", () => {
  const transform = createProjectViewTransform(
    { minX: 0, maxX: 100000, minY: 0, maxY: 100000 },
    { width: 800, height: 600 },
  );
  const sources = [{ id: 1, x_mm: 225, y_mm: 0 }, { id: 2, x_mm: 875, y_mm: 0 }];
  const [cap] = projectPileCapPreviews([preview], [...sources, { id: 3, x_mm: 600, y_mm: 0 }], transform, 200);
  assert.ok(cap.points[1].x > cap.points[0].x);
  assert.ok(cap.points[1].x - cap.points[0].x <= 650 * transform.pixelsPerMillimeter + 1e-8);
});
