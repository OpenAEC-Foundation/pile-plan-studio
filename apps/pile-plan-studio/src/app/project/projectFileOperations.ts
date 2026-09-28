import type { FileOperationOutcome, FileOperationRequest } from "../mcp/fileOperationSession.ts";
import type { ProjectMarkerValue } from "../mcp/projectMarker.ts";
import { McpReadError } from "../mcp/readModel.ts";

export type ProjectFileOperationContext = {
  currentMarker: () => ProjectMarkerValue;
  currentPath: () => string | null;
  chooseOpen: () => Promise<string | null>;
  chooseSave: (suggestedPath: string) => Promise<string | null>;
  suggestedName: () => string;
  openProject: (path: string, isCurrent: () => boolean) => Promise<boolean>;
  serialize: () => Promise<string>;
  writeProject: (path: string, contents: string) => Promise<void>;
  didSave: (path: string) => void;
  exportPlan?: (planId: string, format: "csv" | "xlsx") => Promise<{ basename: string; bytes: Uint8Array }>;
  chooseExport?: (suggestedName: string, format: "csv" | "xlsx") => Promise<string | null>;
  writeExport?: (path: string, bytes: Uint8Array) => Promise<void>;
};

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

export async function runProjectFileOperation(
  request: FileOperationRequest,
  expectedMarker: ProjectMarkerValue,
  isValid: () => boolean,
  context: ProjectFileOperationContext,
): Promise<FileOperationOutcome> {
  const isCurrent = () => {
    const current = context.currentMarker();
    return isValid() && current.project_instance_id === expectedMarker.project_instance_id
      && current.project_revision === expectedMarker.project_revision;
  };
  const stale = (): FileOperationOutcome => ({ status: "failed", code: "project_changed",
    message: "The project changed during the file operation." });
  try {
    if (!isCurrent()) return stale();
    if (request.kind === "open") {
      const path = await context.chooseOpen();
      if (!path) return { status: "cancelled" };
      if (!isCurrent()) return stale();
      const opened = await context.openProject(path, isCurrent);
      if (!opened) return isCurrent() ? { status: "cancelled" } : stale();
      return { status: "completed", basename: basename(path), marker: context.currentMarker() };
    }
    if (request.kind === "export") {
      if (!context.exportPlan || !context.chooseExport || !context.writeExport) {
        return { status: "failed", code: "unsupported_operation", message: "Export operation is not connected." };
      }
      const output = await context.exportPlan(request.planId, request.format);
      if (!isCurrent()) return stale();
      const exportPath = await context.chooseExport(output.basename, request.format);
      if (!exportPath) return { status: "cancelled" };
      if (!isCurrent()) return stale();
      await context.writeExport(exportPath, output.bytes);
      return { status: "completed", basename: basename(exportPath), planId: request.planId,
        format: request.format, marker: context.currentMarker() };
    }
    const path = request.kind === "save" && context.currentPath()
      ? context.currentPath()!
      : await context.chooseSave(context.currentPath() ?? context.suggestedName());
    if (!path) return { status: "cancelled" };
    if (!isCurrent()) return stale();
    const contents = await context.serialize();
    if (!isCurrent()) return stale();
    await context.writeProject(path, contents);
    if (!isCurrent()) return stale();
    context.didSave(path);
    return { status: "completed", basename: basename(path), marker: context.currentMarker() };
  } catch (reason) {
    return { status: "failed", code: reason instanceof McpReadError ? reason.code : "file_operation_failed",
      message: reason instanceof Error ? reason.message : String(reason) };
  }
}
