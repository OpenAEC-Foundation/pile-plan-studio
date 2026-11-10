import assert from "node:assert/strict";
import { test } from "node:test";
import { createSiteMcpTools, siteToolDefinitions } from "./siteMcpTools.ts";

test("SuperCloud advertises shared project tools with its own prefix", async () => {
  const tools = createSiteMcpTools(async () => "");
  assert.ok((await tools.tools()).includes("pileplan_project_overview"));
  assert.ok((await tools.tools()).includes("pileplan_rename_plan"));
  assert.ok(!(await tools.tools()).includes("pileplan_save_project"));
  assert.ok(siteToolDefinitions().every(({ name }) => name.startsWith("pileplan_")));
});

test("SuperCloud forwards validated calls to the shared dispatcher and surfaces its refusal", async () => {
  const tools = createSiteMcpTools(async (body) => {
    const { params } = JSON.parse(body);
    if (params.name === "pile_rename_plan") {
      return JSON.stringify({ result: { isError: true, content: [{ text: '{"code":"project_changed"}' }] } });
    }
    return JSON.stringify({ result: { structuredContent: { tool: params.name, args: params.arguments } } });
  });
  assert.deepEqual(await tools.run("pileplan_list_plans", { limit: 3 }), {
    tool: "pile_list_plans", args: { limit: 3 },
  });
  await assert.rejects(tools.run("pileplan_rename_plan"), /project_changed/);
  await assert.rejects(tools.run("pileplan_save_project"), /^Error: niet_in_browser:/);
  await assert.rejects(tools.run("pile_list_plans"), /unknown_tool/);
});
