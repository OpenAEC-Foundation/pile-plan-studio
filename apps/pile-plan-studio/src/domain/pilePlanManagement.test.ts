import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import {
  createPilePlan,
  createOptimizationPilePlan,
  deletePilePlan,
  duplicatePilePlan,
  generatedPilePlanName,
  nextPilePlanId,
  renamePilePlan,
  switchPilePlan,
  synchronizeActivePilePlan,
} from "./pilePlanManagement.ts";

function plan(
  id: string,
  name: string,
  choices: Array<[number, string]>,
  lockedLoadPointIds: number[] = [],
): PilePlanData {
  return {
    id,
    name,
    selectedPileOptionKeysByLoadPoint: new Map(choices),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds,
  };
}

describe("pile plan management", () => {
  it("synchronizes active edits without mutating the existing plan", () => {
    const original = plan("pile-plan-1", "Basisplan", [[1, "old"]]);
    const choices = new Map([[1, "new"]]);

    const result = synchronizeActivePilePlan([original], original.id, choices);

    assert.equal(original.selectedPileOptionKeysByLoadPoint.get(1), "old");
    assert.equal(result[0].selectedPileOptionKeysByLoadPoint.get(1), "new");
    assert.notEqual(result[0], original);
    assert.notEqual(result[0].selectedPileOptionKeysByLoadPoint, choices);
  });

  it("stores active edits before switching and returns a copy of the target choices", () => {
    const plans = [
      plan("pile-plan-1", "Basisplan", [[1, "old"]]),
      plan("pile-plan-2", "Variant 1", [[2, "target"]]),
    ];

    const result = switchPilePlan({
      pilePlans: plans,
      activePilePlanId: "pile-plan-1",
      selectedPileOptionKeysByLoadPoint: new Map([[1, "edited"]]),
      targetPilePlanId: "pile-plan-2",
    });

    assert.equal(result.pilePlans[0].selectedPileOptionKeysByLoadPoint.get(1), "edited");
    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.deepEqual([...result.selectedPileOptionKeysByLoadPoint], [[2, "target"]]);
    assert.notEqual(
      result.selectedPileOptionKeysByLoadPoint,
      result.pilePlans[1].selectedPileOptionKeysByLoadPoint,
    );
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

    const result = duplicatePilePlan({
      pilePlans: [source],
      activePilePlanId: source.id,
      selectedPileOptionKeysByLoadPoint: new Map([[1, "320|-17500"]]),
      sourcePilePlanId: source.id,
      language: "nl",
    });

    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.equal(result.pilePlans[1].name, "Basisplan - kopie");
    assert.deepEqual([...result.selectedPileOptionKeysByLoadPoint], [[1, "320|-17500"]]);
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, [1]);
    assert.notEqual(result.pilePlans[1].lockedLoadPointIds, source.lockedLoadPointIds);
    assert.notEqual(
      result.pilePlans[1].externalReferencesByLoadPoint,
      source.externalReferencesByLoadPoint,
    );
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
      selectedPileOptionKeysByLoadPoint: new Map([[2, "edited"]]),
      pilePlanId: "pile-plan-2",
    });

    assert.equal(result.activePilePlanId, "pile-plan-1");
    assert.deepEqual(result.pilePlans.map(({ id }) => id), ["pile-plan-1", "pile-plan-3"]);
    assert.deepEqual([...result.selectedPileOptionKeysByLoadPoint], [[1, "one"]]);
  });

  it("keeps the final pile plan", () => {
    const plans = [plan("pile-plan-1", "Only", [[1, "one"]])];
    const result = deletePilePlan({
      pilePlans: plans,
      activePilePlanId: "pile-plan-1",
      selectedPileOptionKeysByLoadPoint: new Map([[1, "edited"]]),
      pilePlanId: "pile-plan-1",
    });

    assert.equal(result.pilePlans.length, 1);
    assert.equal(result.selectedPileOptionKeysByLoadPoint.get(1), "edited");
  });

  it("creates an unlocked active plan from supplied default assignments", () => {
    const result = createPilePlan({
      pilePlans: [plan("pile-plan-1", "Basisplan", [[1, "old"]], [1])],
      activePilePlanId: "pile-plan-1",
      selectedPileOptionKeysByLoadPoint: new Map([[1, "edited"]]),
      choices: new Map([[2, "default"]]),
      kind: "variant",
      language: "nl",
    });

    assert.equal(result.activePilePlanId, "pile-plan-2");
    assert.equal(result.pilePlans[1].name, "Variant 1");
    assert.deepEqual([...result.selectedPileOptionKeysByLoadPoint], [[2, "default"]]);
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, []);
  });

  it("creates an optimization plan from the active plan and preserves its locks", () => {
    const result = createOptimizationPilePlan({
      pilePlans: [plan("pile-plan-1", "Basisplan", [[1, "old"]], [1])],
      activePilePlanId: "pile-plan-1",
      selectedPileOptionKeysByLoadPoint: new Map([[1, "current"]]),
      optimizedChoices: new Map([[1, "optimized"]]),
      language: "nl",
    });

    assert.equal(result.pilePlans[0].selectedPileOptionKeysByLoadPoint.get(1), "current");
    assert.equal(result.pilePlans[1].name, "Optimalisatie 1");
    assert.equal(result.selectedPileOptionKeysByLoadPoint.get(1), "optimized");
    assert.deepEqual(result.pilePlans[1].lockedLoadPointIds, [1]);
  });
});
