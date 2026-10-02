import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProjectMcpSession, type ProjectMcpSessionDependencies } from "./projectSession.ts";
import { createProjectMarker } from "./projectMarker.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";

function fixture() {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  let state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const marker = createProjectMarker();
  let active = true, writable = false, installs = 0;
  const dependencies: ProjectMcpSessionDependencies = {
    currentState: () => state, currentMarker: () => marker.observe(state), currentPath: () => null,
    canWrite: () => writable, language: () => "en", defaultTimeLimit: () => 30,
    derivedState: () => ({ analysisReady: false,
      groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null } }),
    optimization: () => ({ running: false, getCurrentRunId: () => null,
      startWithOptions: () => { throw new Error("unexpected optimization"); }, stopRun: () => false, cancelRun: () => false }),
    sourceImportRequirements: async () => ({ kind: "source" }), pilePlanImportRequirements: async () => ({ kind: "pile-plan" }),
    isDirty: () => false, personalCostDefault: () => null, builtInCostDefault: state.pileCostSettings,
    installRefresh: () => { installs++; }, installNewProject: () => { installs++; },
    installOpened: () => { installs++; }, didSave: () => { installs++; }, confirmReplacement: async () => false,
    navigate: () => { installs++; }, commit: () => { installs++; },
  };
  const session = createProjectMcpSession(dependencies, () => active);
  return { session, marker: () => marker.observe(state), setWritable: () => { writable = true; },
    deactivate: () => { active = false; }, installations: () => installs,
    rename: () => { state = { ...state, name: "Replacement" }; },
    call: async (name: string, args: Record<string, unknown> = {}) => JSON.parse(await session.dispatch(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args },
    }))).result };
}

test("composed MCP reads use live state and never invoke installation callbacks", async () => {
  const f = fixture();
  const initial = await f.call("pile_project_overview"); assert.equal(initial.isError, false);
  f.rename(); const next = await f.call("pile_project_overview");
  assert.equal(next.structuredContent.data.name, "Replacement");
  assert.equal(next.structuredContent.project_revision, initial.structuredContent.project_revision + 1);
  assert.equal(f.installations(), 0);
});

test("requirements remain readable without editing permission and inactive sessions reject transaction requests", async () => {
  const f = fixture();
  assert.deepEqual((await f.call("pile_get_import_requirements")).structuredContent.data, { kind: "source" });
  assert.deepEqual((await f.call("pile_get_pile_plan_import_requirements")).structuredContent.data, { kind: "pile-plan" });
  const marker = f.marker();
  const args = { mode: "refresh", expected_project_instance_id: marker.project_instance_id, expected_project_revision: marker.project_revision };
  const disabled = await f.call("pile_begin_source_import", args); assert.equal(disabled.isError, true);
  assert.match(disabled.content[0].text, /write_access_disabled/);
  f.setWritable(); f.deactivate();
  const inactive = await f.call("pile_get_import_requirements"); assert.equal(inactive.isError, true);
  assert.match(inactive.content[0].text, /unavailable/); assert.equal(f.installations(), 0);
});

test("one composed connection discards source and pile-plan transactions together", async () => {
  const f = fixture(); f.setWritable(); const marker = f.marker();
  const expected = { expected_project_instance_id: marker.project_instance_id, expected_project_revision: marker.project_revision };
  const source = await f.call("pile_begin_source_import", { ...expected, mode: "refresh" });
  const pile = await f.call("pile_begin_pile_plan_import", { ...expected, file_name: "plan.csv",
    coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false });
  assert.equal(source.isError, false); assert.equal(pile.isError, false);
  const sourceArgs = { transaction_id: source.structuredContent.data.transaction_id };
  const pileArgs = { transaction_id: pile.structuredContent.data.transaction_id };
  assert.equal((await f.call("pile_get_source_import_status", sourceArgs)).isError, false);
  assert.equal((await f.call("pile_get_pile_plan_import_status", pileArgs)).isError, false);
  f.session.dispose();
  assert.equal((await f.call("pile_get_source_import_status", sourceArgs)).isError, true);
  assert.equal((await f.call("pile_get_pile_plan_import_status", pileArgs)).isError, true);
  assert.equal(f.installations(), 0);
});

test("source and pile-plan transactions reject markers from an earlier project revision", async () => {
  const f = fixture(); f.setWritable(); const marker = f.marker(); f.rename();
  const expected = { expected_project_instance_id: marker.project_instance_id, expected_project_revision: marker.project_revision };
  const source = await f.call("pile_begin_source_import", { ...expected, mode: "refresh" });
  const pile = await f.call("pile_begin_pile_plan_import", { ...expected, file_name: "plan.csv",
    coordinate_tolerance_mm: 1, import_pile_assignments: true, import_cpt_selections: false });
  for (const result of [source, pile]) {
    assert.equal(result.isError, true); assert.match(result.content[0].text, /project_changed/);
  }
  assert.equal(f.installations(), 0);
});
