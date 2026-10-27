import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "../../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../../domain/project/projectState.ts";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import type { ProjectedPileCap } from "../../../viewer/pileCapProposalGeometry.ts";
import { buildPileCapMarkerGraphics } from "./pileCapMarkerPresentation.ts";
const project = canonicalProjectForTest(
  readFileSync("../../sample_project/sample_project.ifcpp", "utf8"),
);
const state = createInitialProjectState(
  project,
  { initializeDefaultPiles: false },
  projectTipLevelKeysForTest(project),
);
const configuration = { pile_size_mm: 320, pile_tip_level_mm: -18500 };
function layout(
  status: "valid" | "insufficient_capacity" | "missing_capacity_data",
  utilization: number | null,
): ProjectedPileCap {
  const preview: PileCapPreview = {
    proposal: {
      load_point_ids: [15, 43],
      pile_count: 3,
      quarter_turns: 0,
      configuration,
    },
    status: "active",
    center: { x_mm: 0, y_mm: 0 },
    positions: [],
    total_load_kn: 1200,
    load_per_pile_kn: 400,
    cpt_ids: [11],
    missing_selection_load_point_ids: [],
    options: [
      {
        configuration,
        pile_size_mm: 320,
        pile_tip_level_m: -18.5,
        isOption: status === "valid",
        technicalStatus: status,
        governing_cpt_id: 11,
        governing_frd_kn: 400,
        utilization,
        missing_cpt_ids: status === "missing_capacity_data" ? [11] : [],
        cost_per_pile: 1,
        total_cost: 3,
      },
    ],
  };
  return {
    preview,
    sourceIds: [15, 43],
    points: [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 50, y: 20 },
    ],
    bounds: { x: 0, y: 0, width: 60, height: 40 },
    crowded: false,
  };
}
test("proposal piles retain the ordinary red and yellow status halos even without selection", () => {
  for (const [status, utilization, kind] of [
    ["insufficient_capacity", 1.2, "above"],
    ["missing_capacity_data", null, "missing"],
  ] as const) {
    const graphics = buildPileCapMarkerGraphics(
      [layout(status, utilization)],
      state,
      new Set(),
    );
    assert.equal(graphics.length, 3);
    assert.ok(graphics.every((g) => g.halo?.kind === kind));
    assert.deepEqual(
      graphics.map((g) => [g.x, g.y]),
      [
        [10, 20],
        [30, 20],
        [50, 20],
      ],
    );
  }
});
test("proposal halos follow the same user utilization range and disappear for a valid choice", () => {
  assert.equal(
    buildPileCapMarkerGraphics(
      [layout("valid", 0.9)],
      { ...state, viewerUtilizationSettings: { minimum: 0, maximum: 0.8 } },
      new Set(),
    )[0].halo?.kind,
    "above",
  );
  assert.equal(
    buildPileCapMarkerGraphics(
      [layout("valid", 0.5)],
      { ...state, viewerUtilizationSettings: { minimum: 0, maximum: 1 } },
      new Set(),
    )[0].halo,
    null,
  );
  const missing = layout("valid", 0.5);
  missing.preview.status = "missing_cpt_selection";
  missing.preview.options = [];
  assert.equal(
    buildPileCapMarkerGraphics([missing], state, new Set())[0].halo?.kind,
    "missing",
  );
});

test("twenty-pile proposals in adjacent caps have unique graphic and halo IDs", () => {
  const cap = layout("insufficient_capacity", 1.2);
  cap.points = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 20 }));
  const other = { ...cap, sourceIds: [17, 45] };
  const graphics = buildPileCapMarkerGraphics([cap, other], state, new Set());
  assert.equal(graphics.length, 40);
  assert.equal(new Set(graphics.map(g => g.id)).size, 40);
});
