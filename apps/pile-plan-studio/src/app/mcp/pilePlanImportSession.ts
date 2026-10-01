import type { PilePlanImportPreview } from "../../core/pilePlanImportContract.ts";
import { McpReadError, page, type ToolPayload } from "./readModel.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import { withImportApplyLock } from "./importApplyLock.ts";

export type PilePlanImportToolName = "pile_get_pile_plan_import_requirements" | "pile_begin_pile_plan_import"
  | "pile_append_pile_plan_import" | "pile_validate_pile_plan_import" | "pile_get_pile_plan_import_status"
  | "pile_apply_pile_plan_import" | "pile_discard_pile_plan_import";

type Options = { importPileAssignments: boolean; importCptSelections: boolean; coordinateToleranceMm: number };
type Transaction = { id: string; marker: ProjectMarkerValue; fileName: string; planName: string;
  options: Options; chunks: string[]; bytes: number; final: boolean; createdAt: number;
  status: "staging" | "processing" | "ready" | "failed"; generation: number;
  preview?: PilePlanImportPreview; validationId?: string; digest?: string; error?: string; applying: boolean };
type Dependencies = {
  requirements: () => Promise<Record<string, unknown>>;
  validate: (input: { bytes: Uint8Array; fileName: string; planName: string;
    options: Options; marker: ProjectMarkerValue }) => Promise<PilePlanImportPreview>;
  apply: (input: { preview: PilePlanImportPreview; fileName: string; planName: string;
    options: Options; marker: ProjectMarkerValue }) => Promise<Record<string, unknown>>;
  now?: () => number;
};

const encoder = new TextEncoder();
const MAX_CHUNK = 128 * 1024;
const MAX_SOURCE = 8 * 1024 * 1024;
const TTL_MS = 30 * 60 * 1000;

