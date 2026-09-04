import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import { getActivePilePlan, getPilePlanActivation } from "./pilePlanActivation.ts";

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
});
