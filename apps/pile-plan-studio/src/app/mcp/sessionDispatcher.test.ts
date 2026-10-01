import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { createSessionMcpDispatcher } from "./sessionDispatcher.ts";

const project = canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp", "utf8"));
const initial = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const marker = { project_instance_id: "test", project_revision: 1 };
function setup(failAfterPrepare = false, ignoreInstall = false, staleSnapshot = false) {
  let state = initial, enabled = true, installs = 0;
  const fileRequests: string[] = [];
  const dispatch = createSessionMcpDispatcher({
    snapshot: () => ({ state, marker, isCurrent: () => !staleSnapshot }), currentState: () => state, currentMarker: () => marker,
    canWrite: () => enabled, isActive: () => true, language: () => "nl",
    defaultTimeLimit: () => 10, optimization: () => { throw new Error("unexpected optimizer request"); },
    install: (update) => { installs++; if (!ignoreInstall) state = update(state); },
    sourceImport: { call: async () => ({ ...marker, data: {} }) },
    pilePlanImport: { call: async () => ({ ...marker, data: {} }) },
    files: { start: (request) => { fileRequests.push(request.kind); return { ...marker, data: {} }; },
      status: () => ({ ...marker, data: {} }) },
  }, async () => {
    if (failAfterPrepare) enabled = false;
    return { mode: "history", changed: true, data: { renamed: true }, update: (current) => ({ ...current, name: "Changed" }) };
  });
  return { call: async () => JSON.parse(await dispatch(JSON.stringify({ jsonrpc: "2.0", id: 1,
    method: "tools/call", params: { name: "pile_rename_plan", arguments: { plan_id: initial.activePilePlanId,
      name: "Changed", expected_project_instance_id: "test", expected_project_revision: 1 } } }))),
    installs: () => installs, state: () => state, fileRequests,
    tool: async (name: string) => JSON.parse(await dispatch(JSON.stringify({ jsonrpc: "2.0", id: 2,
      method: "tools/call", params: { name, arguments: {
        expected_project_instance_id: "test", expected_project_revision: 1 } } }))) };
}
test("accepted session writes install one validated change", async () => {
  const context = setup();
  assert.equal((await context.call()).result.isError, false);
  assert.equal(context.installs(), 1);
  assert.equal(context.state().name, "Changed");
});
test("permission revoked during preparation prevents installation", async () => {
  const context = setup(true);
  assert.equal((await context.call()).result.isError, true);
  assert.equal(context.installs(), 0);
});
test("failed installation is reported instead of claiming success", async () => {
  const context = setup(false, true);
  assert.equal((await context.call()).result.isError, true);
  assert.equal(context.state(), initial);
});

test("stale snapshots cannot install validated edits", async () => {
  const context = setup(false, false, true);
  assert.equal((await context.call()).result.isError, true);
  assert.equal(context.installs(), 0);
});
test("save-as requests are routed to the file session without changing history", async () => {
  const context = setup();
  assert.equal((await context.tool("pile_save_project_as")).result.isError, false);
  assert.deepEqual(context.fileRequests, ["save-as"]);
  assert.equal(context.installs(), 0);
});
