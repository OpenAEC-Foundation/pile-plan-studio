/**
 * The OpenAEC SuperCloud workplace (contract: OpenAEC-Blueprint, docs/supercloud-koppeling.md).
 *
 * In the workplace the page around the app sets `window.openaecHost` before the app starts: Open, Save and Save as go
 * to Docs instead of the file system or a download. The assistant of the SuperCloud reads and drives the app through
 * `window.__OPDS_APP__`, with the same tools as the desktop MCP server (protocol.ts), dispatched the same way.
 * Without a host (desktop, the plain web version) nothing here is active.
 */
import { PILE_TOOL_SCHEMAS } from "../mcp/protocol.ts";

export type HostFileRef = { id: string; name: string; version: string | number };

export type SiteHost = {
  taal?: string;
  initialFileId?: string;
  open(id: string, version?: string | number): Promise<HostFileRef & { readOnly: boolean; bytes: ArrayBuffer | Uint8Array }>;
  save(bytes: Uint8Array, options: { id?: string; name?: string; expectedVersion?: string | number }): Promise<HostFileRef>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
};

type WorkplaceToolDefinition = { name: string; description: string; inputSchema: object; bevestigen?: boolean };

declare global {
  interface Window {
    openaecHost?: SiteHost;
    __OPDS_APP__?: {
      tools(): Promise<string[]>;
      definitions(): Promise<WorkplaceToolDefinition[]>;
      run(name: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  }
}

export const PROJECT_EXTENSION = ".ifcpp";

export function getSiteHost(): SiteHost | null {
  if (typeof window === "undefined") return null;
  const host = window.openaecHost;
  return host && typeof host.open === "function" && typeof host.save === "function" && typeof host.list === "function"
    ? host : null;
}

/**
 * Tools the workplace offers. Not: opening, saving and exporting files (the user does that in the workplace, through
 * Docs) and the imports, which read their requirements from the desktop runtime.
 */
export function workplaceTools(tools = PILE_TOOL_SCHEMAS) {
  return tools.filter((tool) => !/^pile_(open_project|save_project|save_project_as|export_plan|get_file_operation_status)$/.test(tool.name)
    && !tool.name.includes("import"));
}

/** A tool that changes the project carries `bevestigen`: the SuperCloud asks the user before it runs. */
export function workplaceDefinition(tool: (typeof PILE_TOOL_SCHEMAS)[number]): WorkplaceToolDefinition {
  const definition: WorkplaceToolDefinition = { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
  if (!tool.annotations.readOnlyHint) definition.bevestigen = true;
  return definition;
}

/** `window.__OPDS_APP__` over a JSON-RPC dispatcher (the MCP session of the open project). */
export function installWorkplaceApp(dispatch: (body: string) => Promise<string>): () => void {
  const tools = workplaceTools();
  const names = new Set<string>(tools.map((tool) => tool.name));
  let nextId = 0;
  window.__OPDS_APP__ = {
    tools: async () => [...names],
    definitions: async () => tools.map(workplaceDefinition),
    run: async (name, args = {}) => {
      if (!names.has(name)) throw new Error(`niet_in_browser: ${name}`);
      const reply = JSON.parse(await dispatch(JSON.stringify({
        jsonrpc: "2.0", id: ++nextId, method: "tools/call", params: { name, arguments: args },
      }))) as { result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] }; error?: { message?: string } };
      if (reply.error) throw new Error(reply.error.message ?? "unavailable");
      if (reply.result?.isError) throw new Error(reply.result.content?.[0]?.text ?? "unavailable");
      return reply.result?.structuredContent ?? null;
    },
  };
  return () => { delete window.__OPDS_APP__; };
}

/** Choose a project from the files of this app in the same Docs folder (null: cancelled or none). */
export async function chooseFromDocs(host: SiteHost, promptText: string, noneText: string): Promise<HostFileRef | null> {
  const files = (await host.list()).filter((file) => file.name.toLowerCase().endsWith(PROJECT_EXTENSION));
  if (!files.length) {
    window.alert(noneText);
    return null;
  }
  const answer = window.prompt(`${promptText}\n\n${files.map((file, index) => `${index + 1}. ${file.name}`).join("\n")}`, "1");
  const number = answer ? Number.parseInt(answer, 10) : Number.NaN;
  if (!Number.isInteger(number) || number < 1 || number > files.length) return null;
  const file = files[number - 1];
  return { id: file.id, name: file.name, version: "" };
}
