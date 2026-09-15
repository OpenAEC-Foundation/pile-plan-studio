import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildGreedyOptimizationSettings } from "./optimizationSettings.ts";

describe("optimization settings", () => {
  it("builds optimizer limits without persisting resolved candidate values", () => {
    const settings = buildGreedyOptimizationSettings({
      candidateSource: "active_legend",
      uiSettings: {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 1,
        maxDifferentTips: 1,
        maxDifferentConfigurations: 1,
      },
      maxUtilization: 0.85,
    });

    assert.equal(settings.candidate_source, "active_legend");
    assert.equal("enabled_pile_sizes" in settings, false);
    assert.equal("enabled_pile_tip_levels" in settings, false);
    assert.equal(settings.max_utilization, 0.85);
  });

  it("leaves whole-plan baseline derivation to the core", () => {
    const settings = buildGreedyOptimizationSettings({
      candidateSource: "all_available",
      uiSettings: {
        targetScope: "selected",
        limitScope: "whole-plan",
        maxDifferentSizes: 2,
        maxDifferentTips: 2,
        maxDifferentConfigurations: 2,
      },
      maxUtilization: 1,
    });

    assert.equal("baseline_pile_sizes" in settings, false);
    assert.equal("baseline_pile_tip_levels" in settings, false);
    assert.equal("baseline_pile_configurations" in settings, false);
  });
});
