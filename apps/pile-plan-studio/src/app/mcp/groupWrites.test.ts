import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import type { LoadPointGroupEditInput, LoadPointGroupEditResult } from "../../core/loadPointGroupContract.ts";
import { prepareMcpWrite } from "./writeModel.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const ids = [state.loadPoints[0].id, state.loadPoints[1].id];
const snapshot = {
  state,
  marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: ids, edges: [], faces: [] }, pending: false, error: null },
};
const grouping = { groups: [{ load_point_ids: ids, origin: "manual" as const }],
  topology: { load_point_ids: ids, edges: [], faces: [] } };

describe("MCP group writes", () => {
  it("passes explicit load points to Rust and commits only its returned group settings", async () => {
    let received: LoadPointGroupEditInput | null = null;
    const settings = { ...state.loadPointGroupingSettings, manualGroups: [{ loadPointIds: ids }] };
    const core = async (input: LoadPointGroupEditInput): Promise<LoadPointGroupEditResult> => {
      received = input;
      return { status: "applied", settings, grouping };
    };
    const prepared = await prepareMcpWrite(snapshot, "pile_group_load_points", {
      load_point_ids: ids,
    }, { applyGroupEdit: core });
    assert.deepEqual(received?.selectedLoadPointIds, ids);
    assert.equal(received?.action, "group");
    const next = prepared.update(state);
    assert.deepEqual(next.loadPointGroupingSettings.manualGroups, [{ loadPointIds: ids }]);
    assert.equal(next.selectedPileConfigurationsByLoadPoint, state.selectedPileConfigurationsByLoadPoint);
    assert.notEqual(next.loadPointGroupingSettings, state.loadPointGroupingSettings);
    const recorded = projectHistoryReducer(createManagedProjectState(state), {
      type: "commit", update: prepared.update, action: { kind: "group-created" },
    });
    assert.equal(recorded.history.past.length, 1);
    assert.equal(recorded.history.past[0].action.kind, "group-created");
    assert.deepEqual(projectHistoryReducer(recorded, { type: "undo" }).present
      .loadPointGroupingSettings.manualGroups, state.loadPointGroupingSettings.manualGroups);
  });

  it("sends a single member to Rust and preserves the returned automatic separation", async () => {
    const settings = { ...state.loadPointGroupingSettings,
      ungroupedGroups: [{ loadPointIds: ids }] };
    const prepared = await prepareMcpWrite(snapshot, "pile_ungroup_load_points", {
      load_point_id: ids[0],
    }, { applyGroupEdit: async (input) => {
      assert.equal(input.action, "ungroup");
      assert.deepEqual(input.selectedLoadPointIds, [ids[0]]);
      return { status: "applied", settings, grouping };
    } });
    assert.deepEqual(prepared.update(state).loadPointGroupingSettings.ungroupedGroups,
      [{ loadPointIds: ids }]);
  });

  it("returns a Rust topology block reason without preparing a mutation", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_group_load_points", {
      load_point_ids: ids,
    }, { applyGroupEdit: async () => ({ status: "blocked", reason: "disconnected_selection", load_point_ids: ids }) }),
    /disconnected_selection/);
  });

  it("rejects unknown IDs and pending derived groups before calling Rust", async () => {
    let called = false;
    const core = async (): Promise<LoadPointGroupEditResult> => {
      called = true;
      return { status: "applied", settings: state.loadPointGroupingSettings, grouping };
    };
    await assert.rejects(prepareMcpWrite(snapshot, "pile_group_load_points", {
      load_point_ids: [ids[0], 999999],
    }, { applyGroupEdit: core }), /unknown_id/);
    await assert.rejects(prepareMcpWrite({ ...snapshot, groups: { ...snapshot.groups, pending: true } },
      "pile_group_load_points", { load_point_ids: ids }, { applyGroupEdit: core }), /groups_pending/);
    assert.equal(called, false);
  });
});
