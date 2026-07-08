import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildMaxOptimizationUiSettings,
  buildGreedyOptimizationSettings,
  clampMaxDifferentConfigurations,
  clampOptimizationUiSettingsToActiveConfigurations,
  createOptimizationLimitAutoState,
  reconcileOptimizationUiSettingsWithActiveConfigurations,
  snapSliderValueToInteger,
} from "./optimizationSettings.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

function option(size: number, tip: number): PileConfigurationOption {
  return {
    pile_size_mm: size,
    pile_tip_level_m: tip,
    isOption: true,
    governing_cpt_id: 1,
    governing_frd_kn: 700,
    utilization: 0.7,
    missing_cpt_ids: [],
  };
}

describe("optimization settings", () => {
  it("builds default limits at the maximum active legend counts", () => {
    const settings = buildMaxOptimizationUiSettings({
      pileSizes: [290, 320, 350],
      pileTipLevels: [-17.5, -18, -18.5, -19],
    });

    assert.deepEqual(settings, {
      targetScope: "all",
      limitScope: "target",
      maxDifferentSizes: 3,
      maxDifferentTips: 4,
      maxDifferentConfigurations: 12,
    });
  });

  it("clamps max different configurations to size times tip limits", () => {
    assert.equal(clampMaxDifferentConfigurations(20, 2, 3), 6);
    assert.equal(clampMaxDifferentConfigurations(0, 2, 3), 1);
    assert.equal(clampMaxDifferentConfigurations(8, 0, 3), 0);
  });

  it("snaps continuous slider values to integer limits", () => {
    assert.equal(snapSliderValueToInteger(2.49, 1, 4), 2);
    assert.equal(snapSliderValueToInteger(2.5, 1, 4), 3);
    assert.equal(snapSliderValueToInteger(9.1, 1, 4), 4);
    assert.equal(snapSliderValueToInteger(Number.NaN, 1, 4), 1);
  });

  it("uses active legend configurations as optimizer enabled values", () => {
    const settings = buildGreedyOptimizationSettings({
      activePileSizes: [290],
      activePileTipLevels: [-18],
      uiSettings: {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 1,
        maxDifferentTips: 1,
        maxDifferentConfigurations: 1,
      },
      baselineOptions: [],
    });

    assert.deepEqual(settings.enabled_pile_sizes, [290]);
    assert.deepEqual(settings.enabled_pile_tip_levels, [-18]);
  });

  it("clamps optimizer limits to the active legend counts", () => {
    const settings = clampOptimizationUiSettingsToActiveConfigurations(
      {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 4,
        maxDifferentTips: 4,
        maxDifferentConfigurations: 8,
      },
      { pileSizes: [290], pileTipLevels: [-18, -19] },
    );

    assert.equal(settings.maxDifferentSizes, 1);
    assert.equal(settings.maxDifferentTips, 2);
    assert.equal(settings.maxDifferentConfigurations, 2);
  });

  it("keeps user limits intact when the active legend still allows them", () => {
    const settings = clampOptimizationUiSettingsToActiveConfigurations(
      {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 2,
        maxDifferentTips: 3,
        maxDifferentConfigurations: 5,
      },
      { pileSizes: [290, 320, 350], pileTipLevels: [-18, -19, -20] },
    );

    assert.equal(settings.maxDifferentSizes, 2);
    assert.equal(settings.maxDifferentTips, 3);
    assert.equal(settings.maxDifferentConfigurations, 5);
  });

  it("tracks active maximum mode per optimization slider", () => {
    const clamped = reconcileOptimizationUiSettingsWithActiveConfigurations({
      uiSettings: {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 2,
        maxDifferentTips: 3,
        maxDifferentConfigurations: 5,
      },
      active: { pileSizes: [], pileTipLevels: [] },
      autoState: createOptimizationLimitAutoState(false),
    });

    assert.deepEqual(clamped.autoState, {
      maxDifferentSizes: true,
      maxDifferentTips: true,
      maxDifferentConfigurations: true,
    });
    assert.deepEqual(clamped.uiSettings, {
      targetScope: "all",
      limitScope: "target",
      maxDifferentSizes: 0,
      maxDifferentTips: 0,
      maxDifferentConfigurations: 0,
    });

    const expanded = reconcileOptimizationUiSettingsWithActiveConfigurations({
      uiSettings: clamped.uiSettings,
      active: {
        pileSizes: [290, 320, 350],
        pileTipLevels: [-17.5, -18, -18.5, -19, -19.5, -20],
      },
      autoState: clamped.autoState,
    });

    assert.deepEqual(expanded.uiSettings, {
      targetScope: "all",
      limitScope: "target",
      maxDifferentSizes: 3,
      maxDifferentTips: 6,
      maxDifferentConfigurations: 18,
    });
  });

  it("keeps each manual optimization slider independent when only one limit is clamped", () => {
    const reconciled = reconcileOptimizationUiSettingsWithActiveConfigurations({
      uiSettings: {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 2,
        maxDifferentTips: 3,
        maxDifferentConfigurations: 12,
      },
      active: {
        pileSizes: [290, 320],
        pileTipLevels: [-17.5, -18, -18.5],
      },
      autoState: createOptimizationLimitAutoState(false),
    });

    assert.deepEqual(reconciled.uiSettings, {
      targetScope: "all",
      limitScope: "target",
      maxDifferentSizes: 2,
      maxDifferentTips: 3,
      maxDifferentConfigurations: 6,
    });
    assert.deepEqual(reconciled.autoState, {
      maxDifferentSizes: false,
      maxDifferentTips: false,
      maxDifferentConfigurations: true,
    });
  });

  it("uses max different sizes times max different tips as the configuration limit", () => {
    const settings = clampOptimizationUiSettingsToActiveConfigurations(
      {
        targetScope: "all",
        limitScope: "target",
        maxDifferentSizes: 1,
        maxDifferentTips: 1,
        maxDifferentConfigurations: 6,
      },
      { pileSizes: [290, 320], pileTipLevels: [-18, -19, -20] },
    );

    assert.equal(settings.maxDifferentConfigurations, 1);
  });

  it("includes existing plan configurations as baseline when limits apply to the whole plan", () => {
    const settings = buildGreedyOptimizationSettings({
      activePileSizes: [290, 320],
      activePileTipLevels: [-18, -19],
      uiSettings: {
        targetScope: "selected",
        limitScope: "whole-plan",
        maxDifferentSizes: 2,
        maxDifferentTips: 2,
        maxDifferentConfigurations: 2,
      },
      baselineOptions: [option(320, -18), option(320, -18), null],
    });

    assert.deepEqual(settings.baseline_pile_sizes, [320]);
    assert.deepEqual(settings.baseline_pile_tip_levels, [-18]);
    assert.deepEqual(settings.baseline_pile_configurations, [{ pile_size_mm: 320, pile_tip_level_m_key: -18000 }]);
  });
});
