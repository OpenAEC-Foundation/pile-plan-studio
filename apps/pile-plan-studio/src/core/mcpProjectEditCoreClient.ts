import initWasm, { evaluate_mcp_project_edit } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";
import { projectDocumentOutcomeFromCore, toBrowserProjectDocumentDraft,
  toDesktopProjectDocumentDraft, type CoreValidatedProjectDocument,
  type ProjectDocumentDraft } from "./projectDocumentContract.ts";

export type ProjectDocumentEdit = Record<string, unknown> & { kind: string };
export type McpProjectEdit = ProjectDocumentEdit;
export type McpProjectEditResult =
  | { status: "applied"; changed: boolean;
      document: Extract<ReturnType<typeof projectDocumentOutcomeFromCore>, { status: "valid" }> }
  | { status: "blocked"; reason: string; action_index: number | null };

type CoreResult = { status: "applied"; changed: boolean; document: CoreValidatedProjectDocument }
  | { status: "blocked"; reason: string; action_index: number | null };

export async function evaluateProjectDocumentEditCore(
  draft: ProjectDocumentDraft, edit: ProjectDocumentEdit,
): Promise<McpProjectEditResult> {
  let result: CoreResult;
  if (isTauriRuntime()) {
    result = await invokeDesktop<CoreResult>("evaluate_mcp_project_edit", {
      request: { draft: toDesktopProjectDocumentDraft(draft), edit },
    });
  } else {
    await initializeWasm(() => initWasm());
    result = evaluate_mcp_project_edit({ draft: toBrowserProjectDocumentDraft(draft), edit }) as CoreResult;
  }
  if (result.status === "blocked") return result;
  const document = projectDocumentOutcomeFromCore({ status: "valid", ...result.document });
  if (document.status !== "valid") throw new Error("Rust returned an invalid MCP project edit document");
  return { status: "applied", changed: result.changed, document };
}
