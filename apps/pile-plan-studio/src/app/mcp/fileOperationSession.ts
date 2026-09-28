import { McpReadError, type ToolPayload } from "./readModel.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";

export type FileOperationRequest =
  | { kind: "open" | "save" | "save-as" }
  | { kind: "export"; planId: string; format: "csv" | "xlsx" };

export type FileOperationOutcome =
  | { status: "completed"; basename: string; marker?: ProjectMarkerValue; planId?: string; format?: "csv" | "xlsx" }
  | { status: "cancelled" }
  | { status: "failed"; code: string; message: string };

type Dependencies = {
  run: (request: FileOperationRequest, marker: ProjectMarkerValue, isValid: () => boolean) => Promise<FileOperationOutcome>;
  now?: () => number;
};

type Entry = { marker: ProjectMarkerValue; createdAt: number; data: Record<string, unknown> };
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 16;

export function createMcpFileOperationSession(dependencies: Dependencies) {
  const entries = new Map<string, Entry>();
  const now = dependencies.now ?? Date.now;
  let activeId: string | null = null;
  let valid = true;

  function prune() {
    for (const [id, entry] of entries) {
      if (now() - entry.createdAt >= TTL_MS && id !== activeId) entries.delete(id);
    }
    while (entries.size >= MAX_ENTRIES) {
      const oldest = [...entries.keys()].find((id) => id !== activeId);
      if (!oldest) break;
      entries.delete(oldest);
    }
  }

  function start(request: FileOperationRequest, marker: ProjectMarkerValue): ToolPayload {
    if (!valid) throw new McpReadError("file_operation_unavailable");
    if (activeId) throw new McpReadError("file_operation_busy");
    prune();
    const id = crypto.randomUUID();
    activeId = id;
    entries.set(id, { marker: { ...marker }, createdAt: now(), data: { operation_id: id, kind: request.kind, status: "pending" } });
    const isValid = () => valid && activeId === id;
    void Promise.resolve().then(() => dependencies.run(request, marker, isValid))
      .then((outcome) => {
        if (!isValid()) return;
        const entry = entries.get(id)!;
        if (outcome.status === "completed") {
          entry.marker = outcome.marker ?? entry.marker;
          entry.data = { operation_id: id, kind: request.kind, status: "completed",
            basename: outcome.basename, ...(outcome.planId ? { plan_id: outcome.planId } : {}),
            ...(outcome.format ? { format: outcome.format } : {}) };
        } else if (outcome.status === "cancelled") {
          entry.data = { operation_id: id, kind: request.kind, status: "cancelled" };
        } else {
          entry.data = { operation_id: id, kind: request.kind, status: "failed",
            error: { code: outcome.code, message: outcome.message } };
        }
      })
      .catch((reason: unknown) => {
        if (!isValid()) return;
        entries.get(id)!.data = { operation_id: id, kind: request.kind, status: "failed",
          error: { code: "file_operation_failed", message: reason instanceof Error ? reason.message : String(reason) } };
      })
      .finally(() => { if (activeId === id) activeId = null; });
    return { ...marker, data: { operation_id: id, kind: request.kind, status: "pending" } };
  }

  function status(id: string): ToolPayload {
    if (!valid) throw new McpReadError("file_operation_unavailable");
    prune();
    const entry = entries.get(id);
    if (!entry) throw new McpReadError("file_operation_not_found");
    return { ...entry.marker, data: entry.data };
  }

  function invalidate() {
    valid = false;
    activeId = null;
    entries.clear();
  }

  return { start, status, invalidate };
}
