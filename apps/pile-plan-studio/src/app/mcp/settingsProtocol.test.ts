import { readFileSync } from "node:fs";
import { it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createMcpDispatcher } from "./protocol.ts";

it("advertises settings edits and rejects malformed nested inputs", async () => {
  const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
  const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
  const snapshot = { state, marker: { project_instance_id: "test", project_revision: 1 },
    groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null } };
  const called: string[] = [];
  const dispatch = createMcpDispatcher(() => snapshot, async (_snapshot, name) => {
    called.push(name); return { ...snapshot.marker, data: { changed: true } };
  });
  const list = JSON.parse(await dispatch('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
  for (const name of ["pile_set_cpt_selection_settings", "pile_set_cpt_selection_settings_bulk",
    "pile_set_grouping_settings", "pile_reset_group_overrides", "pile_add_cost_item",
    "pile_update_cost_item", "pile_remove_cost_item", "pile_edit_cost_catalog_bulk"]) {
    assert.ok(list.result.tools.some((tool: { name: string }) => tool.name === name), name);
  }
  const call = (name: string, args: Record<string, unknown>) => dispatch(JSON.stringify({ jsonrpc: "2.0", id: 2,
    method: "tools/call", params: { name, arguments: { ...args,
      expected_project_instance_id: "test", expected_project_revision: 1 } } }));
  const invalid = JSON.parse(await call("pile_set_cpt_selection_settings_bulk", {
    changes: [{ load_point_id: 1, settings: { max_distance_m: -1 } }],
  }));
  assert.equal(invalid.result.isError, true);
  assert.deepEqual(called, []);
  const accepted = JSON.parse(await call("pile_edit_cost_catalog_bulk", { actions: [
    { action: "update", pile_size_mm: 290, cost_per_m3: 240 },
    { action: "add", item: { pile_size_mm: 999, shape: "round", cost_per_m3: 200 } },
  ] }));
  assert.equal(accepted.result.isError, false);
  assert.deepEqual(called, ["pile_edit_cost_catalog_bulk"]);
});
