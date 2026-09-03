import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyOptimizationResult,
  clampOptimizationLimits,
  formatOptimizationDiagnostics,
  splitOptimizationErrorLoadPoints,
  getOptimizationTargetIds,
  isOptimizationDisabled,
} from "./optimizationPanelModel.ts";

describe("React optimization panel model", () => {
  it("isolates diagnostic load point IDs without changing the translated sentence", () => {
    assert.deepEqual(
      splitOptimizationErrorLoadPoints(
        "Load points 7, 8 require conflicting configurations.",
        [7, 8],
      ),
      {
        before: "Load points ",
        loadPointIds: [7, 8],
        after: " require conflicting configurations.",
      },
    );
  });
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
      previousChoices: new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
        [2, { pile_size_mm: 320, pile_tip_level_mm: -19_000 }],
        [3, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
      ]),
      result: {
        assignments: [{
          load_point_id: 1,
          configuration: { pile_size_mm: 350, pile_tip_level_mm: -20_000 },
          pile_size_mm: 350,
          pile_tip_level_m: -20,
          is_option: true,
          cost: 100,
        }],
        unassigned: [{ load_point_id: 2, reason: "configuration_limits" }],
        technical_unassigned_load_point_ids: [3],
        unassigned_group_count: 1,
        selected_configurations: [{ pile_size_mm: 350, pile_tip_level_mm: -20000 }],
        pile_size_count: 1,
        pile_tip_level_count: 1,
        configuration_count: 1,
      },
    });

    assert.deepEqual(result.choices, new Map([
      [1, { pile_size_mm: 350, pile_tip_level_mm: -20_000 }],
    ]));
    assert.deepEqual(result.optimizationUnassignedByLoadPoint, new Map([[2, "configuration_limits"]]));
    assert.equal("activePileSizes" in result, false);
    assert.equal("activePileTipLevels" in result, false);
    assert.deepEqual(result.summary, {
      assignedCount: 1,
      changedCount: 3,
      technicalUnassignedCount: 1,
      optimizerUnassignedCount: 1,
    });
  });

  it("disables optimization until a non-empty project has ready groups", () => {
    const base = {
      optimizationRunning: false,
      hasActivePileSizes: true,
      hasActivePileTipLevels: true,
      selectedTargetIsEmpty: false,
      loadPointCount: 2,
      groupsPending: false,
      groupsError: null,
      groupCount: 1,
      technicalAssessmentStatus: "ready" as const,
    };

    assert.equal(isOptimizationDisabled(base), false);
    assert.equal(isOptimizationDisabled({ ...base, groupsPending: true }), true);
    assert.equal(isOptimizationDisabled({ ...base, groupsError: "failed" }), true);
    assert.equal(isOptimizationDisabled({ ...base, technicalAssessmentStatus: "unavailable" }), true);
    assert.equal(isOptimizationDisabled({ ...base, groupCount: 0 }), true);
    assert.equal(isOptimizationDisabled({ ...base, loadPointCount: 0, groupCount: 0 }), false);
  });

  it("formats the first preparation diagnostic and reports additional diagnostics", () => {
    const translate = (key: string, options?: Record<string, unknown>) => (
      options?.count ? `${key}:${options.count}` : `${key}:${options?.loadPoints ?? ""}`
    );

    assert.equal(formatOptimizationDiagnostics([{
      kind: "conflicting_locked_configurations",
      load_point_ids: [7, 8],
      configuration: null,
    }, {
      kind: "missing_relevant_cost",
      load_point_ids: [9],
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    }], translate), "rightPanel:optimization.blocked.conflictingLockedConfigurations:7, 8 rightPanel:optimization.blocked.additional:1");
  });
});
