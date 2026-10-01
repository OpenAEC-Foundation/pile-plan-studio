import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import type { LoadPointGroupEditInput, LoadPointGroupEditResult, LoadPointGroupEditPreview } from "../../core/loadPointGroupContract.ts";
import { createInitialProjectState, type ProjectState } from "../../domain/project/projectState.ts";
import type { HistoryAction } from "../../domain/project/history/historyAction.ts";
import { createGroupEditController } from "./groupEditController.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let state = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  const ids = state.loadPoints.slice(0, 2).map(point => point.id);
  state = { ...state, selectedLoadPointIds: [ids[0]], selectedLoadPointId: ids[0] };
  let ready = true, delayed = false;
  let queued: ((state: ProjectState) => ProjectState) | null = null;
  const commits: HistoryAction[] = [], blocked: string[] = [], pending: boolean[] = [];
  const edits: { input: LoadPointGroupEditInput; result: ReturnType<typeof deferred<LoadPointGroupEditResult>> }[] = [];
  const previews: { input: LoadPointGroupEditInput; result: ReturnType<typeof deferred<LoadPointGroupEditPreview>> }[] = [];
  const controller = createGroupEditController({
    currentState: () => state, ready: () => ready,
    evaluate: input => { const result = deferred<LoadPointGroupEditResult>(); edits.push({ input, result }); return result.promise; },
    preview: input => { const result = deferred<LoadPointGroupEditPreview>(); previews.push({ input, result }); return result.promise; },
    commit: (update, action) => { commits.push(action); if (delayed) queued = update; else state = update(state); },
    setPending: value => pending.push(value), blocked: reason => blocked.push(reason),
  });
  const applied = (): LoadPointGroupEditResult => ({ status: "applied",
    settings: { ...state.loadPointGroupingSettings, manualGroups: [{ loadPointIds: [...ids] }], ungroupedGroups: [] },
    grouping: { groups: [{ load_point_ids: ids }], topology: { load_point_ids: ids, edges: [], faces: [] } } });
  return { controller, edits, previews, commits, blocked, pending, ids, applied,
    state: () => state, change: (update: (state: ProjectState) => ProjectState) => { state = update(state); },
    notReady: () => { ready = false; }, delay: () => { delayed = true; }, flush: () => { if (queued) state = queued(state); } };
}

for (const action of ["group", "ungroup", "reset_overrides"] as const) {
  test(`${action} commits cloned settings once and preserves assignments`, async () => {
    const h = setup(), before = h.state();
    const running = h.controller.apply(action);
    const result = h.applied();
    h.edits[0].result.resolve(result);
    await running;
    assert.deepEqual(h.commits, [{ kind: action === "group" ? "group-created" : action === "ungroup" ? "group-removed" : "group-overrides-reset" }]);
    assert.equal(h.state().selectedPileConfigurationsByLoadPoint, before.selectedPileConfigurationsByLoadPoint);
    assert.equal(h.state().pilePlans, before.pilePlans);
    assert.notEqual(h.state().loadPointGroupingSettings, result.status === "applied" ? result.settings : null);
    assert.deepEqual(h.state().selectedLoadPointIds, action === "group" ? h.ids : [h.ids[0]]);
    if (result.status === "applied") {
      result.settings.manualGroups[0].loadPointIds.push(-1);
      assert.deepEqual(h.state().loadPointGroupingSettings.manualGroups[0].loadPointIds, h.ids);
    }
    assert.deepEqual(h.pending, [true, false]);
  });
}

test("blocked Rust result shows its reason without a history commit", async () => {
  const h = setup();
  const running = h.controller.apply("group");
  h.edits[0].result.resolve({ status: "blocked", reason: "disconnected_selection", load_point_ids: h.ids });
  await running;
  assert.deepEqual(h.blocked, ["disconnected_selection"]);
  assert.equal(h.commits.length, 0);
});

for (const cause of ["loadPoints", "settings", "invalidation"] as const) {
  test(`ignores group results after ${cause} changes`, async () => {
    const h = setup();
    const running = h.controller.apply("group");
    if (cause === "loadPoints") h.change(state => ({ ...state, loadPoints: [...state.loadPoints] }));
    if (cause === "settings") h.change(state => ({ ...state, loadPointGroupingSettings: { ...state.loadPointGroupingSettings } }));
    if (cause === "invalidation") h.controller.invalidate();
    h.edits[0].result.resolve(h.applied());
    await running;
    assert.equal(h.commits.length, 0);
  });
}

test("queued history update rechecks settings before installation", async () => {
  const h = setup(); h.delay();
  const running = h.controller.apply("group");
  h.edits[0].result.resolve(h.applied()); await running;
  h.change(state => ({ ...state, loadPointGroupingSettings: { ...state.loadPointGroupingSettings } }));
  const before = h.state(); h.flush(); assert.equal(h.state(), before);
});

test("concurrent group edits are rejected immediately", async () => {
  const h = setup();
  const running = h.controller.apply("group");
  await h.controller.apply("ungroup");
  assert.equal(h.edits.length, 1);
  h.edits[0].result.resolve(h.applied()); await running;
});

test("unavailable groups suppress edits and previews", async () => {
  const h = setup(); h.notReady();
  await h.controller.apply("group");
  assert.equal(await h.controller.preview("group"), null);
  assert.equal(h.edits.length + h.previews.length, 0);
});

test("failed group edit releases pending state and preserves the rejection", async () => {
  const h = setup(); const running = h.controller.apply("group");
  h.edits[0].result.reject(new Error("core failed"));
  await assert.rejects(running, /core failed/);
  assert.deepEqual(h.pending, [true, false]);
});

test("preview uses a captured selection and ignores changed source data", async () => {
  const h = setup(), selected = [...h.ids];
  const running = h.controller.preview("group", selected);
  selected.push(-1);
  assert.deepEqual(h.previews[0].input.selectedLoadPointIds, h.ids);
  h.change(state => ({ ...state, loadPoints: [...state.loadPoints] }));
  h.previews[0].result.resolve({ allowed: true, reason: null });
  assert.equal(await running, null);
});
