import type { ImportSourceInput } from "../../core/coreImportContract.ts";
import { McpReadError, type ToolPayload } from "./readModel.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";

export class SourceImportValidationError extends Error {
  readonly diagnostics: unknown[];
  constructor(message: string, diagnostics: unknown[]) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

export type SourceImportToolName = "pile_get_import_requirements" | "pile_begin_source_import"
  | "pile_append_import_source" | "pile_validate_source_import" | "pile_get_source_import_status"
  | "pile_apply_source_import" | "pile_discard_source_import";
type Mode = "refresh" | "new_project";
type Role = ImportSourceInput["role"];
type Validated = { data?: Record<string, unknown> } & Record<string, unknown>;
type Source = { name: string; chunks: string[]; bytes: number; final: boolean };
type Transaction = {
  id: string; marker: ProjectMarkerValue; mode: Mode; projectName?: string;
  pileHeadLevelM?: number; currencyCode?: string; sources: Map<Role, Source>;
  createdAt: number; validationId?: string; status: "staging" | "processing" | "ready" | "failed";
  validated?: Validated; validationDigest?: string; validationError?: string; validationDiagnostics?: unknown[];
  generation: number; applying: boolean;
};
type Dependencies = {
  requirements: () => Promise<unknown>;
  validate: (input: { mode: Mode; projectName?: string; pileHeadLevelM?: number;
    currencyCode?: string; sources: ImportSourceInput[]; marker: ProjectMarkerValue }) => Promise<Validated>;
  apply: (input: { mode: Mode; validated: Validated; marker: ProjectMarkerValue }) => Promise<Record<string, unknown>>;
  now?: () => number;
};
const roles: Role[] = ["load-points", "cpts", "bearing-capacities"];
const MAX_CHUNK = 128 * 1024;
const MAX_SOURCE = 8 * 1024 * 1024;
const MAX_TOTAL = 16 * 1024 * 1024;
const TTL_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();

export function createSourceImportSession(dependencies: Dependencies) {
  const transactions = new Map<string, Transaction>();
  const now = dependencies.now ?? Date.now;
  function prune() {
    for (const [id, transaction] of transactions) {
      if (now() - transaction.createdAt > TTL_MS) transactions.delete(id);
    }
  }
  function find(id: unknown, marker: ProjectMarkerValue): Transaction {
    if (typeof id !== "string") throw new McpReadError("import_not_found");
    const transaction = transactions.get(id);
    if (!transaction) throw new McpReadError("import_not_found");
    if (now() - transaction.createdAt > TTL_MS) {
      transactions.delete(id);
      throw new McpReadError("import_expired");
    }
    if (transaction.marker.project_instance_id !== marker.project_instance_id
      || transaction.marker.project_revision !== marker.project_revision) throw new McpReadError("project_changed");
    return transaction;
  }
  function status(transaction: Transaction): Record<string, unknown> {
    return {
      transaction_id: transaction.id, status: transaction.status,
      validation_id: transaction.validationId ?? null,
      staged_roles: [...transaction.sources].filter(([, source]) => source.final).map(([role]) => role),
      ...(transaction.validated?.data ?? {}),
      ...(transaction.validationError ? { error: { code: "import_validation_failed", message: transaction.validationError,
        diagnostics: transaction.validationDiagnostics ?? [] } } : {}),
    };
  }
  async function contentDigest(transaction: Transaction): Promise<string> {
    const content = [...transaction.sources].map(([role, source]) => [role, source.name, source.chunks]);
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(content)));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function call(name: SourceImportToolName, args: Record<string, unknown>, marker: ProjectMarkerValue): Promise<ToolPayload> {
    if (name === "pile_get_import_requirements") return { ...marker, data: await dependencies.requirements() as Record<string, unknown> };
    if (name === "pile_begin_source_import") {
      prune();
      if (args.expected_project_instance_id !== marker.project_instance_id
        || args.expected_project_revision !== marker.project_revision) throw new McpReadError("project_changed");
      const mode = args.mode as Mode;
      if (mode !== "refresh" && mode !== "new_project") throw new McpReadError("invalid_arguments");
      if (transactions.size >= 8) throw new McpReadError("too_many_imports");
      const id = crypto.randomUUID();
      transactions.set(id, { id, marker: { ...marker }, mode,
        projectName: typeof args.project_name === "string" ? args.project_name : undefined,
        pileHeadLevelM: typeof args.pile_head_level_m === "number" ? args.pile_head_level_m : undefined,
        currencyCode: typeof args.currency_code === "string" ? args.currency_code : undefined,
        sources: new Map(), createdAt: now(),
        status: "staging", generation: 0, applying: false });
      return { ...marker, data: { transaction_id: id, mode, expires_in_seconds: TTL_MS / 1000 } };
    }
    const transaction = find(args.transaction_id, marker);
    if (name === "pile_discard_source_import") {
      transactions.delete(transaction.id);
      return { ...marker, data: { transaction_id: transaction.id, discarded: true } };
    }
    if (name === "pile_get_source_import_status") return { ...marker, data: status(transaction) };
    if (name === "pile_append_import_source") {
      if (transaction.status === "processing" || transaction.applying) throw new McpReadError("import_busy");
      const role = args.role as Role;
      const fileName = args.file_name as string;
      const text = args.text as string;
      if (!roles.includes(role) || !/^[^\\/:*?"<>|\x00-\x1f]+\.csv$/i.test(fileName)
        || fileName === ".csv" || fileName.includes("..")) throw new McpReadError("invalid_import_source_name");
      const bytes = encoder.encode(text).length;
      if (bytes > MAX_CHUNK) throw new McpReadError("import_chunk_too_large");
      let source = transaction.sources.get(role);
      if (source?.final && args.chunk_index === 0) {
        transaction.sources.delete(role);
        source = undefined;
      }
      if (!source) {
        if (args.chunk_index !== 0) throw new McpReadError("invalid_chunk_order");
        source = { name: fileName, chunks: [], bytes: 0, final: false };
        transaction.sources.set(role, source);
      }
      if (source.final || source.name !== fileName || args.chunk_index !== source.chunks.length) throw new McpReadError("invalid_chunk_order");
      if (source.bytes + bytes > MAX_SOURCE) throw new McpReadError("import_source_too_large");
      const total = [...transaction.sources.values()].reduce((sum, item) => sum + item.bytes, 0);
      if (total + bytes > MAX_TOTAL) throw new McpReadError("import_transaction_too_large");
      source.chunks.push(text);
      source.bytes += bytes;
      source.final = args.final === true;
      transaction.generation++;
      transaction.validationId = undefined;
      transaction.validated = undefined;
      transaction.validationDigest = undefined;
      transaction.validationError = undefined;
      transaction.validationDiagnostics = undefined;
      transaction.status = "staging";
      return { ...marker, data: { transaction_id: transaction.id, role, received_bytes: source.bytes,
        next_chunk_index: source.chunks.length, complete: source.final } };
    }
    if (name === "pile_validate_source_import") {
      if (transaction.status === "processing" || transaction.applying) throw new McpReadError("import_busy");
      const missing = transaction.mode === "new_project"
        ? roles.filter((role) => !transaction.sources.get(role)?.final) : [];
      if (missing.length || ![...transaction.sources.values()].some((source) => source.final)
        || [...transaction.sources.values()].some((source) => !source.final)) throw new McpReadError("missing_import_roles");
      const sources: ImportSourceInput[] = [...transaction.sources].map(([role, source]) => ({
        role, profile: "standard-table", profileOptions: { coordinateSheet: null, reactionSheet: null },
        fileName: source.name, format: "csv", bytes: encoder.encode(source.chunks.join("")),
      }));
      const generation = transaction.generation;
      const validationId = crypto.randomUUID();
      transaction.validationId = validationId;
      transaction.status = "processing";
      transaction.validated = undefined;
      transaction.validationDigest = undefined;
      transaction.validationError = undefined;
      transaction.validationDiagnostics = undefined;
      void (async () => {
        const digest = await contentDigest(transaction);
        const result = await dependencies.validate({ mode: transaction.mode, projectName: transaction.projectName,
        pileHeadLevelM: transaction.pileHeadLevelM, currencyCode: transaction.currencyCode,
        sources, marker: transaction.marker });
        if (transactions.get(transaction.id) !== transaction || transaction.generation !== generation) return;
        transaction.validated = result;
        transaction.validationDigest = digest;
        transaction.status = "ready";
      })().catch((error) => {
        if (transactions.get(transaction.id) !== transaction || transaction.generation !== generation) return;
        transaction.validationError = error instanceof Error ? error.message : String(error);
        transaction.validationDiagnostics = error instanceof SourceImportValidationError ? error.diagnostics : undefined;
        transaction.status = "failed";
      });
      return { ...marker, data: status(transaction) };
    }
    if (name === "pile_apply_source_import") {
      if (transaction.applying || transaction.status !== "ready" || !transaction.validated
        || args.validation_id !== transaction.validationId) throw new McpReadError("import_not_validated");
      transaction.applying = true;
      try {
        if (transaction.validationDigest !== await contentDigest(transaction)) {
          throw new McpReadError("import_content_changed");
        }
        const result = await dependencies.apply({ mode: transaction.mode, validated: transaction.validated,
          marker: transaction.marker });
        transactions.delete(transaction.id);
        return { ...marker, data: { transaction_id: transaction.id, ...result } };
      } finally { transaction.applying = false; }
    }
    throw new McpReadError("unknown_tool");
  }
  return { call, dispose: () => transactions.clear() };
}
