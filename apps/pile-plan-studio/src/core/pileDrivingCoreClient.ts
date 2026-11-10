import initWasm, { preview_pile_driving_files } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";
import type { PileConfigurationKey } from "./projectTypes.ts";
import type { SourceTablePreview, TableImportSettings } from "./coreImportContract.ts";

export type PileDrivingMatchField = "revit-mark" | "location-id";
export type PileDrivingTarget = {
  load_point_id: number;
  revit_mark?: string;
  configuration?: PileConfigurationKey;
  selected_cpt_ids?: number[];
};
export type PileDrivingCheckSettings = {
  minimum_end_blows: number;
  end_window_increments: number;
  maximum_end_drop: number;
  length_tolerance_mm: number;
  level_tolerance_mm: number;
  neighborhood_tolerance_pct: number;
  peer_energy_spread_kj: number;
  target_energy_tolerance_kj: number;
  expected_energy: Array<{ pile_size_mm: number; energy_kj: number }>;
};
export type PileDrivingCheck = {
  kind: "size" | "length" | "level" | "end-calendar" | "trend" | "energy-target" | "neighborhood";
  status: "ok" | "warning" | "unavailable";
  actual?: number | null;
  other?: number | null;
  reference?: number | null;
  tolerance?: number | null;
};
export type PileDrivingMatch =
  | { status: "matched"; load_point_id: number }
  | { status: "unmatched" | "ambiguous" };
export type PileDrivingRecord = {
  pile_number: string;
  rows: string[][];
  matching: PileDrivingMatch;
  checks: PileDrivingCheck[];
  energy_range?: PileDrivingEnergyRange | null;
  neighborhood?: PileDrivingNeighborhood | null;
};
type NeighborhoodContext = {
  final_ppn_m?: number | null;
  mean_energy_kj?: number | null;
};
export type PileDrivingNeighborhood = NeighborhoodContext & {
  peer_count: number;
  relaxed_selection: boolean;
  reference_piles: Array<NeighborhoodContext & {
    load_point_id: number;
    mean_blows: number;
    deviation_pct: number;
    exceeds_tolerance: boolean;
  }>;
};
export type PileDrivingEnergyRange = { minimum_kj: number; maximum_kj: number };
export type PileDrivingEnergyGroup = {
  pile_size_mm: number;
  pile_count: number;
  minimum_kj: number;
  maximum_kj: number;
  spread_kj?: number | null;
  status: PileDrivingCheck["status"];
};
export type PileDrivingPreview = {
  columns: string[];
  records: PileDrivingRecord[];
};
export type PileDrivingFileResult = (
  | { status: "ready"; preview: PileDrivingPreview }
  | { status: "failed"; error: PileDrivingImportError }
) & { table?: SourceTablePreview | null };
export type PileDrivingSharedTable = { headers: string[]; settings: TableImportSettings };
export type ProjectPileDrivingFile = {
  id: string;
  file_name: string;
  format: "csv" | "xlsx";
  data_base64: string;
  overrides?: { match_by?: PileDrivingMatchField; table?: TableImportSettings };
};
export type ProjectPileDriving = {
  files: ProjectPileDrivingFile[];
  shared_match_by?: PileDrivingMatchField;
  shared_table?: PileDrivingSharedTable;
  check_settings?: PileDrivingCheckSettings;
};
export type PileDrivingBatchPreview = {
  files: PileDrivingFileResult[];
  settings: PileDrivingCheckSettings;
  energy_by_size: PileDrivingEnergyGroup[];
};
export type PileDrivingImportError =
  | { code: "missing-pile-number"; row: number }
  | { code: "unreadable" | "missing-pile-number-column" | "multiple-pile-number-columns" | "multiple-pile-number-tables" | "no-records" | "invalid-check-settings" | "invalid-column-mapping" | "missing-worksheet" };

export async function previewPileDrivingFilesCore(request: {
  files: Array<{
    file_name: string;
    format: "csv" | "xlsx";
    bytes: Uint8Array;
    match_by: PileDrivingMatchField;
    independent?: boolean;
    table?: TableImportSettings;
  }>;
  shared_table?: PileDrivingSharedTable;
  targets: PileDrivingTarget[];
  pile_head_level_m: number | null;
  settings?: PileDrivingCheckSettings;
}): Promise<PileDrivingBatchPreview> {
  if (isTauriRuntime()) {
    return invokeDesktop("preview_pile_driving_files", {
      request: { ...request, files: request.files.map(file => ({ ...file, bytes: Array.from(file.bytes) })) },
    });
  }
  await initializeWasm(initWasm);
  return preview_pile_driving_files(request);
}
