import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyOptimizationChoices,
  clampOptimizationLimits,
  getOptimizationTargetIds,
} from "./optimizationPanelModel.ts";

describe("React optimization panel model", () => {
  it("clamps simple limits to active sizes and tips", () => {
    assert.deepEqual(
      clampOptimizationLimits({ sizes: 8, tips: 0, configurations: 99 }, [290, 320], [-18, -19, -20]),
      { sizes: 2, tips: 1, configurations: 2 },
    );
  });

  it("selects all or only selected load point ids", () => {
    assert.deepEqual(getOptimizationTargetIds("all", [1, 2, 3], [2]), [1, 2, 3]);
    assert.deepEqual(getOptimizationTargetIds("selected", [1, 2, 3], [2]), [2]);
  });

  it("applies returned choices, clears omitted targets, and preserves other points", () => {
    const result = applyOptimizationChoices({
      previousChoices: new Map([[1, "290|-18"], [2, "320|-19"], [3, "290|-18"]]),
      targetIds: [1, 2],
      choices: [{
        load_point_id: 1,
        pile_size_mm: 350,
        pile_tip_level_m: -20,
        is_option: true,
        cost_eur: 100,
      }],
    });

    assert.deepEqual(result.choices, new Map([[1, "350|-20"], [3, "290|-18"]]));
    assert.deepEqual(result.activePileSizes, [290, 350]);
    assert.deepEqual(result.activePileTipLevels, [-20, -18]);
    assert.deepEqual(result.summary, { appliedCount: 2, changedCount: 2 });
  });
});
