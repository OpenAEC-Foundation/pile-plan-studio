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
      selectedPileOptionKeysByLoadPoint: new Map([
        [1, "290|-18"],
        [2, "320|-19"],
        [3, "350|-20"],
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
          pile: { action: "set", value: { pile_size_mm: 400, pile_tip_level_m_key: -21500 } },
          manual_cpt_ids: { action: "clear" },
        },
        {
          load_point_id: 2,
          pile: { action: "clear" },
          manual_cpt_ids: { action: "set", value: [64, 61, 64] },
        },
      ],
    });

    assert.deepEqual([...next.selectedPileOptionKeysByLoadPoint.entries()], [
      [1, "400|-21.5"],
      [3, "350|-20"],
    ]);
    assert.deepEqual([...next.manualCptIdsByLoadPoint.entries()], [
      [2, [61, 64]],
      [3, [30]],
    ]);
    assert.deepEqual(next.analysisRequest, { revision: 5, loadPointIds: null });
    assert.equal(next.analysisError, null);
    assert.equal(next.defaultPileSelectionPending, false);
    assert.notEqual(next.selectedPileOptionKeysByLoadPoint, state.selectedPileOptionKeysByLoadPoint);
    assert.notEqual(next.manualCptIdsByLoadPoint, state.manualCptIdsByLoadPoint);
  });

  it("does not mutate maps for preserved values", () => {
    const piles = new Map([[1, "290|-18"]]);
    const cpts = new Map([[1, [61]]]);
    const state = {
      selectedPileOptionKeysByLoadPoint: piles,
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

    assert.equal(next.selectedPileOptionKeysByLoadPoint, piles);
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
      selectedPileOptionKeysByLoadPoint: new Map([[1, "290|-18"]]),
      externalReferencesByLoadPoint: new Map(),
      lockedLoadPointIds: [],
    };
    const state = {
      pilePlans: [currentPlan],
      activePilePlanId: currentPlan.id,
      selectedPileOptionKeysByLoadPoint: new Map([[1, "290|-18"]]),
      manualCptIdsByLoadPoint: new Map([[1, [61]]]),
      analysisRequest: { revision: 4, loadPointIds: null },
      analysisError: null,
      defaultPileSelectionPending: false,
    } as ProjectState;

    const next = applyPilePlanImportAsNewPlan(state, {
      changes: [{
        load_point_id: 1,
        pile: { action: "set", value: { pile_size_mm: 320, pile_tip_level_m_key: -19000 } },
        manual_cpt_ids: { action: "set", value: [64] },
      }],
    }, "Imported plan");

    assert.equal(next.pilePlans.length, 2);
    assert.equal(next.pilePlans[0].name, "Basisplan");
    assert.equal(next.pilePlans[0].selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
    assert.equal(next.activePilePlanId, "pile-plan-2");
    assert.equal(next.pilePlans[1].name, "Imported plan");
    assert.equal(next.selectedPileOptionKeysByLoadPoint.get(1), "320|-19");
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(1), [64]);
  });

  it("adds a suffix when the imported plan name already exists", () => {
    const plans = ["Variant", "Variant 2"].map((name, index): PilePlanData => ({
      id: `pile-plan-${index + 1}`,
      name,
      selectedPileOptionKeysByLoadPoint: new Map(),
      externalReferencesByLoadPoint: new Map(),
      lockedLoadPointIds: [],
    }));
    const state = {
      pilePlans: plans,
      activePilePlanId: plans[0].id,
      selectedPileOptionKeysByLoadPoint: new Map(),
      manualCptIdsByLoadPoint: new Map(),
      analysisRequest: { revision: 0, loadPointIds: null },
      analysisError: null,
      defaultPileSelectionPending: false,
    } as ProjectState;

    const next = applyPilePlanImportAsNewPlan(state, { changes: [] }, "Variant");

    assert.equal(next.pilePlans.at(-1)?.name, "Variant 3");
  });
});
