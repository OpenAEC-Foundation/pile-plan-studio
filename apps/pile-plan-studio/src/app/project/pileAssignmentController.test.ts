import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import type { ApplyLoadPointGroupAssignmentResult, LoadPointGroupAssignmentInput } from "../../core/loadPointGroupContract.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import { createPileAssignmentController } from "./pileAssignmentController.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const configuration = { pile_size_mm: 290, pile_tip_level_mm: -12000 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let state = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  const ids = state.loadPoints.slice(0, 2).map(point => point.id);
  let groups = [{ load_point_ids: ids }];
  let ready = true;
  let commits = 0;
  let queued: ((state: ProjectState) => ProjectState) | null = null;
  let delayCommit = false;
  const notices: string[][] = [], errors: string[] = [], pending: boolean[] = [];
  const requests: { input: LoadPointGroupAssignmentInput; result: ReturnType<typeof deferred<ApplyLoadPointGroupAssignmentResult>> }[] = [];
  const controller = createPileAssignmentController({
    currentState: () => state,
    currentGroups: () => groups,
    groupsReady: () => ready,
    evaluate: (input) => {
      const result = deferred<ApplyLoadPointGroupAssignmentResult>();
      requests.push({ input, result });
      return result.promise;
    },
    commit: (update) => { commits++; if (delayCommit) queued = update; else state = update(state); },
    setPending: value => pending.push(value),
    blocked: names => notices.push(names),
    failed: message => errors.push(message),
  });
  return {
    controller, ids, requests, notices, errors, pending,
    state: () => state, commits: () => commits,
    change: (update: (state: ProjectState) => ProjectState) => { state = update(state); },
    changeGroups: () => { groups = [...groups]; },
    notReady: () => { ready = false; },
    delayCommit: () => { delayCommit = true; },
    flush: () => { if (queued) state = queued(state); },
  };
}
function applied(ids: number[]): ApplyLoadPointGroupAssignmentResult {
  return { status: "applied", changes: ids.map(load_point_id => ({ load_point_id, configuration })) };
}

test("Rust group-expanded assignments commit once and leave stored maps untouched", async () => {
  const h = setup(), before = h.state();
  const running = h.controller.apply([h.ids[0]], configuration);
  assert.deepEqual(h.requests[0].input.groups, [{ load_point_ids: h.ids }]);
  assert.equal(h.requests[0].input.currentAssignments, before.selectedPileConfigurationsByLoadPoint);
  h.requests[0].result.resolve(applied(h.ids));
  await running;
  assert.equal(h.commits(), 1);
  for (const id of h.ids) assert.deepEqual(h.state().selectedPileConfigurationsByLoadPoint.get(id), configuration);
  assert.notEqual(h.state().selectedPileConfigurationsByLoadPoint, before.selectedPileConfigurationsByLoadPoint);
  const plan = h.state().pilePlans.find(plan => plan.id === h.state().activePilePlanId)!;
  assert.deepEqual(plan.selectedPileConfigurationsByLoadPoint, h.state().selectedPileConfigurationsByLoadPoint);
  assert.deepEqual(h.pending, [true, false]);
});

test("removal applies all Rust changes in one commit", async () => {
  const h = setup();
  h.change(state => ({ ...state, selectedPileConfigurationsByLoadPoint: new Map(h.ids.map(id => [id, configuration])) }));
  const before = h.state().selectedPileConfigurationsByLoadPoint;
  const running = h.controller.apply(h.ids, null);
  assert.equal(h.requests[0].input.requestedConfiguration, null);
  h.requests[0].result.resolve({ status: "applied", changes: h.ids.map(load_point_id => ({ load_point_id, configuration: null })) });
  await running;
  assert.equal(h.commits(), 1);
  for (const id of h.ids) { assert.equal(h.state().selectedPileConfigurationsByLoadPoint.has(id), false); assert.equal(before.has(id), true); }
});

test("blocked locks report names without changing history", async () => {
  const h = setup();
  const running = h.controller.apply(h.ids, configuration);
  h.requests[0].result.resolve({ status: "blocked", involved_load_point_ids: h.ids,
    blocking_locked_load_points: [{ load_point_id: h.ids[0], assigned_configuration: null },
      { load_point_id: -1, assigned_configuration: null }] });
  await running;
  assert.deepEqual(h.notices, [[h.state().loadPoints.find(point => point.id === h.ids[0])!.name, "-1"]]);
  assert.equal(h.commits(), 0);
});

for (const cause of ["plan", "assignments", "groups", "locks", "replacement"] as const) {
  test(`ignores stale Rust responses after ${cause} changes`, async () => {
    const h = setup();
    const running = h.controller.apply(h.ids, configuration);
    if (cause === "plan") h.change(state => ({ ...state, activePilePlanId: "another" }));
    if (cause === "assignments") h.change(state => ({ ...state, selectedPileConfigurationsByLoadPoint: new Map() }));
    if (cause === "groups") h.changeGroups();
    if (cause === "locks") h.change(state => ({ ...state, pilePlans: state.pilePlans.map(plan =>
      plan.id === state.activePilePlanId ? { ...plan, lockedLoadPointIds: h.ids } : plan) }));
    if (cause === "replacement") h.controller.invalidate();
    h.requests[0].result.resolve(applied(h.ids));
    await running;
    assert.equal(h.commits(), 0);
    assert.equal(h.notices.length, 0);
  });
}

for (const cause of ["groups", "locks", "invalidation"] as const) {
test(`history updater checks ${cause} again before applying queued changes`, async () => {
  const h = setup();
  h.delayCommit();
  const running = h.controller.apply(h.ids, configuration);
  h.requests[0].result.resolve(applied(h.ids));
  await running;
  if (cause === "groups") h.changeGroups();
  if (cause === "locks") h.change(state => ({ ...state, pilePlans: state.pilePlans.map(plan =>
    plan.id === state.activePilePlanId ? { ...plan, lockedLoadPointIds: h.ids } : plan) }));
  if (cause === "invalidation") h.controller.invalidate();
  const before = h.state();
  h.flush();
  assert.equal(h.state(), before);
});
}

test("obsolete requests cannot clear pending state or show late errors", async () => {
  const h = setup();
  const first = h.controller.apply(h.ids, configuration);
  const second = h.controller.apply(h.ids, null);
  h.requests[0].result.reject(new Error("old failure"));
  await first;
  assert.deepEqual(h.pending, [true, true]);
  assert.deepEqual(h.errors, []);
  h.requests[1].result.resolve({ status: "applied", changes: [] });
  await second;
  assert.deepEqual(h.pending, [true, true, false]);
  assert.equal(h.commits(), 0);
});

test("empty selection and unfinished groups never call Rust", async () => {
  const h = setup();
  await h.controller.apply([], configuration);
  h.notReady();
  await h.controller.apply(h.ids, configuration);
  assert.equal(h.requests.length, 0);
});

test("current failures report errors and release pending state", async () => {
  const h = setup();
  const running = h.controller.apply(h.ids, configuration);
  h.requests[0].result.reject(new Error("unavailable"));
  await running;
  assert.deepEqual(h.errors, ["unavailable"]);
  assert.deepEqual(h.pending, [true, false]);
});
