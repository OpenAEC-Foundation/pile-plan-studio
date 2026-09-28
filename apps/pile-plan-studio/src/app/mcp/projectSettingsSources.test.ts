import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { readProjectSourceTool } from "./projectSettingsSources.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const marker = { project_instance_id: "test", project_revision: 1 };
const readyGroups = { groups: [{ load_point_ids: [state.loadPoints[0].id], origin: "manual" as const }], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null };

describe("MCP project source reads", () => {
  it("exposes CPT selection and optimizer controls with distinct scopes", async () => {
    const result = await readProjectSourceTool({ state, marker, groups: readyGroups,
      defaultOptimizationTimeLimitSeconds: null }, "pile_get_project_settings", {});
    assert.equal(result.data.global_cpt_selection.algorithm, state.globalCptSelectionSettings.algorithm);
    assert.equal(result.data.optimization.settings.candidate_source, state.ilpOptimizationSettings.candidate_source);
    assert.equal(result.data.optimization.run_controls.transient, true);
    assert.equal(result.data.optimization.run_controls.default_time_limit_seconds, null);
    assert.equal(JSON.stringify(result.data).includes("viewport"), false);
  });

  it("pages source advice without losing a zero capacity", async () => {
    const row = { cpt_id: state.cpts[0].id, pile_size_mm: 300, pile_tip_level_mm: -12000, pile_tip_level_m: -12, frd_kn: 0 };
    const result = await readProjectSourceTool({ state: { ...state, bearingCapacities: [row] }, marker, groups: readyGroups },
      "pile_get_cpt_advice", { cpt_id: row.cpt_id, limit: 1 });
    assert.equal(result.data.items[0].frd_kn, 0);
  });

  it("does not serve retained groups while a new calculation is pending", async () => {
    await assert.rejects(readProjectSourceTool({ state, marker, groups: { ...readyGroups, pending: true } },
      "pile_list_groups", {}), /groups_pending/);
  });

  it("does not serve a technical assessment built from an editing preview", async () => {
    const draft = { loadPointIds: [state.loadPoints[0].id], cptIdsByLoadPoint: new Map() };
    const editing = { ...state, cptSelectionEditDraft: draft };
    const technicalAssignment = { status: "ready" as const, assessment: { availability: "available" as const, issues: [] }, issuesByLoadPointId: new Map(), error: null };
    await assert.rejects(readProjectSourceTool({ state: editing, marker, groups: readyGroups, technicalAssignment },
      "pile_get_technical_assessment", {}), /technical_pending/);
  });
});
