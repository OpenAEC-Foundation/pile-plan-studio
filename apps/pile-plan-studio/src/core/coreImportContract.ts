import type { ImportFileRole } from "./importFiles.ts";

export type ImportProfile = "auto" | "standard-table" | "rfem-export";

export type ImportProfileOptions = {
  coordinateSheet: string | null;
  reactionSheet: string | null;
};

export type ImportSourceInput = {
  role: ImportFileRole;
  profile: ImportProfile;
  profileOptions: ImportProfileOptions;
  fileName: string;
  format: "csv" | "xlsx";
  bytes: Uint8Array;
};

export function toCoreImportSource(source: ImportSourceInput) {
  return {
    role: source.role,
    profile: source.profile,
    profile_options: {
      coordinate_sheet: source.profileOptions.coordinateSheet,
      reaction_sheet: source.profileOptions.reactionSheet,
    },
    file_name: source.fileName,
    format: source.format,
    bytes: source.bytes,
  };
}

export type ImportDiagnosticSeverity = "warning" | "error";

export type ImportDiagnostic = {
  severity: ImportDiagnosticSeverity;
  code: string;
  count: number;
  nodeIds: number[];
  fallbackMessage: string;
};

export type ImportPreviewDetails =
  | { kind: "standard-table"; sheetName: string | null }
  | {
      kind: "rfem-export";
      coordinateSheetCandidates: string[];
      reactionSheetCandidates: string[];
      selectedCoordinateSheet: string | null;
      selectedReactionSheet: string | null;
      loadRule: string;
    };

export type ImportSourcePreview = {
  role: ImportFileRole;
  requestedProfile: ImportProfile;
  detectedProfile: ImportProfile;
  resolvedProfile: ImportProfile | null;
  availableProfiles: ImportProfile[];
  resolvedOptions: ImportProfileOptions;
  itemCount: number;
  diagnostics: ImportDiagnostic[];
  details: ImportPreviewDetails | null;
};

type CoreImportSourcePreview = {
  role: ImportFileRole;
  requested_profile: ImportProfile;
  detected_profile: ImportProfile;
  resolved_profile: ImportProfile | null;
  available_profiles: ImportProfile[];
  resolved_options: {
    coordinate_sheet: string | null;
    reaction_sheet: string | null;
  };
  item_count: number;
  diagnostics: Array<{
    severity: ImportDiagnosticSeverity;
    code: string;
    count: number;
    node_ids: number[];
    fallback_message: string;
  }>;
  details:
    | { kind: "standard-table"; sheet_name: string | null }
    | {
        kind: "rfem-export";
        coordinate_sheet_candidates: string[];
        reaction_sheet_candidates: string[];
        selected_coordinate_sheet: string | null;
        selected_reaction_sheet: string | null;
        load_rule: string;
      }
    | null;
};

export function fromCoreImportSourcePreview(preview: CoreImportSourcePreview): ImportSourcePreview {
  return {
    role: preview.role,
    requestedProfile: preview.requested_profile,
    detectedProfile: preview.detected_profile,
    resolvedProfile: preview.resolved_profile,
    availableProfiles: preview.available_profiles,
    resolvedOptions: {
      coordinateSheet: preview.resolved_options.coordinate_sheet,
      reactionSheet: preview.resolved_options.reaction_sheet,
    },
    itemCount: preview.item_count,
    diagnostics: preview.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      count: diagnostic.count,
      nodeIds: diagnostic.node_ids,
      fallbackMessage: diagnostic.fallback_message,
    })),
    details: fromCorePreviewDetails(preview.details),
  };
}

function fromCorePreviewDetails(
  details: CoreImportSourcePreview["details"],
): ImportPreviewDetails | null {
  if (!details) return null;
  if (details.kind === "standard-table") {
    return { kind: details.kind, sheetName: details.sheet_name };
  }
  return {
    kind: details.kind,
    coordinateSheetCandidates: details.coordinate_sheet_candidates,
    reactionSheetCandidates: details.reaction_sheet_candidates,
    selectedCoordinateSheet: details.selected_coordinate_sheet,
    selectedReactionSheet: details.selected_reaction_sheet,
    loadRule: details.load_rule,
  };
}
