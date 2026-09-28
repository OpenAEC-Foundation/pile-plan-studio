import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { duplicatePilePlan } from "../../domain/pile-plans/pilePlanManagement.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { prepareMcpWrite } from "./writeModel.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const pointId = base.loadPoints[0].id;
const otherId = base.loadPoints[1].id;
const duplicate = duplicatePilePlan({ ...base, sourcePilePlanId: base.activePilePlanId, language: "nl" });
const state = { ...base, ...duplicate };
const snapshot = {
  state,
  marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null },
};

describe("MCP plan writes", () => {
  it("activates another plan, synchronizes the outgoing assignment and drops locked selections", async () => {
    const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const withSelection = {
      ...state,
      selectedPileConfigurationsByLoadPoint: new Map([[otherId, configuration]]),
      selectedLoadPointIds: [pointId], selectedLoadPointId: pointId,
      loadPointLockDraft: new Set([pointId]),
      loadPointLockSelectionSnapshot: { selectedLoadPointIds: [pointId], selectedLoadPointId: pointId, selectedCptId: null },
      pilePlans: state.pilePlans.map((plan) => plan.id === base.activePilePlanId
        ? { ...plan, lockedLoadPointIds: [pointId] } : plan),
    };
    const prepared = await prepareMcpWrite({ ...snapshot, state: withSelection }, "pile_activate_plan", {
      plan_id: base.activePilePlanId,
    });
    const next = prepared.update(withSelection);
    assert.equal(prepared.mode, "navigation");
    assert.equal(next.activePilePlanId, base.activePilePlanId);
    assert.deepEqual(next.pilePlans.find((plan) => plan.id === state.activePilePlanId)?.selectedPileConfigurationsByLoadPoint.get(otherId), configuration);
    assert.deepEqual(next.selectedLoadPointIds, []);
    assert.equal(next.selectedLoadPointId, null);
    assert.equal(next.loadPointLockDraft, null);
    assert.equal(next.loadPointLockSelectionSnapshot, null);
    const navigated = projectHistoryReducer(createManagedProjectState(withSelection), {
      type: "runtime", update: prepared.update,
    });
    assert.equal(navigated.present.activePilePlanId, base.activePilePlanId);
    assert.equal(navigated.history.past.length, 0);
  });

  it("deletes a variant with one undo step but protects the last plan", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_delete_plan", { plan_id: state.activePilePlanId });
    const original = createManagedProjectState(state);
    const edited = projectHistoryReducer(original, { type: "commit", update: prepared.update });
    assert.equal(edited.present.pilePlans.length, 1);
    assert.equal(edited.present.activePilePlanId, base.activePilePlanId);
    assert.equal(edited.history.past.length, 1);
    assert.equal(projectHistoryReducer(edited, { type: "undo" }).present.pilePlans.length, 2);
    await assert.rejects(prepareMcpWrite({ ...snapshot, state: base }, "pile_delete_plan", {
      plan_id: base.activePilePlanId,
    }), /last_plan/);
  });

  it("locks and unlocks one point in the active plan without changing another point", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_load_point_lock", {
      plan_id: state.activePilePlanId, load_point_id: pointId, locked: true,
    });
    assert.equal(prepared.changed, true);
    const locked = prepared.update({ ...state, selectedCptId: state.cpts[0].id });
    assert.deepEqual(locked.pilePlans.find((plan) => plan.id === state.activePilePlanId)?.lockedLoadPointIds, [pointId]);
    assert.equal(locked.pilePlans.find((plan) => plan.id === state.activePilePlanId)?.lockedLoadPointIds.includes(otherId), false);
    assert.equal(locked.selectedCptId, null);
    const recorded = projectHistoryReducer(createManagedProjectState(state), {
      type: "commit", update: prepared.update,
    });
    assert.equal(recorded.history.past.length, 1);
    assert.deepEqual(projectHistoryReducer(recorded, { type: "undo" }).present.pilePlans
      .find((plan) => plan.id === state.activePilePlanId)?.lockedLoadPointIds, []);
    const repeated = await prepareMcpWrite({ ...snapshot, state: locked }, "pile_set_load_point_lock", {
      plan_id: state.activePilePlanId, load_point_id: pointId, locked: true,
    });
    assert.equal(repeated.changed, false);
    const unlocked = await prepareMcpWrite({ ...snapshot, state: locked }, "pile_set_load_point_lock", {
      plan_id: state.activePilePlanId, load_point_id: pointId, locked: false,
    });
    assert.deepEqual(unlocked.update(locked).pilePlans.find((plan) => plan.id === state.activePilePlanId)?.lockedLoadPointIds, []);
  });

  it("rejects unknown and inactive IDs before a plan or lock edit", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_activate_plan", { plan_id: "missing" }), /unknown_id/);
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_load_point_lock", {
      plan_id: base.activePilePlanId, load_point_id: pointId, locked: true,
    }), /plan_not_active/);
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_load_point_lock", {
      plan_id: state.activePilePlanId, load_point_id: 999999, locked: true,
    }), /unknown_id/);
  });
});
