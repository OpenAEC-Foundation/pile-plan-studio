import { PILE_TOOL_SCHEMAS } from "../mcp/protocol.ts";

const DESKTOP_TOOLS = new Set([
  "pile_open_project", "pile_save_project", "pile_save_project_as",
  "pile_export_plan", "pile_get_file_operation_status",
]);

const siteName = (name: string) => "pileplan_" + name.slice("pile_".length);
const siteTools = new Map(PILE_TOOL_SCHEMAS.map(tool => [siteName(tool.name), tool]));

export function siteToolDefinitions() {
  return [...siteTools]
    .filter(([, tool]) => !DESKTOP_TOOLS.has(tool.name))
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.annotations.readOnlyHint ? {} : { bevestigen: true as const }),
    }));
}

export function createSiteMcpTools(dispatch: (body: string) => Promise<string>) {
  return {
    async tools() {
      return siteToolDefinitions().map(({ name }) => name);
    },
    async definitions() {
      return siteToolDefinitions();
    },
    async run(name: string, args: Record<string, unknown> = {}) {
      const tool = siteTools.get(name);
      if (!tool) throw new Error("unknown_tool");
      if (DESKTOP_TOOLS.has(tool.name)) throw new Error("niet_in_browser: " + name);
      const body = await dispatch(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: tool.name, arguments: args },
      }));
      const { result, error } = JSON.parse(body);
      if (error) throw new Error(error.message);
      if (result.isError) {
        const failure = JSON.parse(result.content[0].text);
        throw new Error(failure.message ? failure.code + ": " + failure.message : failure.code);
      }
      const value: unknown = result.structuredContent;
      if (tool.annotations.readOnlyHint && JSON.stringify(value).length > 30000) {
        throw new Error("te_groot: " + name + " exceeded 30000 characters; use a smaller page or narrower filters");
      }
      return value;
    },
  };
}