async function digest(chunks: string[]): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(chunks.join("")));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPilePlanImportSession(dependencies: Dependencies) {
  const transactions = new Map<string, Transaction>();
  const now = dependencies.now ?? Date.now;
  let disposed = false;
  function find(id: unknown, marker: ProjectMarkerValue): Transaction {
    if (disposed) throw new McpReadError("import_not_found");
    if (typeof id !== "string") throw new McpReadError("import_not_found");
    const transaction = transactions.get(id);
    if (!transaction) throw new McpReadError("import_not_found");
    if (now() - transaction.createdAt >= TTL_MS) {
      transactions.delete(id);
      throw new McpReadError("import_expired");
    }
    if (transaction.marker.project_instance_id !== marker.project_instance_id
      || transaction.marker.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
    return transaction;
  }
  function status(transaction: Transaction, args: Record<string, unknown>) {
    const summary = transaction.preview?.summary;
    const diagnostics = transaction.preview?.diagnostics.map((item) => ({
      severity: item.severity, code: item.code, message: item.message,
      location: item.location ? { sheet_name: item.location.sheetName,
        row: item.location.row, column: item.location.column } : null,
    })) ?? [];
    return { transaction_id: transaction.id, status: transaction.status,
      validation_id: transaction.validationId ?? null,
      can_apply: transaction.preview?.canApply ?? false,
      summary: summary ? { source_rows: summary.sourceRows, matched_rows: summary.matchedRows,
        coordinate_fallbacks: summary.coordinateFallbacks, skipped_rows: summary.skippedRows,
        conflicts: summary.conflicts } : null,
      diagnostics: page(diagnostics, args),
      ...(transaction.error ? { error: transaction.error } : {}) };
  }

  async function call(name: PilePlanImportToolName, args: Record<string, unknown>, marker: ProjectMarkerValue): Promise<ToolPayload> {
    if (disposed) throw new McpReadError("unavailable");
    if (name === "pile_get_pile_plan_import_requirements") return { ...marker, data: await dependencies.requirements() };
    if (name === "pile_begin_pile_plan_import") {
      if (args.expected_project_instance_id !== marker.project_instance_id
        || args.expected_project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      for (const [id, entry] of transactions) if (now() - entry.createdAt >= TTL_MS) transactions.delete(id);
      if (transactions.size >= 8) throw new McpReadError("too_many_imports");
      const fileName = args.file_name;
      if (typeof fileName !== "string" || !/^[^\\/:*?"<>|\x00-\x1f]+\.csv$/i.test(fileName)
        || fileName.includes("..")) throw new McpReadError("invalid_import_source_name");
      const tolerance = args.coordinate_tolerance_mm;
      if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0
        || typeof args.import_pile_assignments !== "boolean" || typeof args.import_cpt_selections !== "boolean"
        || (!args.import_pile_assignments && !args.import_cpt_selections)) throw new McpReadError("invalid_arguments");
      const id = crypto.randomUUID();
      transactions.set(id, { id, marker: { ...marker }, fileName,
        planName: typeof args.plan_name === "string" && args.plan_name.trim() ? args.plan_name.trim() : fileName.replace(/\.csv$/i, ""),
        options: { importPileAssignments: args.import_pile_assignments, importCptSelections: args.import_cpt_selections,
          coordinateToleranceMm: tolerance }, chunks: [], bytes: 0, final: false, createdAt: now(),
        status: "staging", generation: 0, applying: false });
      return { ...marker, data: { transaction_id: id, status: "staging", expires_in_seconds: TTL_MS / 1000 } };
    }
    const transaction = find(args.transaction_id, marker);
    if (name === "pile_discard_pile_plan_import") {
      transactions.delete(transaction.id);
      return { ...marker, data: { transaction_id: transaction.id, discarded: true } };
    }
    if (name === "pile_get_pile_plan_import_status") return { ...marker, data: status(transaction, args) };
    if (name === "pile_append_pile_plan_import") {
      if (transaction.status === "processing" || transaction.applying) throw new McpReadError("import_busy");
      if (transaction.final && args.chunk_index !== 0) throw new McpReadError("invalid_chunk_order");
      if (transaction.final && args.chunk_index === 0) {
        transaction.chunks = [];
        transaction.bytes = 0;
        transaction.final = false;
      }
      if (args.chunk_index !== transaction.chunks.length || typeof args.text !== "string"
        || typeof args.final !== "boolean") throw new McpReadError("invalid_chunk_order");
      const size = encoder.encode(args.text).length;
      if (size > MAX_CHUNK) throw new McpReadError("import_chunk_too_large");
      if (transaction.bytes + size > MAX_SOURCE) throw new McpReadError("import_source_too_large");
      transaction.chunks.push(args.text);
      transaction.bytes += size;
      transaction.final = args.final;
      transaction.generation++;
      transaction.status = "staging";
      transaction.error = undefined;
      transaction.preview = undefined;
      transaction.validationId = undefined;
      return { ...marker, data: { transaction_id: transaction.id, chunk_count: transaction.chunks.length,
        bytes: transaction.bytes, final: transaction.final } };
    }
    if (name === "pile_validate_pile_plan_import") {
      if (!transaction.final || !transaction.chunks.length) throw new McpReadError("missing_import_source");
      if (transaction.status === "processing" || transaction.applying) throw new McpReadError("import_busy");
      transaction.status = "processing";
      transaction.error = undefined;
      const generation = transaction.generation;
      void Promise.resolve().then(async () => {
        const contentDigest = await digest(transaction.chunks);
        const preview = await dependencies.validate({ bytes: encoder.encode(transaction.chunks.join("")),
          fileName: transaction.fileName, planName: transaction.planName, options: transaction.options, marker });
        if (disposed || !transactions.has(transaction.id) || transaction.generation !== generation) return;
        transaction.preview = preview;
        transaction.digest = contentDigest;
        transaction.validationId = crypto.randomUUID();
        transaction.status = preview.canApply ? "ready" : "failed";
      }).catch((reason: unknown) => {
        if (disposed || !transactions.has(transaction.id) || transaction.generation !== generation) return;
        transaction.status = "failed";
        transaction.error = reason instanceof Error ? reason.message : String(reason);
      });
      return { ...marker, data: { transaction_id: transaction.id, status: "processing" } };
    }
    if (name === "pile_apply_pile_plan_import") {
      if (transaction.status !== "ready" || !transaction.preview || args.validation_id !== transaction.validationId) {
        throw new McpReadError("import_not_validated");
      }
      if (transaction.applying) throw new McpReadError("import_busy");
      if (transaction.preview.summary.skippedRows > 0 || transaction.preview.summary.conflicts > 0) {
        if (args.allow_partial_import !== true) throw new McpReadError("partial_import_requires_acceptance");
      }
      const preview = transaction.preview;
      return withImportApplyLock(transaction, async () => {
        if (await digest(transaction.chunks) !== transaction.digest) throw new McpReadError("import_content_changed");
        find(transaction.id, marker);
        const result = await dependencies.apply({ preview, fileName: transaction.fileName,
          planName: transaction.planName, options: transaction.options, marker });
        transactions.delete(transaction.id);
        return { ...marker, data: { ...result, transaction_id: transaction.id, applied: true } };
      });
    }
    throw new McpReadError("unknown_tool");
  }
  function dispose() { disposed = true; transactions.clear(); }
  return { call, dispose };
}
