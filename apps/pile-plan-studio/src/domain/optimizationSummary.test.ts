import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeOptimizationRun } from "./optimizationSummary.ts";

describe("optimization summary", () => {
  it("counts applied and changed load point choices", () => {
    const summary = summarizeOptimizationRun(
      new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
        [2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
      ]),
      [
        { load_point_id: 1, configuration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 }, pile_size_mm: 290, pile_tip_level_m: -17.5, is_option: true, cost: 100 },
        { load_point_id: 2, configuration: { pile_size_mm: 350, pile_tip_level_mm: -19_000 }, pile_size_mm: 350, pile_tip_level_m: -19, is_option: true, cost: 200 },
      ],
    );

    assert.deepEqual(summary, {
      assignedCount: 2,
      changedCount: 1,
      noValidOptionCount: 0,
      optimizerUnassignedCount: 0,
      unresolvedGroupCount: 0,
      unresolvedLoadPointCount: 0,
    });
  });

  it("separates invalid engineering options from optimizer exclusions", () => {
    const summary = summarizeOptimizationRun(
      new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
      ]),
      [],
      [
        { load_point_id: 1, reason: "no_valid_option" },
        { load_point_id: 2, reason: "no_valid_option" },
        { load_point_id: 3, reason: "optimization_constraints" },
        { load_point_id: 4, reason: "configuration_limits" },
      ],
      2,
    );

    assert.deepEqual(summary, {
      assignedCount: 0,
      changedCount: 1,
      noValidOptionCount: 2,
      optimizerUnassignedCount: 2,
      unresolvedGroupCount: 2,
      unresolvedLoadPointCount: 4,
    });
  });
});
