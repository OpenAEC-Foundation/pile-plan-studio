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
const snapshot = {
  state,
  marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [{ load_point_ids: [pointId], origin: "manual" as const }], topology: { load_point_ids: [pointId], edges: [], faces: [] }, pending: false, error: null },
};

describe("MCP project writes", () => {
  it("duplicates a plan through the existing project operation", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_duplicate_plan", { plan_id: state.activePilePlanId });
    const next = prepared.update(state);
    assert.equal(prepared.changed, true);
    assert.equal(next.pilePlans.length, state.pilePlans.length + 1);
    assert.equal(next.activePilePlanId, prepared.data.plan_id);
    assert.equal(state.pilePlans.length, 1);
  });

  it("renames a known plan and rejects an unknown one", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_rename_plan", { plan_id: state.activePilePlanId, name: "  Nieuwe naam  " });
    assert.equal(prepared.update(state).pilePlans[0].name, "Nieuwe naam");
    await assert.rejects(prepareMcpWrite(snapshot, "pile_rename_plan", { plan_id: "missing", name: "X" }), /unknown_id/);
  });

  it("records an MCP plan edit in the same undo history as interface edits", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_rename_plan", { plan_id: state.activePilePlanId, name: "AI variant" });
    const original = createManagedProjectState(state);
    const edited = projectHistoryReducer(original, { type: "commit", update: prepared.update });
    assert.equal(edited.present.pilePlans[0].name, "AI variant");
    assert.equal(edited.history.past.length, 1);
    const undone = projectHistoryReducer(edited, { type: "undo" });
    assert.equal(undone.present.pilePlans[0].name, state.pilePlans[0].name);
  });

  it("checks the requested option before invoking Rust group assignment", async () => {
    let called = false;
    await assert.rejects(prepareMcpWrite(snapshot, "pile_assign_configuration", {
      plan_id: state.activePilePlanId, load_point_id: pointId, pile_size_mm: 999, pile_tip_level_mm: -10000,
    }, { applyAssignment: async () => { called = true; return { status: "applied", changes: [] }; } }), /analysis_pending/);
    assert.equal(called, false);
  });

  it("uses Rust group changes and preserves the original assignment map", async () => {
    const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const withOptions = { ...state, pileOptionsByLoadPointId: new Map([[pointId, [{ configuration }]]]), selectedCptsByLoadPointId: new Map([[pointId, []]]) };
    const prepared = await prepareMcpWrite({ ...snapshot, state: withOptions }, "pile_assign_configuration", {
      plan_id: state.activePilePlanId, load_point_id: pointId, ...configuration,
    }, { applyAssignment: async (input) => {
      assert.deepEqual(input.selectedLoadPointIds, [pointId]);
      return { status: "applied", changes: [{ load_point_id: pointId, configuration }] };
    } });
    const next = prepared.update(withOptions);
    assert.deepEqual(next.selectedPileConfigurationsByLoadPoint.get(pointId), configuration);
    assert.equal(withOptions.selectedPileConfigurationsByLoadPoint.has(pointId), false);
    assert.deepEqual(prepared.data.changed_load_point_ids, [pointId]);
  });

  it("clears an assignment through Rust and rejects a locked group", async () => {
    const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const assigned = { ...state, selectedPileConfigurationsByLoadPoint: new Map([[pointId, configuration]]) };
    const prepared = await prepareMcpWrite({ ...snapshot, state: assigned }, "pile_clear_assignment", {
      plan_id: state.activePilePlanId, load_point_id: pointId,
    }, { applyAssignment: async (input) => {
      assert.equal(input.requestedConfiguration, null);
      return { status: "applied", changes: [{ load_point_id: pointId, configuration: null }] };
    } });
    assert.equal(prepared.update(assigned).selectedPileConfigurationsByLoadPoint.has(pointId), false);
    assert.equal(assigned.selectedPileConfigurationsByLoadPoint.has(pointId), true);
    await assert.rejects(prepareMcpWrite({ ...snapshot, state: assigned }, "pile_clear_assignment", {
      plan_id: state.activePilePlanId, load_point_id: pointId,
    }, { applyAssignment: async () => ({ status: "blocked", involved_load_point_ids: [pointId], blocking_locked_load_points: [] }) }), /locked_load_points/);
  });
});
