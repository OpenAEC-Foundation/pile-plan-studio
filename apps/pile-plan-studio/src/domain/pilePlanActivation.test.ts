import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import {
  getActivePilePlan,
  getPilePlanActivation,
  summarizePilePlanScope,
  unionActivationForPlans,
  unionUsedConfigurationsForPlans,
} from "./pilePlanActivation.ts";

function plan(id: string, sizes: number[], tips: number[]): PilePlanData {
  return {
    id,
    name: id,
    activePileSizes: sizes,
    activePileTipLevels: tips,
    selectedPileConfigurationsByLoadPoint: new Map(),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds: [],
    optimizationUnassignedByLoadPoint: new Map(),
  };
}

describe("pile-plan activation", () => {
  it("returns cloned activation for the active plan", () => {
    const first = plan("first", [290], [-18]);
    const second = plan("second", [320], [-19]);

    const active = getActivePilePlan({ pilePlans: [first, second], activePilePlanId: "second" });
    const activation = getPilePlanActivation(active);

    assert.deepEqual(activation, { pileSizes: [320], pileTipLevels: [-19] });
    assert.notEqual(activation.pileSizes, second.activePileSizes);
    assert.notEqual(activation.pileTipLevels, second.activePileTipLevels);
  });

  it("falls back to the first plan for an unknown active id", () => {
    const first = plan("first", [290], [-18]);
    assert.equal(getActivePilePlan({ pilePlans: [first], activePilePlanId: "missing" }), first);
  });

  it("unions activation and used configurations across selected plans", () => {
    const first = plan("first", [290], [-18]);
    first.selectedPileConfigurationsByLoadPoint.set(1, {
      pile_size_mm: 290,
      pile_tip_level_mm: -18_000,
    });
    const second = plan("second", [320], [-19]);
    second.selectedPileConfigurationsByLoadPoint.set(2, {
      pile_size_mm: 350,
      pile_tip_level_mm: -20_000,
    });

    assert.deepEqual(unionActivationForPlans([first, second], new Set(["first", "second"])), {
      pileSizes: [290, 320],
      pileTipLevels: [-18, -19],
    });
    assert.deepEqual(unionUsedConfigurationsForPlans([first, second], new Set(["first", "second"])), {
      pileSizes: [290, 350],
      pileTipLevels: [-18, -20],
    });
  });

  it("uses a dedicated summary when only the current pile plan is selected", () => {
    assert.deepEqual(summarizePilePlanScope(14, 1), { kind: "current-only" });
    assert.deepEqual(summarizePilePlanScope(14, 3), {
      kind: "selection",
      selectedCount: 3,
      totalCount: 14,
    });
  });
});
