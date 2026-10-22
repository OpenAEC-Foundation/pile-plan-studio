import type { ProjectState } from "../../domain/project/projectState.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { beginManualCptSelection, toggleManualCpt, cancelManualCptSelection } from "../../domain/cpt-selection/cptSettingsModel.ts";
import { createManualCptEditController } from "./manualCptEditController.ts";
import type { ManualCptSelectionBatchResult } from "../../core/locationBulkCoreClient.ts";

function setup() {
  const project = canonicalProjectForTest(readFileSync(new URL("../../../../../sample_project/sample_project.ifcpp", import.meta.url), "utf8"));
  let state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const id = state.loadPoints[0]!.id, cpt = state.cpts[0]!.id;
  state = toggleManualCpt(beginManualCptSelection({ ...state, selectedLoadPointIds: [id], manualCptIdsByLoadPoint: new Map() }), cpt);
  let finish!: (result: ManualCptSelectionBatchResult) => void;
  let commits = 0, blocked = 0;
  const inputs: Parameters<import("../../core/locationBulkCoreClient.ts").validateManualCptSelectionBatchCore>[0][] = [];
  let queued: ((state: ProjectState) => ProjectState) | null = null;
  let delayed = false;
  const controller = createManualCptEditController({ currentState: () => state,
    evaluate: input => { inputs.push(input); return new Promise(resolve => { finish = resolve; }); },
    commit: update => { if (delayed) queued = update; else state = update(state); commits++; },
    setPending: () => {}, blocked: () => { blocked++; }, failed: () => { throw Error("unexpected failure"); },
  });
  return { controller, id, cpt, inputs, delay: () => { delayed = true; }, flush: () => { if (queued) state = queued(state); }, state: () => state, change: (update: (s: typeof state) => typeof state) => { state = update(state); },
    finish: (result: ManualCptSelectionBatchResult) => finish(result), commits: () => commits, blocked: () => blocked };
}

test("manual CPT save installs one validated batch and closes the draft", async () => {
  const h = setup(); const task = h.controller.save();
  assert.equal(h.state().manualCptIdsByLoadPoint.size, 0);
  h.finish({ status: "valid", changes: [{ load_point_id: h.id, cpt_ids: [h.cpt] }] }); await task;
  assert.equal(h.commits(), 1); assert.equal(h.state().cptSelectionEditDraft, null);
  assert.deepEqual(h.state().manualCptIdsByLoadPoint.get(h.id), [h.cpt]);
  assert.deepEqual(h.state().analysisRequest.loadPointIds, [h.id]);
});

test("a blocked manual CPT batch leaves every location and the editor intact", async () => {
  const h = setup();
  h.change(state => toggleManualCpt(beginManualCptSelection({ ...state,
    selectedLoadPointIds: state.loadPoints.slice(0, 2).map(point => point.id),
  }), h.cpt));
  const before = h.state(), task = h.controller.save();
  assert.equal(h.inputs[0].changes.length, 2);
  h.finish({ status: "blocked", reason: "unknown_cpt", ids: [999] }); await task;
  assert.equal(h.state(), before); assert.equal(h.commits(), 0); assert.equal(h.blocked(), 1);
});

for (const cause of ["cancel", "draft", "source", "settings", "manual"]) {
  test(`manual CPT save ignores an asynchronous result after ${cause} changes`, async () => {
    const h = setup(); const task = h.controller.save();
    h.change(s => cause === "cancel" ? cancelManualCptSelection(s)
      : cause === "draft" ? toggleManualCpt(s, 999)
      : cause === "source" ? { ...s, cpts: [...s.cpts] }
      : cause === "settings" ? { ...s, globalCptSelectionSettings: { ...s.globalCptSelectionSettings, maxDistanceM: 99 } }
      : { ...s, manualCptIdsByLoadPoint: new Map([[h.id, [999]]]) });
    const current = h.state(); h.finish({ status: "valid", changes: [{ load_point_id: h.id, cpt_ids: [h.cpt] }] }); await task;
    assert.equal(h.state(), current); assert.equal(h.commits(), 0);
  });
}

test("manual CPT save validates only real updates with the available project identities", async () => {
  const h = setup(), task = h.controller.save();
  assert.deepEqual(h.inputs[0].changes, [{ load_point_id: h.id, cpt_ids: [h.cpt] }]);
  assert.deepEqual(h.inputs[0].loadPointIds, h.state().loadPoints.map(point => point.id));
  assert.deepEqual(h.inputs[0].cptIds, h.state().cpts.map(cpt => cpt.id));
  await h.controller.save(); assert.equal(h.inputs.length, 1);
  h.finish({ status: "valid", changes: h.inputs[0].changes }); await task;
});

test("a queued history commit rechecks that the edit has not been cancelled", async () => {
  const h = setup(); h.delay(); const task = h.controller.save();
  h.finish({ status: "valid", changes: [{ load_point_id: h.id, cpt_ids: [h.cpt] }] }); await task;
  h.change(cancelManualCptSelection); const before = h.state(); h.flush();
  assert.equal(h.state(), before);
});

test("no-op save closes only the draft without validation or analysis", async () => {
  const h = setup(); h.change(state => toggleManualCpt(state, h.cpt));
  const before = h.state(); await h.controller.save();
  assert.equal(h.inputs.length, 0); assert.equal(h.state().cptSelectionEditDraft, null);
  assert.equal(h.state().analysisRequest, before.analysisRequest);
  assert.equal(h.state().manualCptIdsByLoadPoint, before.manualCptIdsByLoadPoint);
});
