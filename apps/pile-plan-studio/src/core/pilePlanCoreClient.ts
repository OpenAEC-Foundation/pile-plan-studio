import initWasm, {
  apply_load_point_group_assignment,
  apply_load_point_group_edit,
  assess_load_point_group_assignments,
  derive_load_point_groups,
  export_pile_plan_csv,
  export_pile_plan_xlsx,
  preview_pile_plan_import_file,
  preview_load_point_group_edit,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type {
  LoadPoint,
  LoadPointGroupingSettings,
  PilePlanExportInput,
} from "./projectTypes.ts";
import {
  fromCorePilePlanImportPreview,
  toCorePilePlanImportRequest,
  type PilePlanImportPreview,
  type PilePlanImportRequest,
} from "./pilePlanImportContract.ts";
import {
  derivedLoadPointGroupsFromCore,
  groupAssignmentConflictsFromCore,
  loadPointGroupEditResultFromCore,
  loadPointGroupAssignmentResultFromCore,
  toApplyLoadPointGroupEditRequest,
  toBrowserGroupAssignmentAssessmentRequest,
  toBrowserLoadPointGroupAssignmentRequest,
  toDeriveLoadPointGroupsRequest,
  toDesktopGroupAssignmentAssessmentRequest,
  toDesktopLoadPointGroupAssignmentRequest,
  toPreviewLoadPointGroupEditRequest,
  type ApplyLoadPointGroupAssignmentResult,
  type DerivedLoadPointGroups,
  type GroupAssignmentAssessmentInput,
  type GroupAssignmentConflict,
  type LoadPointGroupAssignmentInput,
  type LoadPointGroupEditInput,
  type LoadPointGroupEditPreview,
  type LoadPointGroupEditResult,
} from "./loadPointGroupContract.ts";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

async function ensureWasm(): Promise<void> {
  return initializeWasm(() => initWasm());
}

export async function deriveLoadPointGroupsCore(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): Promise<DerivedLoadPointGroups> {
  const request = toDeriveLoadPointGroupsRequest(loadPoints, settings);
  let result: DerivedLoadPointGroups;
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = derive_load_point_groups(request) as DerivedLoadPointGroups;
  } else {
    result = await invokeDesktop<DerivedLoadPointGroups>("derive_load_point_groups", { request });
  }
  return derivedLoadPointGroupsFromCore(result);
}

export async function previewLoadPointGroupEditCore(
  input: LoadPointGroupEditInput,
): Promise<LoadPointGroupEditPreview> {
  const request = toPreviewLoadPointGroupEditRequest(input);
  if (!isTauriRuntime()) {
    await ensureWasm();
    return preview_load_point_group_edit(request) as LoadPointGroupEditPreview;
  }
  return invokeDesktop<LoadPointGroupEditPreview>("preview_load_point_group_edit", { request });
}

export async function applyLoadPointGroupEditCore(
  input: LoadPointGroupEditInput,
): Promise<LoadPointGroupEditResult> {
  const request = toApplyLoadPointGroupEditRequest(input);
  let result: Parameters<typeof loadPointGroupEditResultFromCore>[0];
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = apply_load_point_group_edit(request) as typeof result;
  } else {
    result = await invokeDesktop<typeof result>("apply_load_point_group_edit", { request });
  }
  return loadPointGroupEditResultFromCore(result);
}

export async function assessLoadPointGroupAssignmentsCore(
  input: GroupAssignmentAssessmentInput,
): Promise<GroupAssignmentConflict[]> {
  let result: GroupAssignmentConflict[];
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = assess_load_point_group_assignments(
      toBrowserGroupAssignmentAssessmentRequest(input),
    ) as GroupAssignmentConflict[];
  } else {
    result = await invokeDesktop<GroupAssignmentConflict[]>(
      "assess_load_point_group_assignments",
      { request: toDesktopGroupAssignmentAssessmentRequest(input) },
    );
  }
  return groupAssignmentConflictsFromCore(result);
}

export async function applyLoadPointGroupAssignmentCore(
  input: LoadPointGroupAssignmentInput,
): Promise<ApplyLoadPointGroupAssignmentResult> {
  let result: ApplyLoadPointGroupAssignmentResult;
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = apply_load_point_group_assignment(
      toBrowserLoadPointGroupAssignmentRequest(input),
    ) as ApplyLoadPointGroupAssignmentResult;
  } else {
    result = await invokeDesktop<ApplyLoadPointGroupAssignmentResult>(
      "apply_load_point_group_assignment",
      { request: toDesktopLoadPointGroupAssignmentRequest(input) },
    );
  }
  return loadPointGroupAssignmentResultFromCore(result);
}



export async function previewPilePlanImportCore(
  input: PilePlanImportRequest,
): Promise<PilePlanImportPreview> {
  const request = toCorePilePlanImportRequest(input);
  if (!isTauriRuntime()) {
    await ensureWasm();
    return fromCorePilePlanImportPreview(preview_pile_plan_import_file(request));
  }
  return fromCorePilePlanImportPreview(
    await invokeDesktop("preview_pile_plan_import_file", { request }),
  );
}

export async function exportPilePlanCsvCore(input: PilePlanExportInput): Promise<Uint8Array> {
  return exportPilePlanCore("csv", input);
}

export async function exportPilePlanXlsxCore(input: PilePlanExportInput): Promise<Uint8Array> {
  return exportPilePlanCore("xlsx", input);
}

async function exportPilePlanCore(
  format: "csv" | "xlsx",
  input: PilePlanExportInput,
): Promise<Uint8Array> {
  const wasmRequest = {
    load_points: input.loadPoints,
    selected_piles: toWasmNumberKeyedMap(input.selectedPiles),
    selected_cpts: toWasmNumberKeyedMap(input.selectedCpts),
  };

  if (!isTauriRuntime()) {
    await ensureWasm();
    return binaryResultToUint8Array(
      format === "csv" ? export_pile_plan_csv(wasmRequest) : export_pile_plan_xlsx(wasmRequest),
    );
  }

  const result = await invokeDesktop<number[]>(`export_pile_plan_${format}`, {
    request: {
      load_points: input.loadPoints,
      selected_piles: toStringKeyedRecord(input.selectedPiles),
      selected_cpts: toStringKeyedRecord(input.selectedCpts),
    },
  });
  return binaryResultToUint8Array(result);
}
