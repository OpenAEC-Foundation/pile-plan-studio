import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import {
  createManagedProjectState,
  projectHistoryReducer,
} from "../../domain/project/history/projectHistoryReducer.ts";
import { createPileCapProposalController, type PileCapProposalSnapshot } from "./pileCapProposalController.ts";
import type { PileCapProposalResult } from "../../core/pileCapProposalTypes.ts";

function fixture() {
  const p = canonicalProjectForTest(
    readFileSync("../../sample_project/sample_project.ifcpp", "utf8"),
  );
  return createInitialProjectState(
    p,
    { initializeDefaultPiles: false },
    projectTipLevelKeysForTest(p),
  );
}
const proposal = {
  load_point_ids: [15, 43],
  pile_count: 3,
  quarter_turns: 0,
  configuration: null,
};
const result = (planId: string): PileCapProposalResult => ({
  plans: [
    {
      plan_id: planId,
      proposals: [proposal],
      previews: [],
      pile_count: 329,
      total_cost: 123,
      missing_cost_count: 0,
    },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("an accepted proposal is exactly one undoable plan edit and never a source assignment", async () => {
  let managed = createManagedProjectState(fixture());
  const before = managed.present;
  const controller = createPileCapProposalController({
    evaluate: async () => result(before.activePilePlanId),
    currentState: () => managed.present,
    commit: (update) => {
      managed = projectHistoryReducer(managed, { type: "commit", update });
    },
    publish: () => {},
    failed: () => assert.fail("unexpected failure"),
  });
  await controller.edit(proposal);
  assert.equal(managed.history.past.length, 1);
  assert.deepEqual(managed.present.pilePlans[0].pileCapProposals, [proposal]);
  assert.equal(managed.present.loadPoints, before.loadPoints);
  assert.equal(
    managed.present.selectedPileConfigurationsByLoadPoint,
    before.selectedPileConfigurationsByLoadPoint,
  );
  managed = projectHistoryReducer(managed, { type: "undo" });
  assert.equal(managed.present.pilePlans[0].pileCapProposals?.length ?? 0, 0);
  managed = projectHistoryReducer(managed, { type: "redo" });
  assert.deepEqual(managed.present.pilePlans[0].pileCapProposals, [proposal]);
});

test("a late result cannot modify a newly opened project with identical content", async () => {
  let state = fixture();
  const pending = deferred<PileCapProposalResult>();
  let commits = 0;
  const controller = createPileCapProposalController({
    evaluate: () => pending.promise,
    currentState: () => state,
    commit: (update) => {
      commits++;
      state = update(state);
    },
    publish: () => {},
    failed: () => assert.fail("unexpected failure"),
  });
  const run = controller.edit(proposal);
  const id = state.activePilePlanId;
  state = structuredClone(state);
  pending.resolve(result(id));
  await run;
  assert.equal(commits, 0);
  assert.equal(state.pilePlans[0].pileCapProposals?.length ?? 0, 0);
});

test("switching plans or disposing prevents a late proposal edit", async () => {
  for (const dispose of [false, true]) {
    let state = fixture();
    const pending = deferred<PileCapProposalResult>();
    let commits = 0;
    const controller = createPileCapProposalController({
      evaluate: () => pending.promise,
      currentState: () => state,
      commit: () => {
        commits++;
      },
      publish: () => {},
      failed: () => assert.fail("unexpected failure"),
    });
    const id = state.activePilePlanId,
      run = controller.edit(proposal);
    if (dispose) controller.dispose();
    else state = { ...state, activePilePlanId: "other" };
    pending.resolve(result(id));
    await run;
    assert.equal(commits, 0);
  }
});

test("the validated edit result is reused by the following refresh without duplicate calculation", async () => {
  let state = fixture(),
    calls = 0;
  const snapshots: unknown[] = [];
  const controller = createPileCapProposalController({
    evaluate: async () => {
      calls++;
      return result(state.activePilePlanId);
    },
    currentState: () => state,
    commit: (update) => {
      state = update(state);
    },
    publish: (snapshot) => snapshots.push(snapshot),
    failed: () => assert.fail("unexpected failure"),
  });
  await controller.edit(proposal);
  await controller.refresh(state);
  assert.equal(calls, 1);
  assert.equal((snapshots.at(-1) as { pending: boolean }).pending, false);
  state = { ...state, pileHeadLevelM: state.pileHeadLevelM === 0 ? 1 : 0 };
  await controller.refresh(state);
  assert.equal(
    calls,
    2,
    "changed engineering inputs still invalidate the result",
  );
});

test("reset all validates one cleared draft, commits once and preserves other plans through undo/redo", async () => {
  const base = fixture(), id = base.activePilePlanId;
  const proposals = [proposal, { ...proposal, load_point_ids: [999999], pile_count: 5 }];
  const other = { ...base.pilePlans[0], id: "other", pileCapProposals: [proposal] };
  let managed = createManagedProjectState({ ...base, pilePlans: [
    { ...base.pilePlans[0], pileCapProposals: proposals }, other,
  ] });
  const before = managed.present;
  let evaluations = 0;
  const controller = createPileCapProposalController({
    evaluate: async (draft, edit) => {
      evaluations++;
      assert.equal(edit, undefined);
      assert.deepEqual(draft.user_state.pile_plans.find(p => p.id === id)?.pile_cap_proposals, []);
      assert.deepEqual(draft.user_state.pile_plans.find(p => p.id === "other")?.pile_cap_proposals, [proposal]);
      return { plans: [{ ...result(id).plans[0], proposals: [] }] };
    },
    currentState: () => managed.present,
    commit: update => { managed = projectHistoryReducer(managed, { type: "commit", update }); },
    publish: () => {}, failed: () => assert.fail("unexpected failure"),
  });
  await controller.resetAll();
  assert.equal(evaluations, 1);
  assert.equal(managed.history.past.length, 1);
  assert.deepEqual(managed.present.pilePlans[0].pileCapProposals, []);
  assert.equal(managed.present.pilePlans[1], other);
  assert.equal(managed.present.loadPoints, before.loadPoints);
  assert.equal(managed.present.selectedPileConfigurationsByLoadPoint, before.selectedPileConfigurationsByLoadPoint);
  await controller.refresh(managed.present);
  assert.equal(evaluations, 1, "the validated reset result is reused");
  managed = projectHistoryReducer(managed, { type: "undo" });
  assert.deepEqual(managed.present.pilePlans[0].pileCapProposals, proposals);
  managed = projectHistoryReducer(managed, { type: "redo" });
  assert.deepEqual(managed.present.pilePlans[0].pileCapProposals, []);
  await controller.resetAll();
  assert.equal(evaluations, 1, "an empty plan is a no-op");
  assert.equal(managed.history.past.length, 1);
});

test("a reset result cannot affect another plan or a replaced project, and a rejected reset never commits", async () => {
  for (const mode of ["plan", "project", "reject"] as const) {
    const base = fixture();
    let state = { ...base, pilePlans: base.pilePlans.map(plan => ({ ...plan, pileCapProposals: [proposal] })) };
    const pending = deferred<PileCapProposalResult>();
    let commits = 0, failures = 0;
    const controller = createPileCapProposalController({
      evaluate: mode === "reject" ? async () => { throw Error("validation failed"); } : () => pending.promise,
      currentState: () => state,
      commit: () => { commits++; }, publish: () => {}, failed: () => { failures++; },
    });
    const run = controller.resetAll();
    if (mode === "plan") state = { ...state, activePilePlanId: "other" };
    if (mode === "project") state = structuredClone(state);
    pending.resolve({ plans: [{ ...result(base.activePilePlanId).plans[0], proposals: [] }] });
    await run;
    assert.equal(commits, 0);
    assert.equal(failures, mode === "reject" ? 1 : 0);
    assert.deepEqual(state.pilePlans[0].pileCapProposals, [proposal]);
  }
});

test("editing a cap keeps the active plan's validated previews visible until the new result commits", async () => {
  const base = fixture(), planId = base.activePilePlanId;
  let state: ReturnType<typeof fixture> = { ...base, pilePlans: [
    { ...base.pilePlans[0], pileCapProposals: [proposal] },
    { ...base.pilePlans[0], id: "other", pileCapProposals: [{ ...proposal, pile_count: 5 }] },
  ] };
  const initial: PileCapProposalResult = { plans: [result(planId).plans[0],
    { ...result("other").plans[0], proposals: [{ ...proposal, pile_count: 5 }] }] };
  const pending = deferred<PileCapProposalResult>();
  const snapshots: PileCapProposalSnapshot[] = [];
  const controller = createPileCapProposalController({
    evaluate: async (_draft, edit) => edit ? pending.promise : initial,
    currentState: () => state,
    commit: update => { state = update(state); },
    publish: snapshot => snapshots.push(snapshot), failed: () => assert.fail("unexpected failure"),
  });
  await controller.refresh(state);
  const run = controller.edit({ ...proposal, pile_count: 4 });
  assert.equal(snapshots.at(-1)?.pending, true);
  assert.equal(snapshots.at(-1)?.result, initial, "do not fall back to source-plan geometry during validation");
  assert.equal(state.activePilePlanId, planId);
  assert.equal(state.pilePlans[0].pileCapProposals[0].pile_count, 3);
  const accepted = { plans: initial.plans.map(plan => plan.plan_id === planId
    ? { ...plan, proposals: [{ ...proposal, pile_count: 4 }] } : plan) };
  pending.resolve(accepted);
  await run;
  assert.equal(snapshots.at(-1)?.result, accepted);
  assert.equal(snapshots.at(-1)?.pending, false);
  assert.equal(state.pilePlans[0].pileCapProposals[0].pile_count, 4);
  assert.equal(state.pilePlans[1].pileCapProposals[0].pile_count, 5);
});

test("a failed cap edit retains valid geometry, but a plan/input switch clears incompatible previews", async () => {
  const base = fixture();
  let state: ReturnType<typeof fixture> = { ...base, pilePlans: base.pilePlans.map(plan => ({ ...plan, pileCapProposals: [proposal] })) };
  const snapshots: PileCapProposalSnapshot[] = [];
  let rejectEdit = false;
  const initial = result(state.activePilePlanId);
  const pending = deferred<PileCapProposalResult>();
  const controller = createPileCapProposalController({
    evaluate: async (_draft, edit) => {
      if (edit && rejectEdit) throw Error("edit rejected");
      return rejectEdit ? pending.promise : initial;
    },
    currentState: () => state, commit: update => { state = update(state); },
    publish: snapshot => snapshots.push(snapshot), failed: () => {},
  });
  await controller.refresh(state);
  rejectEdit = true;
  await controller.edit({ ...proposal, pile_count: 4 });
  assert.equal(snapshots.at(-1)?.error, true);
  assert.equal(snapshots.at(-1)?.result, initial);
  state = { ...state, activePilePlanId: "other", pilePlans: state.pilePlans.map(plan => ({ ...plan, pileCapProposals: [proposal] })) };
  const switched = controller.refresh(state);
  assert.equal(snapshots.at(-1)?.result, null, "never expose a result scoped to another active plan");
  state = { ...state, pileHeadLevelM: (state.pileHeadLevelM ?? 0) + 1 };
  const changed = controller.refresh(state);
  assert.equal(snapshots.at(-1)?.result, null, "never expose previews assessed for different engineering inputs");
  pending.resolve(initial);
  await Promise.all([switched, changed]);
});
