import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import type { PileConfigurationKey } from "../core/projectTypes.ts";
import {
  createPilePlan,
  createOptimizationPilePlan,
  deletePilePlan,
  duplicatePilePlan,
  generatedPilePlanName,
  nextPilePlanId,
  renamePilePlan,
  replaceOptimizationOutcomesForTargets,
  switchPilePlan,
  synchronizeActivePilePlan,
} from "./pilePlanManagement.ts";
import { activationFromConfigurations, getPilePlanActivation } from "./pilePlanActivation.ts";

function plan(
  id: string,
  name: string,
  choices: Array<[number, string]>,
  lockedLoadPointIds: number[] = [],
  optimizationOutcomes: Array<[number, "configuration_limits" | "optimization_constraints"]> = [],
): PilePlanData {
  return {
    id,
    name,
    activePileSizes: [290, 320],
    activePileTipLevels: [-18, -19],
    selectedPileConfigurationsByLoadPoint: configurationMap(choices),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds,
    optimizationUnassignedByLoadPoint: new Map(optimizationOutcomes),
  };
}

function configuration(label: string): PileConfigurationKey {
  return {
    pile_size_mm: [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0),
    pile_tip_level_mm: -18_000,
  };
}

function configurationMap(
  choices: Array<[number, string]>,
): Map<number, PileConfigurationKey> {
  return new Map(choices.map(([loadPointId, label]) => [loadPointId, configuration(label)]));
}

