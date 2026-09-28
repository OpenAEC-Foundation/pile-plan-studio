import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initSync } from "../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../domain/project/history/projectHistoryReducer.ts";
import { projectDraftFromState } from "../project/projectLifecycleController.ts";
import { prepareMcpWrite } from "./writeModel.ts";

initSync({ module: readFileSync(new URL("../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const snapshot = { state, marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null } };

describe("MCP complete project editing", () => {
  it("changes optimization settings in one undo step", async () => {
    const newValue = state.ilpOptimizationSettings.max_utilization === 0.9 ? 0.8 : 0.9;
    const prepared = await prepareMcpWrite(snapshot, "pile_set_optimization_settings", {
      settings: { max_utilization: newValue, transition_weights: { tip_only_milli: 1200 } },
    });
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(after.present.ilpOptimizationSettings.max_utilization, newValue);
    assert.equal(after.present.ilpOptimizationSettings.transition_weights.tip_only_milli, 1200);
    assert.equal(projectHistoryReducer(after, { type: "undo" }).present.ilpOptimizationSettings.max_utilization,
      state.ilpOptimizationSettings.max_utilization);
  });

  it("changes active configurations without changing assignments", async () => {
    const plan = state.pilePlans[0];
    const sizes = state.pileLegend.pileSizes.slice(0, 1).map((v) => v.value);
    const tips = state.pileLegend.pileTipLevels.slice(0, 1).map((v) => v.value);
    const prepared = await prepareMcpWrite(snapshot, "pile_set_active_configurations", {
      plan_id: plan.id, pile_sizes_mm: sizes, pile_tip_levels_mm: tips,
    });
    const next = prepared.update(state);
    assert.deepEqual(next.pilePlans[0].activePileSizes, sizes);
    assert.deepEqual(next.pilePlans[0].activePileTipLevelMms, tips);
    assert.equal(next.selectedPileConfigurationsByLoadPoint, state.selectedPileConfigurationsByLoadPoint);
  });

  it("changes full visual legend and project properties", async () => {
    const legend = projectDraftFromState(state).settings.pile_legend!;
    const changedLegend = structuredClone(legend);
    changedLegend.pile_sizes[0].color = "#123456";
    changedLegend.pile_sizes[0].color_automatic = false;
    const visual = await prepareMcpWrite(snapshot, "pile_set_legend_settings", {
      legend: changedLegend, show_tip_level_regions: !state.showTipLevelRegions,
    });
    assert.equal(visual.update(state).pileLegend.pileSizes[0].color, "#123456");
    assert.equal(visual.update(state).showTipLevelRegions, !state.showTipLevelRegions);
    const properties = await prepareMcpWrite(snapshot, "pile_set_project_properties", {
      name: "Corrected project", pile_head_level_m: -2.5, currency_code: "USD",
    });
    const next = properties.update(state);
    assert.equal(next.name, "Corrected project");
    assert.equal(next.pileHeadLevelM, -2.5);
    assert.equal(next.currencyCode, "USD");
  });

  it("applies eighty distinct load-point corrections in one undo step", async () => {
    const points = state.loadPoints.slice(0, 80);
    const prepared = await prepareMcpWrite(snapshot, "pile_edit_load_points_bulk", {
      actions: points.map((point, index) => ({ action: "update", item: {
        ...point, design_load_kn: point.design_load_kn + index + 1,
      } })),
    });
    const after = projectHistoryReducer(createManagedProjectState(state), { type: "commit", update: prepared.update });
    assert.equal(after.history.past.length, 1);
    assert.equal(after.present.loadPoints[79].design_load_kn, points[79].design_load_kn + 80);
    assert.equal(projectHistoryReducer(after, { type: "undo" }).present.loadPoints[79].design_load_kn,
      points[79].design_load_kn);
  });

  it("rejects an unknown source row without changing the project", async () => {
    await assert.rejects(prepareMcpWrite(snapshot, "pile_edit_cpts_bulk", {
      actions: [{ action: "remove", id: 4294967295 }],
    }), /unknown_id/);
    assert.equal(state.cpts.length, project.inputs.cpts.length);
  });

  it("adds a CPT and one advice row, then can remove each by key", async () => {
    const cptId = Math.max(...state.cpts.map((cpt) => cpt.id)) + 1;
    const newCpt = { id: cptId, name: "Supplementary CPT", x_mm: 2000000, y_mm: 2000000 };
    const cpt = await prepareMcpWrite(snapshot, "pile_edit_cpts_bulk", {
      actions: [{ action: "add", item: newCpt }],
    });
    const withCpt = cpt.update(state);
    assert.equal(withCpt.cpts.some((item) => item.id === cptId), true);
    const withCptSnapshot = { ...snapshot, state: withCpt };
    const template = state.bearingCapacities[0];
    const advice = { cpt_id: cptId, pile_size_mm: template.pile_size_mm,
      pile_tip_level_m: template.pile_tip_level_m, frd_kn: 900 };
    const added = await prepareMcpWrite(withCptSnapshot, "pile_edit_foundation_advice_bulk", {
      actions: [{ action: "add", item: advice }],
    });
    const withAdvice = added.update(withCpt);
    assert.equal(withAdvice.bearingCapacities.some((row) => row.cpt_id === cptId && row.frd_kn === 900), true);
    const removed = await prepareMcpWrite({ ...snapshot, state: withAdvice },
      "pile_edit_foundation_advice_bulk", { actions: [{ action: "remove", cpt_id: cptId,
        pile_size_mm: advice.pile_size_mm, pile_tip_level_mm: template.pile_tip_level_mm }] });
    assert.equal(removed.update(withAdvice).bearingCapacities.some((row) => row.cpt_id === cptId), false);
  });
});
