import type { ProjectState } from "../../domain/project/projectState.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { beginManualCptSelection, toggleManualCpt, cancelManualCptSelection, clearManualCptSelection } from "../../domain/cpt-selection/cptSettingsModel.ts";
import { createManualCptEditController } from "./manualCptEditController.ts";
import type { ManualCptSelectionBatchResult } from "../../core/locationBulkCoreClient.ts";
import { validateManualCptSelectionBatchCore } from "../../core/locationBulkCoreClient.ts";
import initWasm from "../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";

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

test("auto-save applies a requested view change only with its accepted project commit", async () => {
  const h = setup();
  const task = h.controller.save(state => ({ ...state, rightPanelMode: "load-point", selectedLoadPointIds: [], selectedLoadPointId: null }));
  assert.notEqual(h.state().cptSelectionEditDraft, null);
  h.finish({ status: "valid", changes: [{ load_point_id: h.id, cpt_ids: [h.cpt] }] });
  await task;
  assert.equal(h.state().cptSelectionEditDraft, null);
  assert.equal(h.state().rightPanelMode, "load-point");
  assert.deepEqual(h.state().selectedLoadPointIds, []);
  assert.deepEqual(h.state().manualCptIdsByLoadPoint.get(h.id), [h.cpt]);
  assert.equal(h.commits(), 1);
});

test("a rejected auto-save never navigates away or discards the draft", async () => {
  const h = setup(), before = h.state();
  const task = h.controller.save(() => { assert.fail("must not navigate"); });
  h.finish({ status: "blocked", reason: "unknown_cpt", ids: [999] }); await task;
  assert.equal(h.state(), before);
});

test("no-op auto-save still finishes the editor and changes views without validation", async () => {
  const h = setup(); h.change(state => toggleManualCpt(state, h.cpt));
  h.change(state => ({ ...state, rightPanelMode: "cpts" }));
  await h.controller.save(state => ({ ...state, rightPanelMode: "load-point" }));
  assert.equal(h.state().rightPanelMode, "load-point");
  assert.equal(h.state().cptSelectionEditDraft, null);
  assert.equal(h.inputs.length, 0);
});

test("automatic selection can be restored directly without exposing an intermediate editor", async () => {
  const h = setup();
  h.change(state => ({ ...cancelManualCptSelection(state), manualCptIdsByLoadPoint: new Map([[h.id, [h.cpt]]]) }));
  const task = h.controller.applyMethod("automatic");
  assert.equal(h.state().cptSelectionEditDraft, null);
  assert.deepEqual(h.inputs[0]!.changes, [{ load_point_id: h.id, cpt_ids: null }]);
  h.finish({ status: "valid", changes: h.inputs[0]!.changes }); await task;
  assert.equal(h.state().manualCptIdsByLoadPoint.has(h.id), false);
  assert.equal(h.state().cptSelectionEditDraft, null);
  assert.equal(h.commits(), 1);
});

test("saving an automatic group reset through real WASM removes overrides while preserving explicit empty manual selections elsewhere", async () => {
  await initWasm({ module_or_path: readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
  const project = setup().state();
  const [first, second, untouched] = project.loadPoints.slice(0, 3).map(point => point.id);
  const cpt = project.cpts[0]!.id;
  let state = clearManualCptSelection(beginManualCptSelection({ ...project,
    selectedLoadPointIds: [first!, second!], manualCptIdsByLoadPoint: new Map([[first!, [cpt]], [second!, []], [untouched!, []]]),
  }));
  let commits = 0;
  const controller = createManualCptEditController({ currentState: () => state,
    evaluate: validateManualCptSelectionBatchCore,
    commit: update => { state = update(state); commits++; },
    setPending: () => {}, blocked: () => assert.fail("unexpected rejection"), failed: error => { throw error; },
  });
  await controller.save();
  assert.equal(commits, 1);
  assert.equal(state.cptSelectionEditDraft, null);
  assert.equal(state.manualCptIdsByLoadPoint.has(first!), false);
  assert.equal(state.manualCptIdsByLoadPoint.has(second!), false);
  assert.deepEqual(state.manualCptIdsByLoadPoint.get(untouched!), []);
  assert.deepEqual(state.analysisRequest.loadPointIds, [first, second]);
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
