import initWasm, {
  apply_load_point_group_assignment,
  derive_load_point_groups,
  export_pile_plan_csv,
  export_pile_plan_xlsx,
  greedy_optimize,
  preview_pile_plan_import_file,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type {
  GreedyOptimizationOutcome,
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
  loadPointGroupAssignmentResultFromCore,
  loadPointGroupsFromCore,
  toBrowserLoadPointGroupAssignmentRequest,
  toDeriveLoadPointGroupsRequest,
  toDesktopLoadPointGroupAssignmentRequest,
  type ApplyLoadPointGroupAssignmentResult,
  type LoadPointGroup,
  type LoadPointGroupAssignmentInput,
} from "./loadPointGroupContract.ts";
import {
  greedyOptimizationOutcomeFromCore,
  toBrowserGreedyOptimizationRequest,
  toDesktopGreedyOptimizationRequest,
  type GreedyOptimizationContractInput,
} from "./greedyOptimizationContract.ts";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

async function ensureWasm(): Promise<void> {
  return initializeWasm(() => initWasm());
}

export async function deriveLoadPointGroupsCore(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): Promise<LoadPointGroup[]> {
  const request = toDeriveLoadPointGroupsRequest(loadPoints, settings);
  let result: LoadPointGroup[];
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = derive_load_point_groups(request) as LoadPointGroup[];
  } else {
    result = await invokeDesktop<LoadPointGroup[]>("derive_load_point_groups", { request });
  }
  return loadPointGroupsFromCore(result);
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

export async function greedyOptimizeCore(
  input: GreedyOptimizationContractInput,
): Promise<GreedyOptimizationOutcome> {
  if (!isTauriRuntime()) {
    await ensureWasm();
    const outcome = greedy_optimize(
      toBrowserGreedyOptimizationRequest(input),
    ) as GreedyOptimizationOutcome;
    return greedyOptimizationOutcomeFromCore(outcome);
  }

  const outcome = await invokeDesktop<GreedyOptimizationOutcome>("greedy_optimize", {
    request: toDesktopGreedyOptimizationRequest(input),
  });
  return greedyOptimizationOutcomeFromCore(outcome);
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
