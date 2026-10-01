import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../project/history/projectHistoryReducer.ts";
import { beginLoadPointLockEditing, cancelLoadPointLockEditing, clearLoadPointLockDraft,
  finishLoadPointLockEditing } from "./loadPointLockEditing.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
function fixture() {
  const initial = createInitialProjectState(project, { initializeDefaultPiles: true }, projectTipLevelKeysForTest(project));
  const ids = initial.loadPoints.slice(0, 3).map(point => point.id);
  const state = {
    ...initial,
    selectedLoadPointIds: [ids[1]], selectedLoadPointId: ids[1], selectedCptId: initial.cpts[0].id,
    pilePlans: initial.pilePlans.map(plan => plan.id === initial.activePilePlanId ? { ...plan, lockedLoadPointIds: [ids[0]] } : plan),
  };
  return { state, ids };
}

test("starting lock editing snapshots selection and creates an independent draft", () => {
  const { state, ids } = fixture();
  const started = beginLoadPointLockEditing({ ...state, cptSelectionEditDraft: {
    loadPointIds: [ids[1]], cptIdsByLoadPoint: new Map() } });
  assert.deepEqual([...started.loadPointLockDraft!], [ids[0], ids[1]]);
  assert.deepEqual(started.loadPointLockSelectionSnapshot, {
    selectedLoadPointIds: [ids[1]], selectedLoadPointId: ids[1], selectedCptId: state.selectedCptId,
  });
  assert.notEqual(started.loadPointLockSelectionSnapshot!.selectedLoadPointIds, state.selectedLoadPointIds);
  assert.deepEqual(started.selectedLoadPointIds, []);
  assert.equal(started.selectedLoadPointId, null);
  assert.equal(started.selectedCptId, null);
  assert.equal(started.cptSelectionEditDraft, null);
  started.loadPointLockDraft!.add(ids[2]);
  assert.deepEqual(state.pilePlans[0].lockedLoadPointIds, [ids[0]]);
});

test("cancel restores entry selection without changing project locks", () => {
  const { state } = fixture();
  const cancelled = cancelLoadPointLockEditing(beginLoadPointLockEditing(state));
  assert.equal(cancelled.pilePlans, state.pilePlans);
  assert.equal(cancelled.loadPointLockDraft, null);
  assert.equal(cancelled.loadPointLockSelectionSnapshot, null);
  assert.deepEqual(cancelled.selectedLoadPointIds, state.selectedLoadPointIds);
  assert.equal(cancelled.selectedLoadPointId, state.selectedLoadPointId);
  assert.equal(cancelled.selectedCptId, state.selectedCptId);
});

test("cancel without a selection snapshot keeps the current selection", () => {
  const { state } = fixture();
  const cancelled = cancelLoadPointLockEditing({ ...state, loadPointLockDraft: new Set() });
  assert.equal(cancelled.selectedLoadPointIds, state.selectedLoadPointIds);
  assert.equal(cancelled.loadPointLockDraft, null);
});

test("unlock all changes only the current draft", () => {
  const { state } = fixture();
  assert.equal(clearLoadPointLockDraft(state), state);
  const started = beginLoadPointLockEditing(state);
  const cleared = clearLoadPointLockDraft(started);
  assert.equal(cleared.loadPointLockDraft!.size, 0);
  assert.equal(started.loadPointLockDraft!.size, 2);
  assert.equal(cleared.pilePlans, state.pilePlans);
});

test("applying locks only updates the active plan and removes locked points from selection", () => {
  const { state, ids } = fixture();
  const other = { ...state.pilePlans[0], id: "other", lockedLoadPointIds: [ids[2]] };
  const editing = { ...beginLoadPointLockEditing({ ...state, pilePlans: [...state.pilePlans, other] }),
    selectedLoadPointIds: [ids[0], ids[2]], selectedLoadPointId: ids[0], selectedCptId: state.selectedCptId };
  const finished = finishLoadPointLockEditing(editing);
  assert.deepEqual(finished.pilePlans[0].lockedLoadPointIds, [ids[0], ids[1]]);
  assert.equal(finished.pilePlans.at(-1), other);
  assert.deepEqual(finished.selectedLoadPointIds, [ids[2]]);
  assert.equal(finished.selectedLoadPointId, ids[2]);
  assert.equal(finished.selectedCptId, null);
  assert.equal(finished.loadPointLockDraft, null);
  assert.equal(finished.loadPointLockSelectionSnapshot, null);
  assert.equal(finished.selectedPileConfigurationsByLoadPoint, state.selectedPileConfigurationsByLoadPoint);
  assert.deepEqual(editing.pilePlans[0].lockedLoadPointIds, [ids[0]]);
});

test("unchanged locks exit editing without changing plans or current selection", () => {
  const { state, ids } = fixture();
  assert.equal(finishLoadPointLockEditing(state), state);
  const editing = { ...beginLoadPointLockEditing(state), loadPointLockDraft: new Set([ids[0]]),
    selectedLoadPointIds: [ids[2]], selectedLoadPointId: ids[2], selectedCptId: state.selectedCptId };
  const finished = finishLoadPointLockEditing(editing);
  assert.equal(finished.pilePlans, state.pilePlans);
  assert.equal(finished.selectedLoadPointIds, editing.selectedLoadPointIds);
  assert.equal(finished.selectedCptId, editing.selectedCptId);
  assert.equal(finished.loadPointLockSelectionSnapshot, null);
});

test("draft edits have no history and applying locks adds one undoable step", () => {
  const { state, ids } = fixture();
  let managed = createManagedProjectState(state);
  managed = projectHistoryReducer(managed, { type: "runtime", update: beginLoadPointLockEditing });
  assert.equal(managed.history.past.length, 0);
  managed = projectHistoryReducer(managed, { type: "commit", update: finishLoadPointLockEditing });
  assert.equal(managed.history.past.length, 1);
  assert.deepEqual(managed.present.pilePlans[0].lockedLoadPointIds, [ids[0], ids[1]]);
  managed = projectHistoryReducer(managed, { type: "undo" });
  assert.deepEqual(managed.present.pilePlans[0].lockedLoadPointIds, [ids[0]]);
  managed = projectHistoryReducer(managed, { type: "redo" });
  assert.deepEqual(managed.present.pilePlans[0].lockedLoadPointIds, [ids[0], ids[1]]);
  assert.equal(managed.present.loadPointLockDraft, null);
});

test("applying an unchanged draft creates no undo step", () => {
  const { state, ids } = fixture();
  let managed = createManagedProjectState(state);
  managed = projectHistoryReducer(managed, { type: "runtime", update: current => ({
    ...beginLoadPointLockEditing(current), loadPointLockDraft: new Set([ids[0]]) }) });
  managed = projectHistoryReducer(managed, { type: "commit", update: finishLoadPointLockEditing });
  assert.equal(managed.history.past.length, 0);
});
