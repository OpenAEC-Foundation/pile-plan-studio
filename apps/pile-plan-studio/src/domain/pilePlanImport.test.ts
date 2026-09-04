import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectState } from "./projectState.ts";
import type { PilePlanData } from "../core/projectFile.ts";
import {
  applyPilePlanImportAsNewPlan,
  applyPilePlanImportPatch,
  pilePlanNameFromFileName,
} from "./pilePlanImport.ts";

describe("applyPilePlanImportPatch", () => {
  it("applies pile and CPT changes while preserving unrelated choices", () => {
    const state = {
      selectedPileConfigurationsByLoadPoint: new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
        [2, { pile_size_mm: 320, pile_tip_level_mm: -19_000 }],
        [3, { pile_size_mm: 350, pile_tip_level_mm: -20_000 }],
      ]),
      manualCptIdsByLoadPoint: new Map([
        [1, [10]],
        [2, [20]],
        [3, [30]],
      ]),
      analysisRequest: { revision: 4, loadPointIds: null },
      analysisError: "old error",
      defaultPileSelectionPending: true,
    } as ProjectState;

    const next = applyPilePlanImportPatch(state, {
      changes: [
        {
          load_point_id: 1,
          pile: { action: "set", value: { pile_size_mm: 400, pile_tip_level_mm: -21500 } },
          manual_cpt_ids: { action: "clear" },
        },
        {
          load_point_id: 2,
          pile: { action: "clear" },
          manual_cpt_ids: { action: "set", value: [64, 61, 64] },
        },
      ],
    });

    assert.deepEqual([...next.selectedPileConfigurationsByLoadPoint.entries()], [
      [1, { pile_size_mm: 400, pile_tip_level_mm: -21_500 }],
      [3, { pile_size_mm: 350, pile_tip_level_mm: -20_000 }],
    ]);
    assert.deepEqual([...next.manualCptIdsByLoadPoint.entries()], [
      [2, [61, 64]],
      [3, [30]],
    ]);
    assert.deepEqual(next.analysisRequest, { revision: 5, loadPointIds: null });
    assert.equal(next.analysisError, null);
    assert.equal(next.defaultPileSelectionPending, false);
    assert.notEqual(next.selectedPileConfigurationsByLoadPoint, state.selectedPileConfigurationsByLoadPoint);
    assert.notEqual(next.manualCptIdsByLoadPoint, state.manualCptIdsByLoadPoint);
  });

  it("does not mutate maps for preserved values", () => {
    const piles = new Map([[1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }]]);
    const cpts = new Map([[1, [61]]]);
    const state = {
      selectedPileConfigurationsByLoadPoint: piles,
      manualCptIdsByLoadPoint: cpts,
      analysisRequest: { revision: 0, loadPointIds: null },
      analysisError: null,
      defaultPileSelectionPending: false,
    } as ProjectState;

    const next = applyPilePlanImportPatch(state, {
      changes: [{
        load_point_id: 1,
        pile: { action: "preserve" },
        manual_cpt_ids: { action: "preserve" },
      }],
    });

    assert.equal(next.selectedPileConfigurationsByLoadPoint, piles);
    assert.equal(next.manualCptIdsByLoadPoint, cpts);
    assert.equal(next, state);
  });
});

describe("pile plan file import", () => {
  it("derives the new pile plan name from the file name", () => {
    assert.equal(pilePlanNameFromFileName("Variant Noord.xlsx"), "Variant Noord");
    assert.equal(pilePlanNameFromFileName("archive.plan.csv"), "archive.plan");
  });

  it("creates and activates a new plan without replacing the current plan", () => {
    const currentPlan: PilePlanData = {
      id: "pile-plan-1",
      name: "Basisplan",
      activePileSizes: [290],
      activePileTipLevels: [-18],
      selectedPileConfigurationsByLoadPoint: new Map([[
        1,
        { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
      ]]),
      externalReferencesByLoadPoint: new Map(),
      lockedLoadPointIds: [],
      optimizationUnassignedByLoadPoint: new Map(),
    };
    const state = {
      pilePlans: [currentPlan],
      activePilePlanId: currentPlan.id,
      selectedPileConfigurationsByLoadPoint: new Map([[
        1,
        { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
      ]]),
      manualCptIdsByLoadPoint: new Map([[1, [61]]]),
      analysisRequest: { revision: 4, loadPointIds: null },
      analysisError: null,
      defaultPileSelectionPending: false,
    } as ProjectState;

    const next = applyPilePlanImportAsNewPlan(state, {
      changes: [{
        load_point_id: 1,
        pile: { action: "set", value: { pile_size_mm: 320, pile_tip_level_mm: -19000 } },
        manual_cpt_ids: { action: "set", value: [64] },
      }],
    }, "Imported plan");

    assert.equal(next.pilePlans.length, 2);
    assert.equal(next.pilePlans[0].name, "Basisplan");
    assert.deepEqual(next.pilePlans[0].selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 290,
      pile_tip_level_mm: -18_000,
    });
    assert.equal(next.activePilePlanId, "pile-plan-2");
    assert.equal(next.pilePlans[1].name, "Imported plan");
    assert.deepEqual(next.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 320,
      pile_tip_level_mm: -19_000,
    });
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(1), [64]);
  });

  it("adds a suffix when the imported plan name already exists", () => {
    const plans = ["Variant", "Variant 2"].map((name, index): PilePlanData => ({
      id: `pile-plan-${index + 1}`,
      name,
      activePileSizes: [290],
      activePileTipLevels: [-18],
      selectedPileConfigurationsByLoadPoint: new Map(),
      externalReferencesByLoadPoint: new Map(),
      lockedLoadPointIds: [],
      optimizationUnassignedByLoadPoint: new Map(),
    }));
    const state = {
      pilePlans: plans,
      activePilePlanId: plans[0].id,
      selectedPileConfigurationsByLoadPoint: new Map(),
      manualCptIdsByLoadPoint: new Map(),
      analysisRequest: { revision: 0, loadPointIds: null },
      analysisError: null,
      defaultPileSelectionPending: false,
    } as ProjectState;

    const next = applyPilePlanImportAsNewPlan(state, { changes: [] }, "Variant");

    assert.equal(next.pilePlans.at(-1)?.name, "Variant 3");
  });
});
