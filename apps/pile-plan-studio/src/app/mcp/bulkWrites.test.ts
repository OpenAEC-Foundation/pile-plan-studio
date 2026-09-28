import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { prepareMcpWrite } from "./writeModel.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const ids = base.loadPoints.slice(0, 80).map((point) => point.id);
const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
const otherConfiguration = { pile_size_mm: 350, pile_tip_level_mm: -13000 };
const groups = ids.map((id) => ({ load_point_ids: [id], origin: "automatic" as const }));
const state = { ...base,
  pileOptionsByLoadPointId: new Map(ids.map((id) => [id, [{ configuration }, { configuration: otherConfiguration }]])),
  selectedCptsByLoadPointId: new Map(ids.map((id) => [id, []])),
};
const snapshot = { state, marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups, topology: { load_point_ids: ids, edges: [], faces: [] }, pending: false, error: null } };

describe("MCP bulk writes", () => {
  it("applies 80 assignments as one history entry and one Undo", async () => {
    const changes = ids.map((load_point_id, index) => ({ load_point_id,
      configuration: index % 2 === 0 ? configuration : otherConfiguration }));
    const prepared = await prepareMcpWrite(snapshot, "pile_set_assignments_bulk", {
      plan_id: state.activePilePlanId,
      changes,
    }, { applyAssignmentBatch: async () => ({ status: "applied", changes }) });
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(ids.filter((id) => after.present.selectedPileConfigurationsByLoadPoint.has(id)).length, 80);
    assert.deepEqual(after.present.selectedPileConfigurationsByLoadPoint.get(ids[1]), otherConfiguration);
    const undone = projectHistoryReducer(after, { type: "undo" });
    assert.equal(ids.filter((id) => undone.present.selectedPileConfigurationsByLoadPoint.has(id)).length, 0);
    const redone = projectHistoryReducer(undone, { type: "redo" });
    assert.equal(ids.filter((id) => redone.present.selectedPileConfigurationsByLoadPoint.has(id)).length, 80);
  });

  it("changes CPT selections together while preserving empty versus automatic", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_cpt_selections_bulk", {
      changes: [{ load_point_id: ids[0], cpt_ids: [] }, { load_point_id: ids[1], cpt_ids: null }],
    }, { validateCptBatch: async () => ({ status: "valid", changes: [
      { load_point_id: ids[0], cpt_ids: [] }, { load_point_id: ids[1], cpt_ids: null },
    ] }) });
    const next = prepared.update(state);
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(ids[0]), []);
    assert.equal(next.manualCptIdsByLoadPoint.has(ids[1]), false);
    assert.equal(next.analysisRequest.revision, state.analysisRequest.revision + 1);
  });

  it("sets different lock values per location in one update", async () => {
    const lockedState = { ...state, pilePlans: state.pilePlans.map((plan) => ({
      ...plan, lockedLoadPointIds: [ids[1]],
    })) };
    const prepared = await prepareMcpWrite({ ...snapshot, state: lockedState }, "pile_set_load_point_locks_bulk", {
      plan_id: state.activePilePlanId,
      changes: [{ load_point_id: ids[0], locked: true }, { load_point_id: ids[1], locked: false }],
    }, { validateLockBatch: async () => ({ status: "valid", changes: [
      { load_point_id: ids[0], locked: true }, { load_point_id: ids[1], locked: false },
    ] }) });
    const after = projectHistoryReducer(createManagedProjectState(lockedState), { type: "commit", update: prepared.update });
    assert.deepEqual(after.present.pilePlans[0].lockedLoadPointIds, [ids[0]]);
    assert.equal(after.history.past.length, 1);
    assert.deepEqual(projectHistoryReducer(after, { type: "undo" }).present.pilePlans[0].lockedLoadPointIds, [ids[1]]);
  });

  it("uses one Rust result to separate multiple groups", async () => {
    const settings = { ...state.loadPointGroupingSettings,
      ungroupedGroups: [{ loadPointIds: [ids[0], ids[1]] }, { loadPointIds: [ids[2], ids[3]] }] };
    let received: number[] = [];
    const prepared = await prepareMcpWrite(snapshot, "pile_ungroup_load_points_bulk", {
      load_point_ids: [ids[0], ids[2]],
    }, { applyUngroupBatch: async (input) => {
      received = input.selectedLoadPointIds;
      return { status: "applied", settings,
        grouping: { groups: [], topology: { load_point_ids: ids, edges: [], faces: [] } } };
    } });
    assert.deepEqual(received, [ids[0], ids[2]]);
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(after.present.loadPointGroupingSettings.ungroupedGroups.length, 2);
  });

  it("counts one original group once when two of its members are named", async () => {
    const together = { ...snapshot, groups: { ...snapshot.groups,
      groups: [{ load_point_ids: [ids[0], ids[1], ids[2]], origin: "automatic" as const }, ...groups.slice(3)] } };
    const settings = { ...state.loadPointGroupingSettings,
      ungroupedGroups: [{ loadPointIds: [ids[0], ids[1], ids[2]] }] };
    const prepared = await prepareMcpWrite(together, "pile_ungroup_load_points_bulk", {
      load_point_ids: [ids[0], ids[1]],
    }, { applyUngroupBatch: async () => ({ status: "applied", settings,
      grouping: { groups: [], topology: { load_point_ids: ids, edges: [], faces: [] } } }) });
    assert.equal(prepared.data.changed_count, 3);
    assert.deepEqual(prepared.data.changed_load_point_ids, [ids[0], ids[1], ids[2]]);
  });

  it("does not prepare a partial assignment when Rust reports a locked group", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_assignments_bulk", {
      plan_id: state.activePilePlanId,
      changes: ids.slice(0, 2).map((load_point_id) => ({ load_point_id, configuration })),
    }, { applyAssignmentBatch: async () => ({ status: "blocked", reason: "locked_load_points",
      load_point_ids: [ids[1]] }) }), /locked_load_points/);
    assert.equal(state.selectedPileConfigurationsByLoadPoint.size, base.selectedPileConfigurationsByLoadPoint.size);
  });

  it("does not record an Undo entry for an unchanged bulk lock request", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_load_point_locks_bulk", {
      plan_id: state.activePilePlanId, changes: [{ load_point_id: ids[0], locked: false }],
    }, { validateLockBatch: async () => ({ status: "valid", changes: [{ load_point_id: ids[0], locked: false }] }) });
    assert.equal(prepared.changed, false);
    assert.equal(prepared.update(state), state);
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 0);
  });
});
