import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createMcpDispatcher } from "./protocol.ts";
import { prepareMcpWrite } from "./writeModel.ts";
import { McpReadError } from "./readModel.ts";
import { createSourceImportSession } from "./sourceImportSession.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const state = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const snapshot = {
  state,
  marker: { project_instance_id: "test", project_revision: 1 },
  groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null },
};

describe("MCP protocol", () => {
  const dispatch = createMcpDispatcher(() => snapshot);

  it("advertises file operations and gates writes without gating status", async () => {
    const requests: string[] = [];
    const fileDispatch = createMcpDispatcher(() => snapshot, undefined, () => false, undefined, undefined,
      async (_snapshot, name) => {
        requests.push(name);
        return { ...snapshot.marker, data: { status: "pending", operation_id: "op-1" } };
      });
    const callFile = async (name: string, args: Record<string, unknown>) => JSON.parse(await fileDispatch(JSON.stringify({
      jsonrpc: "2.0", id: 50, method: "tools/call", params: { name, arguments: args },
    })));
    const listed = JSON.parse(await fileDispatch(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })));
    assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === "pile_open_project"));
    assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === "pile_get_file_operation_status"));
    const blocked = await callFile("pile_save_project", {
      expected_project_instance_id: "test", expected_project_revision: 1,
    });
    assert.equal(blocked.result.isError, true);
    assert.equal(requests.length, 0);
    const status = await callFile("pile_get_file_operation_status", { operation_id: "op-1" });
    assert.equal(status.result.isError, false);
    assert.deepEqual(requests, ["pile_get_file_operation_status"]);
  });

  it("routes an explicit-plan CSV export only with editing access and a current marker", async () => {
    const calls: string[] = [];
    let canWrite = false;
    const exportDispatch = createMcpDispatcher(() => snapshot, undefined, () => canWrite, undefined, undefined,
      async (_snapshot, name, args) => {
        calls.push(`${name}:${args.plan_id}`);
        return { ...snapshot.marker, data: { status: "pending", operation_id: "export-1" } };
      });
    const callExport = async (revision: number) => JSON.parse(await exportDispatch(JSON.stringify({
      jsonrpc: "2.0", id: 51, method: "tools/call", params: { name: "pile_export_plan", arguments: {
        plan_id: "plan-a", format: "csv", expected_project_instance_id: "test", expected_project_revision: revision,
      } },
    })));
    assert.equal((await callExport(1)).result.isError, true);
    canWrite = true;
    assert.equal((await callExport(0)).result.isError, true);
    assert.equal((await callExport(1)).result.isError, false);
    assert.deepEqual(calls, ["pile_export_plan:plan-a"]);
  });

  it("advertises a read-only two-plan comparison with explicit IDs", async () => {
    const listed = JSON.parse(await dispatch('{"jsonrpc":"2.0","id":2,"method":"tools/list"}'));
    const compare = listed.result.tools.find((tool: { name: string }) => tool.name === "pile_compare_plans");
    assert.equal(compare.annotations.readOnlyHint, true);
    assert.deepEqual(compare.inputSchema.required, ["plan_a_id", "plan_b_id"]);
  });

  it("advertises staged pile-plan import and guards apply with edit access", async () => {
    let enabled = false;
    const calls: string[] = [];
    const importer = createMcpDispatcher(() => snapshot, undefined, () => enabled, undefined, undefined, undefined,
      async (_snapshot, name) => {
        calls.push(name);
        return { ...snapshot.marker, data: { transaction_id: "pile-1" } };
      });
    const listed = JSON.parse(await importer('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === "pile_get_pile_plan_import_requirements"));
    assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === "pile_apply_pile_plan_import"));
    const call = (name: string, args: Record<string, unknown>) => importer(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args },
    }));
    assert.equal(JSON.parse(await call("pile_apply_pile_plan_import", {
      transaction_id: "pile-1", validation_id: "valid-1" })).result.isError, true);
    enabled = true;
    assert.equal(JSON.parse(await call("pile_get_pile_plan_import_requirements", {})).result.isError, false);
    assert.deepEqual(calls, ["pile_get_pile_plan_import_requirements"]);
  });

  it("begins a refresh with no new-project metadata through the real import session", async () => {
    const importSession = createSourceImportSession({ requirements: async () => ({}),
      validate: async () => ({}), apply: async () => ({}) });
    const importer = createMcpDispatcher(() => snapshot, undefined, () => true, undefined,
      (current, name, args) => importSession.call(name, args, current.marker));
    const request = { jsonrpc: "2.0", id: 8, method: "tools/call", params: {
      name: "pile_begin_source_import", arguments: {
        mode: "refresh", expected_project_instance_id: "test", expected_project_revision: 1,
      },
    } };
    const result = JSON.parse(await importer(JSON.stringify(request)));
    assert.equal(result.result.isError, false);
    assert.equal(result.result.structuredContent.data.mode, "refresh");
    assert.ok(result.result.structuredContent.data.transaction_id);
    const nullableRequest = structuredClone(request);
    nullableRequest.id = 9;
    Object.assign(nullableRequest.params.arguments, {
      project_name: null, pile_head_level_m: null, currency_code: null,
    });
    const nullableResult = JSON.parse(await importer(JSON.stringify(nullableRequest)));
    assert.equal(nullableResult.result.isError, false);
    nullableRequest.id = 10;
    nullableRequest.params.arguments.mode = "new_project";
    const incompleteNewProject = JSON.parse(await importer(JSON.stringify(nullableRequest)));
    assert.equal(incompleteNewProject.result.isError, true);
  });

  it("advertises source import tools and guards staging with edit access", async () => {
    let edit = false;
    const calls: string[] = [];
    const importer = createMcpDispatcher(() => snapshot, undefined, () => edit, undefined,
      async (_snapshot, name) => { calls.push(name); return { ...snapshot.marker, data: { version: 1 } }; });
    const listed = JSON.parse(await importer('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    for (const name of ["pile_get_import_requirements", "pile_begin_source_import", "pile_append_import_source",
      "pile_validate_source_import", "pile_get_source_import_status", "pile_apply_source_import", "pile_discard_source_import"]) {
      assert.ok(listed.result.tools.find((tool: { name: string }) => tool.name === name));
    }
    const call = (name: string, args: Record<string, unknown>) => importer(JSON.stringify({ jsonrpc: "2.0", id: 2,
      method: "tools/call", params: { name, arguments: args } }));
    assert.equal(JSON.parse(await call("pile_get_import_requirements", {})).result.isError, false);
    const begin = { mode: "refresh", expected_project_instance_id: "test", expected_project_revision: 1 };
    assert.match(JSON.parse(await call("pile_begin_source_import", begin)).result.content[0].text, /write_access_disabled/);
    edit = true;
    assert.equal(JSON.parse(await call("pile_begin_source_import", begin)).result.isError, false);
    assert.deepEqual(calls, ["pile_get_import_requirements", "pile_begin_source_import"]);
  });

  it("negotiates and lists distinct read and write tools", async () => {
    const initialized = JSON.parse(await dispatch(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } })));
    assert.equal(initialized.result.protocolVersion, "2025-11-25");
    assert.match(initialized.result.instructions, /expected_project_revision/);
    const listed = JSON.parse(await dispatch('{"jsonrpc":"2.0","id":2,"method":"tools/list"}'));
    assert.ok(listed.result.tools.some((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint));
    assert.ok(listed.result.tools.some((tool: { annotations: { readOnlyHint: boolean } }) => !tool.annotations.readOnlyHint));
    assert.equal(new Set(listed.result.tools.map((tool: { name: string }) => tool.name)).size, listed.result.tools.length);
    assert.equal(listed.result.tools[0].annotations.readOnlyHint, true);
  });

  it("explains the optimization cost basis and repeated runs to AI clients", async () => {
    const initialized=JSON.parse(await dispatch('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'));
    assert.match(initialized.result.instructions,/cost-only reference/i);
    const listed=JSON.parse(await dispatch('{"jsonrpc":"2.0","id":2,"method":"tools/list"}'));
    const description=(name:string)=>listed.result.tools.find((tool:{name:string})=>tool.name===name).description as string;
    assert.match(description("pile_get_project_settings"),/budget_basis_points.*reference/i);
    assert.match(description("pile_start_optimization"),/current plan.*budget/i);
    assert.match(description("pile_start_optimization"),/new search.*not guaranteed/i);
    assert.match(description("pile_get_plan_optimization"),/reference\.cost.*budget/i);
  });

  it("starts optimization with a project marker and controls a run by ID", async () => {
    const calls:string[]=[];
    const controlled=createMcpDispatcher(() => snapshot, undefined, () => true, async (_snapshot,name) => {
      calls.push(name);
      return { ...snapshot.marker, data: { run_id: "run-1" } };
    });
    const invoke=async(name:string,args:Record<string,unknown>)=>JSON.parse(await controlled(JSON.stringify({jsonrpc:"2.0",id:7,method:"tools/call",params:{name,arguments:args}})));
    const started=await invoke("pile_start_optimization",{plan_id:state.activePilePlanId,expected_project_instance_id:"test",expected_project_revision:1});
    assert.equal(started.result.isError,false);
    const stopped=await invoke("pile_stop_optimization",{run_id:"run-1"});
    assert.equal(stopped.result.isError,false);
    assert.deepEqual(calls,["pile_start_optimization","pile_stop_optimization"]);
  });

  it("serves one bounded tool response and a typed pending error", async () => {
    const overview = JSON.parse(await dispatch(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "pile_project_overview", arguments: {} } })));
    assert.equal(overview.result.structuredContent.project_instance_id, "test");
    const pending = JSON.parse(await dispatch(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "pile_list_pile_options", arguments: { load_point_id: state.loadPoints[0].id } } })));
    assert.equal(pending.result.isError, true);
    assert.match(pending.result.content[0].text, /analysis_pending/);
  });

  it("rejects unknown methods and ignores notifications", async () => {
    const error = JSON.parse(await dispatch('{"jsonrpc":"2.0","id":5,"method":"unknown"}'));
    assert.equal(error.error.code, -32601);
    assert.equal(await dispatch('{"jsonrpc":"2.0","method":"notifications/initialized"}'), "");
  });

  it("advertises write tools and requires a current project marker before routing them", async () => {
    const calls: string[] = [];
    const writable = createMcpDispatcher(() => snapshot, async (_snapshot, name) => {
      calls.push(name);
      return { ...snapshot.marker, data: { changed: true } };
    });
    const listed = JSON.parse(await writable('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    const rename = listed.result.tools.find((tool: { name: string }) => tool.name === "pile_rename_plan");
    assert.equal(rename.annotations.readOnlyHint, false);
    assert.equal(rename.annotations.destructiveHint, true);
    assert.deepEqual(rename.inputSchema.required, ["plan_id", "name", "expected_project_instance_id", "expected_project_revision"]);
    const request = (revision: number) => JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "pile_rename_plan", arguments: { plan_id: state.activePilePlanId, name: "New", expected_project_instance_id: "test", expected_project_revision: revision },
    } });
    const stale = JSON.parse(await writable(request(0)));
    assert.equal(stale.result.isError, true);
    assert.match(stale.result.content[0].text, /project_changed/);
    assert.deepEqual(calls, []);
    const accepted = JSON.parse(await writable(request(1)));
    assert.equal(accepted.result.isError, false);
    assert.deepEqual(calls, ["pile_rename_plan"]);
  });

  it("advertises but rejects write tools until session edit access is enabled", async () => {
    let enabled = false;
    const writable = createMcpDispatcher(() => snapshot, async () => ({ ...snapshot.marker, data: {} }), () => enabled);
    const listed = JSON.parse(await writable('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    assert.ok(listed.result.tools.some((tool: { name: string }) => tool.name === "pile_save_project"));
    const call = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "pile_rename_plan", arguments: { plan_id: state.activePilePlanId, name: "New", expected_project_instance_id: "test", expected_project_revision: 1 },
    } });
    const refused = JSON.parse(await writable(call));
    assert.equal(refused.result.isError, true);
    assert.match(refused.result.content[0].text, /write_access_disabled/);
    enabled = true;
    const advertised = JSON.parse(await writable('{"jsonrpc":"2.0","id":3,"method":"tools/list"}'));
    assert.equal(advertised.result.tools.length, listed.result.tools.length);
  });

  it("advertises seven additional project edits with guarded inputs", async () => {
    const listed = JSON.parse(await dispatch('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    const expected = [
      "pile_activate_plan", "pile_delete_plan", "pile_set_load_point_lock",
      "pile_set_manual_cpts", "pile_use_automatic_cpts",
      "pile_group_load_points", "pile_ungroup_load_points",
    ];
    for (const name of expected) {
      const tool = listed.result.tools.find((item: { name: string }) => item.name === name);
      assert.ok(tool, name);
      assert.equal(tool.annotations.readOnlyHint, false);
      assert.ok(tool.inputSchema.required.includes("expected_project_instance_id"));
      assert.ok(tool.inputSchema.required.includes("expected_project_revision"));
    }
  });

  it("advertises project and source edits with revision checks and bounded actions", async () => {
    const routed: string[] = [];
    const writable = createMcpDispatcher(() => snapshot, async (_snapshot, name) => {
      routed.push(name);
      return { ...snapshot.marker, data: { changed: true } };
    });
    const listed = JSON.parse(await writable('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    const names = ["pile_set_optimization_settings", "pile_set_active_configurations",
      "pile_set_legend_settings", "pile_set_project_properties", "pile_edit_load_points_bulk",
      "pile_edit_cpts_bulk", "pile_edit_foundation_advice_bulk"];
    for (const name of names) {
      const tool = listed.result.tools.find((item: { name: string }) => item.name === name);
      assert.ok(tool, name);
      assert.equal(tool.annotations.readOnlyHint, false);
      assert.ok(tool.inputSchema.required.includes("expected_project_revision"));
    }
    const invoke = async (name: string, args: Record<string, unknown>) => JSON.parse(await writable(JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args },
    })));
    const marker = { expected_project_instance_id: "test", expected_project_revision: 1 };
    assert.equal((await invoke("pile_edit_load_points_bulk", { ...marker, actions: [] })).result.isError, true);
    assert.equal((await invoke("pile_set_optimization_settings", {
      ...marker, settings: { max_utilization: 0.9 },
    })).result.isError, false);
    assert.equal((await invoke("pile_edit_load_points_bulk", { ...marker, actions: [{ action: "remove", id: 1 }] })).result.isError, false);
    assert.deepEqual(routed, ["pile_set_optimization_settings", "pile_edit_load_points_bulk"]);
  });

  it("advertises and validates nested bulk inputs before routing", async () => {
    const calls: string[] = [];
    const writable = createMcpDispatcher(() => snapshot, async (_snapshot, name) => {
      calls.push(name);
      return { ...snapshot.marker, data: { changed: true } };
    });
    const listed = JSON.parse(await writable('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'));
    const names = ["pile_set_assignments_bulk", "pile_set_load_point_locks_bulk",
      "pile_set_cpt_selections_bulk", "pile_ungroup_load_points_bulk"];
    for (const name of names) {
      const tool = listed.result.tools.find((item: { name: string }) => item.name === name);
      assert.ok(tool, name);
      assert.equal(tool.annotations.readOnlyHint, false);
      assert.ok(tool.inputSchema.required.includes("expected_project_revision"));
    }
    const call = async (name: string, args: Record<string, unknown>) => JSON.parse(await writable(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {
        ...args, expected_project_instance_id: "test", expected_project_revision: 1,
      } },
    })));
    const valid = await call("pile_set_cpt_selections_bulk", { changes: [{ load_point_id: 1, cpt_ids: null }] });
    assert.equal(valid.result.isError, false);
    for (const changes of [
      [{ load_point_id: 1, cpt_ids: "auto" }],
      [{ load_point_id: 1, cpt_ids: [] }, { load_point_id: 1, cpt_ids: null }],
      [],
      Array.from({ length: 501 }, (_, i) => ({ load_point_id: i, cpt_ids: null })),
    ]) {
      const rejected = await call("pile_set_cpt_selections_bulk", { changes });
      assert.equal(rejected.result.isError, true);
      assert.match(rejected.result.content[0].text, /invalid_arguments/);
    }
    const halfConfiguration = await call("pile_set_assignments_bulk", { plan_id: state.activePilePlanId,
      changes: [{ load_point_id: 1, configuration: { pile_size_mm: 250 } }] });
    assert.match(halfConfiguration.result.content[0].text, /invalid_arguments/);
    assert.deepEqual(calls, ["pile_set_cpt_selections_bulk"]);
  });

  it("reports blocked bulk IDs to the client", async () => {
    const writable = createMcpDispatcher(() => snapshot, async () => {
      throw new McpReadError("locked_load_points", [12, 13]);
    });
    const result = JSON.parse(await writable(JSON.stringify({ jsonrpc: "2.0", id: 3,
      method: "tools/call", params: { name: "pile_set_load_point_locks_bulk", arguments: {
        plan_id: state.activePilePlanId, changes: [{ load_point_id: 12, locked: true }],
        expected_project_instance_id: "test", expected_project_revision: 1,
      } } })));
    assert.equal(result.result.isError, true);
    assert.deepEqual(JSON.parse(result.result.content[0].text), {
      code: "locked_load_points", ids: [12, 13],
    });
  });

  it("accepts valid lists but rejects duplicate, malformed and oversized lists before writing", async () => {
    const calls: string[] = [];
    const writable = createMcpDispatcher(() => snapshot, async (_snapshot, name) => {
      calls.push(name);
      return { ...snapshot.marker, data: { changed: true } };
    });
    const call = (name: string, arguments_: Record<string, unknown>) => writable(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {
        ...arguments_, expected_project_instance_id: "test", expected_project_revision: 1,
      } },
    }));
    const valid = JSON.parse(await call("pile_group_load_points", { load_point_ids: [1, 2] }));
    assert.equal(valid.result.isError, false);
    assert.deepEqual(calls, ["pile_group_load_points"]);
    for (const ids of [[1, 1], [1, "2"], Array.from({ length: 1001 }, (_, i) => i)]) {
      const invalid = JSON.parse(await call("pile_group_load_points", { load_point_ids: ids }));
      assert.match(invalid.result.content[0].text, /invalid_arguments/);
    }
    const invalidLock = JSON.parse(await call("pile_set_load_point_lock", {
      plan_id: state.activePilePlanId, load_point_id: state.loadPoints[0].id, locked: "true",
    }));
    assert.match(invalidLock.result.content[0].text, /invalid_arguments/);
    assert.deepEqual(calls, ["pile_group_load_points"]);
  });

  it("rejects an old marker for a new write before invoking the handler", async () => {
    let called = false;
    const writable = createMcpDispatcher(() => snapshot, async () => {
      called = true;
      return { ...snapshot.marker, data: {} };
    });
    const stale = JSON.parse(await writable(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: "pile_use_automatic_cpts", arguments: { load_point_id: state.loadPoints[0].id,
        expected_project_instance_id: "test", expected_project_revision: 0 },
    } })));
    assert.match(stale.result.content[0].text, /project_changed/);
    assert.equal(called, false);
  });

  it("rejects a reused revision after a successful write without a second mutation", async () => {
    let current = { ...snapshot };
    let mutations = 0;
    const writable = createMcpDispatcher(() => current, async (observed, name, args) => {
      const prepared = await prepareMcpWrite(observed, name, args);
      current = { ...current, state: prepared.update(current.state),
        marker: { ...current.marker, project_revision: current.marker.project_revision + 1 } };
      mutations += 1;
      return { ...current.marker, data: prepared.data };
    });
    const call = () => writable(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: "pile_set_load_point_lock", arguments: { plan_id: state.activePilePlanId,
        load_point_id: state.loadPoints[0].id, locked: true,
        expected_project_instance_id: "test", expected_project_revision: 1 },
    } }));
    const first = JSON.parse(await call());
    assert.equal(first.result.isError, false);
    assert.equal(first.result.structuredContent.project_revision, 2);
    const second = JSON.parse(await call());
    assert.equal(second.result.isError, true);
    assert.match(second.result.content[0].text, /project_changed/);
    assert.equal(mutations, 1);
    assert.deepEqual(current.state.pilePlans[0].lockedLoadPointIds, [state.loadPoints[0].id]);
  });
});
