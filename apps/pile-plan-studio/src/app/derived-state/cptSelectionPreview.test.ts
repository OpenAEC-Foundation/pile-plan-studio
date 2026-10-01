import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import type { PileOptionAnalysisResult } from "../../core/projectTypes.ts";
import type { calculatePileOptionAnalysisCore } from "../../core/coreClient.ts";
import { runCptSelectionPreview } from "./cptSelectionPreview.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
function setup(withDraft = true) {
  let state = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  const id = state.loadPoints[0].id, cpt = state.cpts[0].id;
  if (withDraft) state = { ...state, cptSelectionEditDraft: { loadPointIds: [id], cptIdsByLoadPoint: new Map([[id, new Set([cpt])]]) } };
  let resolve!: (analysis: PileOptionAnalysisResult) => void, reject!: (error: Error) => void;
  const result = new Promise<PileOptionAnalysisResult>((yes, no) => { resolve = yes; reject = no; });
  const inputs: Parameters<typeof calculatePileOptionAnalysisCore>[0][] = [], errors: unknown[] = [];
  const initial = state;
  const task = runCptSelectionPreview(state, {
    update: update => { state = update(state); },
    analyze: async input => { inputs.push(input); return result; },
    failed: error => errors.push(error),
  });
  const analysis: PileOptionAnalysisResult = { pileOptionsByLoadPointId: new Map([[id, []]]), selectedCptsByLoadPointId: new Map(), cptFrdRowsByCptId: null };
  return { task, initial, inputs, errors, resolve, reject, analysis, state: () => state,
    change: (update: (state: ProjectState) => ProjectState) => { state = update(state); } };
}

test("no manual draft starts no analysis", () => {
  const h = setup(false); assert.equal(h.task, null); assert.deepEqual(h.inputs, []);
});

test("preview requests only edited load points and installs transient options", async () => {
  const h = setup();
  assert.equal(h.state().cptSelectionPreview?.status, "analyzing");
  assert.deepEqual(h.inputs[0].loadPoints, [h.initial.loadPoints[0]]);
  assert.deepEqual(h.inputs[0].manualCptIdsByLoadPoint.get(h.initial.loadPoints[0].id), [h.initial.cpts[0].id]);
  assert.equal(h.inputs[0].includeCptFrdRows, false);
  h.resolve(h.analysis); await h.task!.finished;
  assert.equal(h.state().cptSelectionPreview?.status, "ready");
  assert.equal(h.state().pileOptionsByLoadPointId, h.initial.pileOptionsByLoadPointId);
  assert.equal(h.state().selectedPileConfigurationsByLoadPoint, h.initial.selectedPileConfigurationsByLoadPoint);
});

for (const outcome of ["success", "failure"] as const) {
  test(`cancelled ${outcome} cannot install a preview`, async () => {
    const h = setup(); h.task!.cancel(); const before = h.state();
    if (outcome === "success") h.resolve(h.analysis); else h.reject(new Error("late failure"));
    await h.task!.finished; assert.equal(h.state(), before);
  });
  test(`obsolete draft ${outcome} cannot overwrite the next draft`, async () => {
    const h = setup(); h.change(state => ({ ...state, cptSelectionEditDraft: { ...state.cptSelectionEditDraft! } }));
    const before = h.state();
    if (outcome === "success") h.resolve(h.analysis); else h.reject(new Error("old failure"));
    await h.task!.finished; assert.equal(h.state(), before);
  });
}

test("current analysis error becomes a failed preview without modifying source options", async () => {
  const h = setup(), error = new Error("missing capacity"); h.reject(error); await h.task!.finished;
  const preview = h.state().cptSelectionPreview;
  assert.equal(preview?.status, "failed");
  if (preview?.status === "failed") assert.equal(preview.error, "missing capacity");
  assert.deepEqual(h.errors, [error]);
  assert.equal(h.state().pileOptionsByLoadPointId, h.initial.pileOptionsByLoadPointId);
});
