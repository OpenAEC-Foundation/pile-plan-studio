import type { Cpt, LoadPoint, PileConfigurationKey } from "./projectTypes.ts";

export type PilePlanImportProfile = "automatic" | "standard-table" | "legacy";

export type PilePlanImportOptions = {
  importPileAssignments: boolean;
  importCptSelections: boolean;
  coordinateToleranceMm: number;
};

export type PilePlanImportRequest = {
  fileName: string;
  format: "csv" | "xlsx";
  bytes: Uint8Array;
  profile: PilePlanImportProfile;
  options: PilePlanImportOptions;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  availablePileConfigurations: PileConfigurationKey[];
};

export type PilePlanImportedValue<T> =
  | { action: "preserve" }
  | { action: "clear" }
  | { action: "set"; value: T };

export type PilePlanImportChange = {
  load_point_id: number;
  pile: PilePlanImportedValue<PileConfigurationKey>;
  manual_cpt_ids: PilePlanImportedValue<number[]>;
};

export type PilePlanImportPatch = {
  changes: PilePlanImportChange[];
};

export type PilePlanImportDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
  location: {
    sheetName: string | null;
    row: number | null;
    column: number | null;
  } | null;
};

export type PilePlanImportSummary = {
  sourceRows: number;
  matchedRows: number;
  coordinateFallbacks: number;
  skippedRows: number;
  conflicts: number;
};

export type PilePlanImportPreview = {
  requestedProfile: PilePlanImportProfile;
  detectedProfile: PilePlanImportProfile | null;
  supportsCptSelections: boolean;
  canApply: boolean;
  summary: PilePlanImportSummary;
  diagnostics: PilePlanImportDiagnostic[];
  patch: PilePlanImportPatch;
};

type CorePilePlanImportPreview = {
  requested_profile: PilePlanImportProfile;
  detected_profile: PilePlanImportProfile | null;
  supports_cpt_selections: boolean;
  can_apply: boolean;
  summary: {
    source_rows: number;
    matched_rows: number;
    coordinate_fallbacks: number;
    skipped_rows: number;
    conflicts: number;
  };
  diagnostics: Array<{
    severity: "warning" | "error";
    code: string;
    message: string;
    location: {
      sheet_name: string | null;
      row: number | null;
      column: number | null;
    } | null;
  }>;
  patch: PilePlanImportPatch;
};

export function toCorePilePlanImportRequest(request: PilePlanImportRequest) {
  return {
    file_name: request.fileName,
    format: request.format,
    bytes: request.bytes,
    profile: request.profile,
    options: {
      import_pile_assignments: request.options.importPileAssignments,
      import_cpt_selections: request.options.importCptSelections,
      coordinate_tolerance_mm: request.options.coordinateToleranceMm,
    },
    load_points: request.loadPoints,
    cpts: request.cpts,
    available_pile_configurations: request.availablePileConfigurations,
  };
}

export function fromCorePilePlanImportPreview(
  preview: CorePilePlanImportPreview,
): PilePlanImportPreview {
  return {
    requestedProfile: preview.requested_profile,
    detectedProfile: preview.detected_profile,
    supportsCptSelections: preview.supports_cpt_selections,
    canApply: preview.can_apply,
    summary: {
      sourceRows: preview.summary.source_rows,
      matchedRows: preview.summary.matched_rows,
      coordinateFallbacks: preview.summary.coordinate_fallbacks,
      skippedRows: preview.summary.skipped_rows,
      conflicts: preview.summary.conflicts,
    },
    diagnostics: preview.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      location: diagnostic.location ? {
        sheetName: diagnostic.location.sheet_name,
        row: diagnostic.location.row,
        column: diagnostic.location.column,
      } : null,
    })),
    patch: preview.patch,
  };
}
