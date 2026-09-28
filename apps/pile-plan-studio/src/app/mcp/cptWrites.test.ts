import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { prepareMcpWrite } from "./writeModel.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const pointId = state.loadPoints[0].id;
const cptId = state.cpts[0].id;
const snapshot = {
  state,
  marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null },
};

describe("MCP manual CPT writes", () => {
  it("sets an explicit CPT selection and requests fresh analysis for only the target", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_manual_cpts", {
      load_point_id: pointId, cpt_ids: [cptId],
    });
    const next = prepared.update(state);
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(pointId), [cptId]);
    assert.equal(next.analysisRequest.revision, state.analysisRequest.revision + 1);
    assert.deepEqual(next.analysisRequest.loadPointIds, [pointId]);
    assert.equal(prepared.data.analysis_requested, true);
    const recorded = projectHistoryReducer(createManagedProjectState(state), {
      type: "commit", update: prepared.update,
    });
    assert.equal(recorded.history.past.length, 1);
    assert.equal(projectHistoryReducer(recorded, { type: "undo" }).present.manualCptIdsByLoadPoint.has(pointId), false);
  });

  it("keeps an explicit empty list and resets it to automatic selection", async () => {
    const empty = await prepareMcpWrite(snapshot, "pile_set_manual_cpts", {
      load_point_id: pointId, cpt_ids: [],
    });
    const withEmpty = empty.update(state);
    assert.deepEqual(withEmpty.manualCptIdsByLoadPoint.get(pointId), []);
    const reset = await prepareMcpWrite({ ...snapshot, state: withEmpty }, "pile_use_automatic_cpts", {
      load_point_id: pointId,
    });
    assert.equal(reset.update(withEmpty).manualCptIdsByLoadPoint.has(pointId), false);
    assert.equal(reset.changed, true);
    const repeated = await prepareMcpWrite(snapshot, "pile_use_automatic_cpts", { load_point_id: pointId });
    assert.equal(repeated.changed, false);
  });

  it("rejects unknown load points, unknown CPTs and temporary manual editing", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_manual_cpts", {
      load_point_id: 999999, cpt_ids: [cptId],
    }), /unknown_id/);
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_manual_cpts", {
      load_point_id: pointId, cpt_ids: [999999],
    }), /unknown_id/);
    const editing = { ...state, cptSelectionEditDraft: { loadPointIds: [pointId], cptIdsByLoadPoint: new Map([[pointId, new Set([cptId])]]) } };
    await assert.rejects(prepareMcpWrite({ ...snapshot, state: editing }, "pile_set_manual_cpts", {
      load_point_id: pointId, cpt_ids: [cptId],
    }), /editing_in_progress/);
  });
});
