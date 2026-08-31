import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyOptimizationResult,
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

  it("leaves locked target exclusion to the core", () => {
    assert.deepEqual(getOptimizationTargetIds("all", [1, 2, 3], [2, 3], [2]), [1, 2, 3]);
    assert.deepEqual(getOptimizationTargetIds("selected", [1, 2, 3], [2, 3], [2]), [2, 3]);
  });

  it("applies assignments and explicit unassigned outcomes atomically", () => {
    const result = applyOptimizationResult({
      previousChoices: new Map([[1, "290|-18"], [2, "320|-19"], [3, "290|-18"]]),
      result: {
        assignments: [{
          load_point_id: 1,
          pile_size_mm: 350,
          pile_tip_level_m: -20,
          is_option: true,
          cost: 100,
        }],
        unassigned: [{ load_point_id: 2, reason: "configuration_limits" }],
        selected_configurations: [{ pile_size_mm: 350, pile_tip_level_m_key: -20000 }],
        pile_size_count: 1,
        pile_tip_level_count: 1,
        configuration_count: 1,
      },
    });

    assert.deepEqual(result.choices, new Map([[1, "350|-20"], [3, "290|-18"]]));
    assert.deepEqual(result.optimizationUnassignedByLoadPoint, new Map([[2, "configuration_limits"]]));
    assert.equal("activePileSizes" in result, false);
    assert.equal("activePileTipLevels" in result, false);
    assert.deepEqual(result.summary, {
      assignedCount: 1,
      changedCount: 2,
      noValidOptionCount: 0,
      optimizerUnassignedCount: 1,
    });
  });
});