describe("pile plan management", () => {
  it("synchronizes active edits without mutating the existing plan", () => {
    const original = plan("pile-plan-1", "Basisplan", [[1, "old"]]);
    const choices = configurationMap([[1, "new"]]);

    const result = synchronizeActivePilePlan([original], original.id, choices);

    assert.deepEqual(original.selectedPileConfigurationsByLoadPoint.get(1), configuration("old"));
    assert.deepEqual(result[0].selectedPileConfigurationsByLoadPoint.get(1), configuration("new"));
    assert.notEqual(result[0], original);
    assert.notEqual(result[0].selectedPileConfigurationsByLoadPoint, choices);
    assert.notEqual(result[0].selectedPileConfigurationsByLoadPoint.get(1), choices.get(1));
    assert.equal(result[0].activePileSizes, original.activePileSizes);
    assert.equal(result[0].activePileTipLevels, original.activePileTipLevels);
  });

  it("clears only optimizer outcomes that now have a manual assignment", () => {
    const original = plan(
      "pile-plan-1",
      "Basisplan",
      [],
      [],
      [[7, "configuration_limits"], [8, "optimization_constraints"]],
    );

    const result = synchronizeActivePilePlan(
      [original],
      original.id,
      configurationMap([[7, "290|-18"]]),
    );

    assert.deepEqual(
      result[0].optimizationUnassignedByLoadPoint,
      new Map([[8, "optimization_constraints"]]),
    );
    assert.equal(original.optimizationUnassignedByLoadPoint.has(7), true);
  });

  it("replaces optimizer outcomes only for the effective target scope", () => {
    const result = replaceOptimizationOutcomesForTargets(
      new Map([[1, "configuration_limits"], [3, "optimization_constraints"]]),
      [1, 2],
      new Map([[2, "configuration_limits"]]),
    );

    assert.deepEqual(
      result,
      new Map([[3, "optimization_constraints"], [2, "configuration_limits"]]),
    );
  });

  it("stores active edits before switching and returns a copy of the target choices", () => {
    const plans = [
      plan("pile-plan-1", "Basisplan", [[1, "old"]]),
      plan("pile-plan-2", "Variant 1", [[2, "target"]]),
    ];

    const result = switchPilePlan({
      pilePlans: plans,
      activePilePlanId: "pile-plan-1",
      selectedPileConfigurationsByLoadPoint: configurationMap([[1, "edited"]]),
      targetPilePlanId: "pile-plan-2",
    });

    assert.deepEqual(result.pilePlans[0].selectedPileConfigurationsByLoadPoint.get(1), configuration("edited"));
    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.deepEqual([...result.selectedPileConfigurationsByLoadPoint], [[2, configuration("target")]]);
    assert.notEqual(
      result.selectedPileConfigurationsByLoadPoint,
      result.pilePlans[1].selectedPileConfigurationsByLoadPoint,
    );
    assert.deepEqual(getPilePlanActivation(result.pilePlans[1]), {
      pileSizes: plans[1].activePileSizes,
      pileTipLevels: plans[1].activePileTipLevels,
    });
  });

  it("generates the next unused stable numeric ID", () => {
    const plans = [
      plan("pile-plan-1", "One", []),
      plan("pile-plan-3", "Three", []),
      plan("custom", "Custom", []),
    ];

    assert.equal(nextPilePlanId(plans), "pile-plan-2");
  });

  it("generates localized variant, duplicate, and optimization names", () => {
    const plans = [
      plan("pile-plan-1", "Variant 1", []),
      plan("pile-plan-2", "Basisplan - kopie", []),
    ];

    assert.equal(generatedPilePlanName(plans, "variant", "nl"), "Variant 2");
    assert.equal(generatedPilePlanName(plans, "variant", "en"), "Variant 2");
    assert.equal(generatedPilePlanName(plans, "optimization", "nl"), "Optimalisatie 1");
    assert.equal(generatedPilePlanName(plans, "optimization", "en"), "Optimization 1");
    assert.equal(generatedPilePlanName(plans, "duplicate", "nl", "Basisplan"), "Basisplan - kopie 2");
    assert.equal(generatedPilePlanName(plans, "duplicate", "en", "Base plan"), "Base plan - copy");
  });

  it("duplicates assignments, references, and locks into a new active plan", () => {
    const source = plan("pile-plan-1", "Basisplan", [[1, "290|-17500"]], [1]);
    source.externalReferencesByLoadPoint.set(1, [{ source: "legacy" }]);
    source.optimizationUnassignedByLoadPoint.set(8, "configuration_limits");

    const result = duplicatePilePlan({
      pilePlans: [source],
      activePilePlanId: source.id,
      selectedPileConfigurationsByLoadPoint: configurationMap([[1, "320|-17500"]]),
      sourcePilePlanId: source.id,
      language: "nl",
    });

    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.equal(result.pilePlans[1].name, "Basisplan - kopie");
    assert.deepEqual([...result.selectedPileConfigurationsByLoadPoint], [[1, configuration("320|-17500")]]);
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, [1]);
    assert.notEqual(result.pilePlans[1].lockedLoadPointIds, source.lockedLoadPointIds);
    assert.notEqual(
      result.pilePlans[1].externalReferencesByLoadPoint,
      source.externalReferencesByLoadPoint,
    );
    assert.deepEqual(result.pilePlans[1].optimizationUnassignedByLoadPoint, new Map([[8, "configuration_limits"]]));
    assert.notEqual(
      result.pilePlans[1].optimizationUnassignedByLoadPoint,
      source.optimizationUnassignedByLoadPoint,
    );
    assert.deepEqual(getPilePlanActivation(result.pilePlans[1]), {
      pileSizes: [290, 320],
      pileTipLevels: [-18, -19],
    });
    assert.notEqual(result.pilePlans[1].activePileSizes, source.activePileSizes);
    assert.notEqual(result.pilePlans[1].activePileTipLevels, source.activePileTipLevels);
  });

  it("renames only to a trimmed non-empty value", () => {
    const plans = [plan("pile-plan-1", "Basisplan", [])];

    assert.equal(renamePilePlan(plans, "pile-plan-1", "  Controleplan  ")[0].name, "Controleplan");
    assert.equal(renamePilePlan(plans, "pile-plan-1", "   ")[0].name, "Basisplan");
  });

  it("deletes an active plan and activates the previous neighbor", () => {
    const plans = [
      plan("pile-plan-1", "One", [[1, "one"]]),
      plan("pile-plan-2", "Two", [[2, "two"]]),
      plan("pile-plan-3", "Three", [[3, "three"]]),
    ];

    const result = deletePilePlan({
      pilePlans: plans,
      activePilePlanId: "pile-plan-2",
      selectedPileConfigurationsByLoadPoint: configurationMap([[2, "edited"]]),
      pilePlanId: "pile-plan-2",
    });

    assert.equal(result.activePilePlanId, "pile-plan-1");
    assert.deepEqual(result.pilePlans.map(({ id }) => id), ["pile-plan-1", "pile-plan-3"]);
    assert.deepEqual([...result.selectedPileConfigurationsByLoadPoint], [[1, configuration("one")]]);
  });

  it("keeps the final pile plan", () => {
    const plans = [plan("pile-plan-1", "Only", [[1, "one"]])];
    const result = deletePilePlan({
      pilePlans: plans,
      activePilePlanId: "pile-plan-1",
      selectedPileConfigurationsByLoadPoint: configurationMap([[1, "edited"]]),
      pilePlanId: "pile-plan-1",
    });

    assert.equal(result.pilePlans.length, 1);
    assert.deepEqual(result.selectedPileConfigurationsByLoadPoint.get(1), configuration("edited"));
  });

  it("creates an unlocked active plan from supplied default assignments", () => {
    const result = createPilePlan({
      pilePlans: [plan("pile-plan-1", "Basisplan", [[1, "old"]], [1])],
      activePilePlanId: "pile-plan-1",
      selectedPileConfigurationsByLoadPoint: configurationMap([[1, "edited"]]),
      choices: configurationMap([[2, "default"]]),
      activation: { pileSizes: [290, 320, 350], pileTipLevels: [-17.5, -18, -19] },
      kind: "variant",
      language: "nl",
    });

    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.equal(result.pilePlans[1].name, "Variant 1");
    assert.deepEqual([...result.selectedPileConfigurationsByLoadPoint], [[2, configuration("default")]]);
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, []);
    assert.deepEqual(getPilePlanActivation(result.pilePlans[1]), {
      pileSizes: [290, 320, 350],
      pileTipLevels: [-17.5, -18, -19],
    });
  });

  it("creates an optimization plan from the active plan and preserves its locks", () => {
    const source = plan(
      "pile-plan-1",
      "Basisplan",
      [[1, "old"]],
      [1],
      [[8, "configuration_limits"]],
    );
    const result = createOptimizationPilePlan({
      pilePlans: [source],
      activePilePlanId: "pile-plan-1",
      selectedPileConfigurationsByLoadPoint: configurationMap([[1, "current"]]),
      optimizedChoices: configurationMap([[1, "optimized"]]),
      resolvedCandidateConfigurations: [
        { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
        { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
      ],
      language: "nl",
    });

    assert.deepEqual(result.pilePlans[0].selectedPileConfigurationsByLoadPoint.get(1), configuration("current"));
    assert.equal(result.pilePlans[1].name, "Optimalisatie 1");
    assert.deepEqual(result.selectedPileConfigurationsByLoadPoint.get(1), configuration("optimized"));
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, [1]);
    assert.deepEqual(result.pilePlans[1].optimizationUnassignedByLoadPoint, new Map([[8, "configuration_limits"]]));
    assert.deepEqual(getPilePlanActivation(result.pilePlans[1]), {
      pileSizes: [290, 320],
      pileTipLevels: [-18, -19],
    });
  });

  it("derives sorted activation from an exact configuration set", () => {
    assert.deepEqual(activationFromConfigurations([
      { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
      { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
      { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
    ]), {
      pileSizes: [290, 320],
      pileTipLevels: [-18, -19],
    });
  });
});
