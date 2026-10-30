import { fromCoreAdviceSourcePreview, type AdviceImportOperation, type AdviceSheetSelection, type AdviceSourcePreview, type CoreAdviceSourcePreview } from "./adviceImportContract.ts";
import type { ImportFileRole } from "./importFiles.ts";
import type { PileTipLevelPrecisionReason } from "./projectDocumentContract.ts";

export type ImportProfile = "auto" | "standard-table" | "rfem-export" | "capacity-columns";
export type ImportColumnMapping={column:number;field:string;unit?:string|null;pile_size_mm?:number|null};
export type TableImportSettings={fixed_pile_size_mm?:number|null;pile_count?:number|null;sheet_name?:string|null;has_headers?:boolean|null;header_row?:number|null;first_data_row?:number|null;delimiter?:string|null;columns?:ImportColumnMapping[]|null};
export type SourceTablePreview={sheets:string[];settings:TableImportSettings;columns:Array<{column:number;header:string;nonempty_count:number;numeric_count:number}>;rows:Array<{number:number;cells:string[]}>;row_count:number;processed:boolean};

export type ImportProfileOptions = {
  table?:TableImportSettings|null;
  importTension?: boolean; clearTension?: boolean; tensionColumn?: number|null; resistanceDirection?: "compression"|"tension";
  adviceSheets?: AdviceSheetSelection[] | null;
  coordinateSheet: string | null;
  reactionSheet: string | null;
};

export type ImportSourceInput = {
  sourceId?: string;
  adviceOperation?: AdviceImportOperation;
  role: ImportFileRole;
  profile: ImportProfile;
  profileOptions: ImportProfileOptions;
  fileName: string;
  format: "csv" | "xlsx";
  bytes: Uint8Array;
};

export function toCoreImportSource(source: ImportSourceInput) {
  return {
    ...(source.sourceId === undefined ? {} : { source_id: source.sourceId }),
    ...(source.adviceOperation === undefined ? {} : {advice_operation: source.adviceOperation.kind === "append" ? {kind:"append"} : {kind:"replace",advice_id:source.adviceOperation.adviceId}}),
    role: source.role,
    profile: source.profile,
    profile_options: {
      ...(source.profileOptions.table===undefined?{}:{table:source.profileOptions.table}),
      ...(source.profileOptions.importTension === undefined ? {} : {import_tension:source.profileOptions.importTension}),
      ...(source.profileOptions.clearTension === undefined ? {} : {clear_tension:source.profileOptions.clearTension}),
      ...(source.profileOptions.tensionColumn === undefined ? {} : {tension_column:source.profileOptions.tensionColumn}),
      ...(source.profileOptions.resistanceDirection === undefined ? {} : {resistance_direction:source.profileOptions.resistanceDirection}),
      ...(source.profileOptions.adviceSheets === undefined ? {} : { advice_sheets: source.profileOptions.adviceSheets?.map(s => ({ sheet_name: s.sheetName, profile: s.profile, ...(s.table?{table:s.table}:{}),...(s.direction ? {direction:s.direction}:{}), ...(s.tensionColumn != null ? {tension_column:s.tensionColumn}:{}) })) ?? null }),
      coordinate_sheet: source.profileOptions.coordinateSheet,
      reaction_sheet: source.profileOptions.reactionSheet,
    },
    file_name: source.fileName,
    format: source.format,
    bytes: source.bytes,
  };
}

export type ImportDiagnosticSeverity = "warning" | "error";

export type AdviceDiagnosticDetails = {
  field: "cpt-id" | "tip-level" | "pile-size" | "resistance" | "header" | null;
  value: string | null; expectedUnit: "metres" | "millimetres" | "kilonewtons" | null;
  pileSizesMm: number[]; columnCount: number | null; requiredProfile: ImportProfile | null;
};
export type CoreAdviceDiagnosticDetails = {
  field: AdviceDiagnosticDetails["field"]; value: string | null; expected_unit: AdviceDiagnosticDetails["expectedUnit"];
  pile_sizes_mm?: number[]; column_count: number | null; required_profile: ImportProfile | null;
};
export type ImportDiagnostic = {
  severity: ImportDiagnosticSeverity;
  code: string;
  count: number;
  nodeIds: number[];
  loadPointNames: string[];
  xMm: number | null;
  yMm: number | null;
  location: ImportDiagnosticLocation | null;
  tipLevelValues: ImportPileTipLevelDiagnostic[];
  advice?: AdviceDiagnosticDetails | null;
  fallbackMessage: string;
};

export type ImportDiagnosticLocation = {
  fileName: string;
  sheetName: string | null;
  row: number | null;
  column: number | null;
  columnName: string | null;
};

export type ImportPileTipLevelDiagnostic = {
  location: ImportDiagnosticLocation;
  value: string;
  reason: PileTipLevelPrecisionReason;
};

export type ImportPreviewDetails =
  | { kind: "foundation-advice"; advice: AdviceSourcePreview }
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
  table?:SourceTablePreview|null;
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

