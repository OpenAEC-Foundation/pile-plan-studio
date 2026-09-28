import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { prepareMcpWrite } from "./writeModel.ts";
import { initSync } from "../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";
import { calculatePileCostCore } from "../../core/analysisCoreClient.ts";
import { readPlanAssessment } from "./planAssessments.ts";

initSync({ module: readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const ids = state.loadPoints.slice(0, 2).map((point) => point.id);
const snapshot = { state, marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: ids, edges: [], faces: [] }, pending: false, error: null } };

describe("MCP project settings writes", () => {
  it("sets different CPT distances in one Undo entry", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_cpt_selection_settings_bulk", {
      changes: [{ load_point_id: ids[0], settings: { max_distance_m: 18 } },
        { load_point_id: ids[1], settings: { max_distance_m: 30 } }],
    });
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(after.present.cptSelectionSettingsByLoadPoint.get(ids[0])?.maxDistanceM, 18);
    assert.equal(after.present.cptSelectionSettingsByLoadPoint.get(ids[1])?.maxDistanceM, 30);
    assert.deepEqual(after.present.analysisRequest.loadPointIds, ids);
    const undone = projectHistoryReducer(after, { type: "undo" });
    assert.equal(undone.present.cptSelectionSettingsByLoadPoint.has(ids[0]), false);
  });

  it("keeps eighty different CPT rule changes in one Undo entry", async () => {
    const targets = state.loadPoints.slice(0, 80).map((point) => point.id);
    const prepared = await prepareMcpWrite(snapshot, "pile_set_cpt_selection_settings_bulk", {
      changes: targets.map((load_point_id, index) => ({ load_point_id,
        settings: { max_distance_m: 10 + index } })),
    });
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(after.present.cptSelectionSettingsByLoadPoint.get(targets[79])?.maxDistanceM, 89);
    assert.equal(projectHistoryReducer(after, { type: "undo" }).present.cptSelectionSettingsByLoadPoint.has(targets[79]), false);
  });

  it("rejects duplicate CPT-rule targets without a partial update", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_set_cpt_selection_settings_bulk", {
      changes: [{ load_point_id: ids[0], settings: { max_distance_m: 18 } },
        { load_point_id: ids[0], settings: { max_distance_m: 30 } }],
    }), /duplicate_target/);
    assert.equal(state.cptSelectionSettingsByLoadPoint.has(ids[0]), false);
  });

  it("changes grouping settings without touching assignments", async () => {
    const prepared = await prepareMcpWrite(snapshot, "pile_set_grouping_settings", {
      automatic: false, max_edge_distance_m: 2,
    });
    const next = prepared.update(state);
    assert.equal(next.loadPointGroupingSettings.automatic, false);
    assert.equal(next.loadPointGroupingSettings.maxEdgeDistanceM, 2);
    assert.equal(next.selectedPileConfigurationsByLoadPoint, state.selectedPileConfigurationsByLoadPoint);
  });

  it("applies mixed cost actions atomically and changes plan cost inputs", async () => {
    const old = state.pileCostSettings.items[0];
    const prepared = await prepareMcpWrite(snapshot, "pile_edit_cost_catalog_bulk", {
      actions: [{ action: "update", pile_size_mm: old.pile_size_mm, cost_per_m3: old.cost_per_m3 + 10 },
        { action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } }],
    });
    const next = prepared.update(state);
    assert.equal(next.pileCostSettings.items.find((item) => item.pile_size_mm === old.pile_size_mm)?.cost_per_m3, old.cost_per_m3 + 10);
    assert.equal(next.pileCostSettings.items.find((item) => item.pile_size_mm === 999)?.cost_per_m3, 200);
    assert.equal(state.pileCostSettings.items.some((item) => item.pile_size_mm === 999), false);
  });

  it("rejects used-size removal before changing any row", async () => {
    const used = state.bearingCapacities[0].pile_size_mm;
    await assert.rejects(prepareMcpWrite(snapshot, "pile_edit_cost_catalog_bulk", {
      actions: [{ action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } },
        { action: "remove", pile_size_mm: used }],
    }), /used_pile_size/);
    assert.equal(state.pileCostSettings.items.some((item) => item.pile_size_mm === 999), false);
  });

  it("updates global CPT rules and clears manual choices only when requested", async () => {
    const original = { ...state,
      cptSelectionSettingsByLoadPoint: new Map([[ids[1], { ...state.globalCptSelectionSettings, maxAngleDegrees: 90 }]]),
      manualCptIdsByLoadPoint: new Map([[ids[0], [state.cpts[0].id]]]),
    };
    const prepared = await prepareMcpWrite({ ...snapshot, state: original }, "pile_set_cpt_selection_settings", {
      settings: { max_distance_m: 30 }, overwrite_manual_selections: true,
    });
    const next = prepared.update(original);
    assert.equal(next.globalCptSelectionSettings.maxDistanceM, 30);
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(ids[1])?.maxAngleDegrees, 90);
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(ids[1])?.maxDistanceM, 30);
    assert.equal(next.manualCptIdsByLoadPoint.has(ids[0]), false);
    assert.equal(next.analysisRequest.loadPointIds, null);
  });

  it("resets both manual group record kinds together", async () => {
    const withOverrides = { ...state, loadPointGroupingSettings: {
      ...state.loadPointGroupingSettings,
      manualGroups: [{ loadPointIds: [ids[0], ids[1]] }],
      ungroupedGroups: [{ loadPointIds: [ids[0], ids[1]] }],
    } };
    const prepared = await prepareMcpWrite({ ...snapshot, state: withOverrides }, "pile_reset_group_overrides", {});
    assert.equal(prepared.changed, true);
    assert.deepEqual(prepared.update(withOverrides).loadPointGroupingSettings.manualGroups, []);
    assert.deepEqual(prepared.update(withOverrides).loadPointGroupingSettings.ungroupedGroups, []);
  });

  it("uses new cost row in the Rust plan estimate and restores it on Undo", async () => {
    const row = state.pileCostSettings.items[0];
    const assigned = { ...state, selectedPileConfigurationsByLoadPoint: new Map([[ids[0], {
      pile_size_mm: row.pile_size_mm, pile_tip_level_mm: -12000,
    }]]) };
    const assessment = (current: typeof assigned) => readPlanAssessment({
      ...snapshot, state: current, calculateCost: calculatePileCostCore,
    }, "pile_get_plan_costs", {});
    const before = (await assessment(assigned)).data.known_subtotal;
    const prepared = await prepareMcpWrite({ ...snapshot, state: assigned }, "pile_update_cost_item", {
      pile_size_mm: row.pile_size_mm, cost_per_m3: row.cost_per_m3 + 100,
    });
    const after = projectHistoryReducer(createManagedProjectState(assigned), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.ok((await assessment(after.present as typeof assigned)).data.known_subtotal > before);
    const undone = projectHistoryReducer(after, { type: "undo" });
    assert.equal((await assessment(undone.present as typeof assigned)).data.known_subtotal, before);
  });
});
