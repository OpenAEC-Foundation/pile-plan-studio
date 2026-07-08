import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeOptimizationRun } from "./optimizationSummary.ts";

describe("optimization summary", () => {
  it("counts applied and changed load point choices", () => {
    const summary = summarizeOptimizationRun(
      new Map([
        [1, "290|-17.5"],
        [2, "320|-18"],
      ]),
      [
        { load_point_id: 1, pile_size_mm: 290, pile_tip_level_m: -17.5, is_option: true, cost_eur: 100 },
        { load_point_id: 2, pile_size_mm: 350, pile_tip_level_m: -19, is_option: true, cost_eur: 200 },
      ],
    );

    assert.deepEqual(summary, {
      appliedCount: 2,
      changedCount: 1,
    });
  });

  it("counts load points cleared to no pile as applied and changed", () => {
    const summary = summarizeOptimizationRun(
      new Map([
        [1, "290|-17.5"],
        [2, ""],
      ]),
      [],
      [1, 2],
    );

    assert.deepEqual(summary, {
      appliedCount: 2,
      changedCount: 1,
    });
  });
});
