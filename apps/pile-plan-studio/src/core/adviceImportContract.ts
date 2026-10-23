import { fromCoreImportDiagnostic, type CoreImportDiagnostic, type ImportDiagnostic, type ImportProfile } from "./coreImportContract.ts";

export type AdviceSheetSelection = { sheetName: string; profile: ImportProfile };
export type AdviceValueLocation = { sourceId: string; fileName: string; sheetName: string | null; row: number | null; column: number | null };
export type AdviceConflict = { cptId: number; pileSizeMm: number; pileTipLevelMm: number;
  values: Array<{ frdKn: number; locations: AdviceValueLocation[] }> };
export type AdviceSheetPreview = { sheetName: string; status: "ready" | "invalid" | "unsupported" | "needs-profile";
  detectedProfile: ImportProfile | null; resolvedProfile: ImportProfile | null;
  summary: { itemCount: number; cptCount: number; pileSizesMm: number[]; minTipLevelMm: number | null;
    maxTipLevelMm: number | null; missingCellCount: number }; diagnostics: ImportDiagnostic[] };
export type AdviceSourcePreview = { sourceId: string; sheets: AdviceSheetPreview[];
  suggestedSelection: AdviceSheetSelection[]; diagnostics: ImportDiagnostic[] };
export type AdviceImportOperation = { kind: "append" } | { kind: "replace"; adviceId: string };
export type StoredAdviceSource = { id: string; fileNames: string[]; sheetNames: string[]; itemCount: number; combinedLegacy: boolean };
export type ProjectImportPreview = { existingSources?: StoredAdviceSource[]; canApply: boolean; countsAvailable?: boolean; uniqueValueCount: number; importedValueCount: number;
  exactDuplicateCount: number; orphanValueCount: number; conflicts: AdviceConflict[]; diagnostics: ImportDiagnostic[] };

type CoreLocation = { source_id: string; file_name: string; sheet_name: string | null; row: number | null; column: number | null };
export type CoreAdviceConflict = { cpt_id: number; pile_size_mm: number; pile_tip_level_mm: number;
  values: Array<{ frd_kn: number; locations: CoreLocation[] }> };
export type CoreAdviceSourcePreview = { source_id: string; sheets: Array<{ sheet_name: string;
  status: AdviceSheetPreview["status"]; detected_profile: ImportProfile | null; resolved_profile: ImportProfile | null;
  summary: { item_count: number; cpt_count: number; pile_sizes_mm: number[]; min_tip_level_mm: number | null;
    max_tip_level_mm: number | null; missing_cell_count: number }; diagnostics: CoreImportDiagnostic[] }>;
  suggested_selection: Array<{ sheet_name: string; profile: ImportProfile }>; diagnostics: CoreImportDiagnostic[] };
export type CoreProjectImportPreview = { existing_sources?: Array<{id:string;file_names:string[];sheet_names:string[];item_count:number;combined_legacy:boolean}>; can_apply: boolean; counts_available?: boolean; unique_value_count: number; imported_value_count: number;
  exact_duplicate_count: number; orphan_value_count: number; conflicts: CoreAdviceConflict[]; diagnostics: CoreImportDiagnostic[] };

function fromCoreConflict(c: CoreAdviceConflict): AdviceConflict {
  return { cptId: c.cpt_id, pileSizeMm: c.pile_size_mm, pileTipLevelMm: c.pile_tip_level_mm,
    values: c.values.map(v => ({ frdKn: v.frd_kn, locations: v.locations.map(l => ({
      sourceId: l.source_id, fileName: l.file_name, sheetName: l.sheet_name ?? null, row: l.row ?? null, column: l.column ?? null,
    })) })) };
}
export function fromCoreAdviceSourcePreview(p: CoreAdviceSourcePreview): AdviceSourcePreview {
  return { sourceId: p.source_id, suggestedSelection: p.suggested_selection.map(s => ({ sheetName: s.sheet_name, profile: s.profile })),
    diagnostics: p.diagnostics.map(fromCoreImportDiagnostic), sheets: p.sheets.map(s => ({
      sheetName: s.sheet_name, status: s.status, detectedProfile: s.detected_profile ?? null, resolvedProfile: s.resolved_profile ?? null,
      summary: { itemCount: s.summary.item_count, cptCount: s.summary.cpt_count, pileSizesMm: s.summary.pile_sizes_mm,
        minTipLevelMm: s.summary.min_tip_level_mm ?? null, maxTipLevelMm: s.summary.max_tip_level_mm ?? null,
        missingCellCount: s.summary.missing_cell_count }, diagnostics: s.diagnostics.map(fromCoreImportDiagnostic),
    })) };
}
export function fromCoreProjectImportPreview(p: CoreProjectImportPreview): ProjectImportPreview {
  return { existingSources: p.existing_sources?.map(s => ({id:s.id,fileNames:s.file_names,sheetNames:s.sheet_names,itemCount:s.item_count,combinedLegacy:s.combined_legacy})), canApply: p.can_apply, countsAvailable: p.counts_available ?? false, uniqueValueCount: p.unique_value_count, importedValueCount: p.imported_value_count,
    exactDuplicateCount: p.exact_duplicate_count, orphanValueCount: p.orphan_value_count,
    conflicts: p.conflicts.map(fromCoreConflict), diagnostics: p.diagnostics.map(fromCoreImportDiagnostic) };
}
export class SourceImportError extends Error {
  readonly diagnostics: ImportDiagnostic[];
  readonly conflicts: AdviceConflict[];
  constructor(message: string, diagnostics: ImportDiagnostic[], conflicts: AdviceConflict[]) {
    super(message); this.name = "SourceImportError"; this.diagnostics = diagnostics; this.conflicts = conflicts;
  }
}
export function sourceImportErrorFromUnknown(value: unknown): SourceImportError | null {
  if (value instanceof SourceImportError) return value;
  if (!value || typeof value !== "object") return null;
  const raw = value as { message?: unknown; diagnostics?: unknown; conflicts?: unknown };
  if (typeof raw.message !== "string" || !Array.isArray(raw.diagnostics) || !Array.isArray(raw.conflicts)) return null;
  return new SourceImportError(raw.message, (raw.diagnostics as CoreImportDiagnostic[]).map(fromCoreImportDiagnostic),
    (raw.conflicts as CoreAdviceConflict[]).map(fromCoreConflict));
}
