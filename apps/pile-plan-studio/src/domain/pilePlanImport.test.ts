import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectState } from "./projectState.ts";
import { applyPilePlanImportPatch } from "./pilePlanImport.ts";

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