export type CoreImportSourcePreview = {
  table?:SourceTablePreview|null;
  role: ImportFileRole;
  requested_profile: ImportProfile;
  detected_profile: ImportProfile;
  resolved_profile: ImportProfile | null;
  available_profiles: ImportProfile[];
  resolved_options: {
    table?:TableImportSettings|null;
    import_tension?: boolean;clear_tension?:boolean;tension_column?:number|null;resistance_direction?:"compression"|"tension";
    advice_sheets?: Array<{ sheet_name: string; profile: ImportProfile;direction?:"compression"|"tension";tension_column?:number|null;table?:TableImportSettings|null }> | null;
    coordinate_sheet: string | null;
    reaction_sheet: string | null;
  };
  item_count: number;
  diagnostics: Array<{
    severity: ImportDiagnosticSeverity;
    code: string;
    count: number;
    node_ids: number[];
    load_point_names?: string[];
    x_mm?: number | null;
    y_mm?: number | null;
    location?: CoreImportDiagnosticLocation | null;
    pile_tip_levels?: Array<{
      location: CoreImportDiagnosticLocation;
      value: string;
      reason: PileTipLevelPrecisionReason;
    }>;
    advice?: CoreAdviceDiagnosticDetails | null;
    fallback_message: string;
  }>;
  details:
    | ({ kind: "foundation-advice" } & CoreAdviceSourcePreview)
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
    ...(preview.table?{table:preview.table}:{}),
    resolvedOptions: {
      ...(preview.resolved_options.table?{table:preview.resolved_options.table}:{}),
      ...(preview.resolved_options.import_tension===undefined?{}:{importTension:preview.resolved_options.import_tension}),
      ...(preview.resolved_options.clear_tension===undefined?{}:{clearTension:preview.resolved_options.clear_tension}),
      ...(preview.resolved_options.tension_column==null?{}:{tensionColumn:preview.resolved_options.tension_column}),
      ...(preview.resolved_options.resistance_direction===undefined?{}:{resistanceDirection:preview.resolved_options.resistance_direction}),
      ...(preview.resolved_options.advice_sheets === undefined ? {} : { adviceSheets: preview.resolved_options.advice_sheets?.map(s => ({ sheetName: s.sheet_name, profile: s.profile,...(s.table?{table:s.table}:{}), ...(s.direction?{direction:s.direction}:{}),...(s.tension_column!=null?{tensionColumn:s.tension_column}:{}) })) ?? null }),
      coordinateSheet: preview.resolved_options.coordinate_sheet,
      reactionSheet: preview.resolved_options.reaction_sheet,
    },
    itemCount: preview.item_count,
    diagnostics: preview.diagnostics.map(fromCoreImportDiagnostic),
    details: fromCorePreviewDetails(preview.details),
  };
}

type CoreImportDiagnosticLocation = {
  file_name: string;
  sheet_name?: string | null;
  row?: number | null;
  column?: number | null;
  column_name?: string | null;
};

function fromCoreDiagnosticLocation(
  location: CoreImportDiagnosticLocation,
): ImportDiagnosticLocation {
  return {
    fileName: location.file_name,
    sheetName: location.sheet_name ?? null,
    row: location.row ?? null,
    column: location.column ?? null,
    columnName: location.column_name ?? null,
  };
}

function fromCorePreviewDetails(
  details: CoreImportSourcePreview["details"],
): ImportPreviewDetails | null {
  if (!details) return null;
  if (details.kind === "foundation-advice") return { kind: details.kind, advice: fromCoreAdviceSourcePreview(details) };
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

export type CoreImportDiagnostic = CoreImportSourcePreview["diagnostics"][number];
export function fromCoreImportDiagnostic(diagnostic: CoreImportDiagnostic): ImportDiagnostic { return {
      severity: diagnostic.severity,
      code: diagnostic.code,
      count: diagnostic.count,
      nodeIds: diagnostic.node_ids,
      loadPointNames: diagnostic.load_point_names ?? [],
      xMm: diagnostic.x_mm ?? null,
      yMm: diagnostic.y_mm ?? null,
      location: diagnostic.location ? fromCoreDiagnosticLocation(diagnostic.location) : null,
      tipLevelValues: (diagnostic.pile_tip_levels ?? []).map((item) => ({
        value: item.value,
        reason: item.reason,
        location: fromCoreDiagnosticLocation(item.location),
      })),
      ...(diagnostic.advice ? {advice: { field: diagnostic.advice.field ?? null, value: diagnostic.advice.value ?? null,
        expectedUnit: diagnostic.advice.expected_unit ?? null, pileSizesMm: diagnostic.advice.pile_sizes_mm ?? [],
        columnCount: diagnostic.advice.column_count ?? null, requiredProfile: diagnostic.advice.required_profile ?? null }} : {}),
      fallbackMessage: diagnostic.fallback_message,
    }; }
