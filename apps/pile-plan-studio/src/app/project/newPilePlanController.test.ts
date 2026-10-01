import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import type { PileConfigurationKey } from "../../core/projectTypes.ts";
import { createNewPilePlanController } from "./newPilePlanController.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
function setup() {
  let state = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  let groups = [{ load_point_ids: state.loadPoints.map(point => point.id) }];
  let ready = true, calls = 0, commits = 0;
  let delayed = false, queued: ((state: ProjectState) => ProjectState) | null = null;
  const pending: boolean[] = [], errors: unknown[] = [];
  let resolve!: (choices: Map<number, PileConfigurationKey>) => void;
  let reject!: (reason: Error) => void;
  const result = new Promise<Map<number, PileConfigurationKey>>((yes, no) => { resolve = yes; reject = no; });
  const options = new Map(state.loadPoints.map(point => [point.id, []]));
  const controller = createNewPilePlanController({
    snapshot: () => ({ state, groups, options, ready }), language: () => "nl",
    choose: async () => { calls++; return result; },
    commit: update => { commits++; if (delayed) queued = update; else state = update(state); },
    setPending: value => pending.push(value), failed: error => errors.push(error),
  });
  return { controller, resolve, reject, pending, errors, options,
    state: () => state, calls: () => calls, commits: () => commits,
    change: (update: (state: ProjectState) => ProjectState) => { state = update(state); },
    changeGroups: () => { groups = [...groups]; }, notReady: () => { ready = false; },
    delay: () => { delayed = true; }, flush: () => { if (queued) state = queued(state); } };
}

test("new plan uses Rust choices and commits once without modifying source assignments", async () => {
  const h = setup(), before = h.state();
  const running = h.controller.create();
  const choices = new Map([[before.loadPoints[0].id, { pile_size_mm: 290, pile_tip_level_mm: -12000 }]]);
  h.resolve(choices); await running;
  assert.equal(h.commits(), 1);
  assert.equal(h.state().pilePlans.length, before.pilePlans.length + 1);
  assert.notEqual(h.state().activePilePlanId, before.activePilePlanId);
  assert.deepEqual(h.state().selectedPileConfigurationsByLoadPoint, choices);
  assert.notEqual(h.state().selectedPileConfigurationsByLoadPoint, choices);
  assert.equal(before.pilePlans.length, h.state().pilePlans.length - 1);
  assert.deepEqual(h.pending, [true, false]);
});

test("unfinished assessment and incomplete options prevent creation", async () => {
  const h = setup(); h.notReady(); await h.controller.create();
  assert.equal(h.calls(), 0);
  const incomplete = setup(); incomplete.options.clear(); await incomplete.controller.create();
  assert.equal(incomplete.calls(), 0);
});

test("concurrent clicks start only one default-choice request", async () => {
  const h = setup(); const running = h.controller.create();
  await h.controller.create(); assert.equal(h.calls(), 1);
  h.resolve(new Map()); await running;
});

for (const cause of ["analysisRequest", "pileOptionsByLoadPointId", "cptSelectionEditDraft", "cptSelectionPreview",
  "pileCostSettings", "pileHeadLevelM", "activePilePlanId", "groups", "invalidation"] as const) {
  test(`ignores plan choices after ${cause} changes`, async () => {
    const h = setup(), before = h.state(); const running = h.controller.create();
    if (cause === "groups") h.changeGroups();
    else if (cause === "invalidation") h.controller.invalidate();
    else h.change(state => ({ ...state, [cause]: cause === "activePilePlanId" ? "other"
      : cause === "pileHeadLevelM" ? 999 : cause === "pileOptionsByLoadPointId" ? new Map()
      : cause === "cptSelectionEditDraft" ? { loadPointIds: [], cptIdsByLoadPoint: new Map() }
      : cause === "cptSelectionPreview" ? { status: "analyzing", draft: { loadPointIds: [], cptIdsByLoadPoint: new Map() } }
      : { ...state[cause] } }));
    h.resolve(new Map()); await running;
    assert.equal(h.state().pilePlans, before.pilePlans);
    assert.equal(h.commits(), 0);
  });
}

test("failure releases pending state and retains the existing error reporting", async () => {
  const h = setup(), error = new Error("default choices failed"); const running = h.controller.create();
  h.reject(error); await running;
  assert.deepEqual(h.errors, [error]); assert.deepEqual(h.pending, [true, false]);
});

test("plan installation rechecks inputs inside a queued history update", async () => {
  const h = setup(); h.delay(); const running = h.controller.create();
  h.resolve(new Map()); await running;
  h.changeGroups(); const before = h.state(); h.flush();
  assert.equal(h.state(), before);
});

test("a project without load points creates an empty plan without calling the chooser", async () => {
  const h = setup(); h.change(state => ({ ...state, loadPoints: [] })); h.options.clear();
  const before = h.state(); await h.controller.create();
  assert.equal(h.calls(), 0);
  assert.equal(h.state().pilePlans.length, before.pilePlans.length + 1);
});
