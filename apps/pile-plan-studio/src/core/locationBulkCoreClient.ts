import initWasm, {
  validate_manual_cpt_selection_batch,
  validate_load_point_lock_batch,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

export type ManualCptSelectionProposal = { load_point_id: number; cpt_ids: number[] | null };
export type LoadPointLockProposal = { load_point_id: number; locked: boolean };
export type ManualCptSelectionBatchResult =
  | { status: "valid"; changes: ManualCptSelectionProposal[] }
  | { status: "blocked"; reason: "unknown_load_point" | "unknown_cpt" | "duplicate_target"; ids: number[] };
export type LoadPointLockBatchResult =
  | { status: "valid"; changes: LoadPointLockProposal[] }
  | { status: "blocked"; reason: "unknown_load_point" | "duplicate_target"; ids: number[] };

export async function validateManualCptSelectionBatchCore(input: {
  loadPointIds: number[]; cptIds: number[]; changes: ManualCptSelectionProposal[];
}): Promise<ManualCptSelectionBatchResult> {
  const request = { load_point_ids: input.loadPointIds, cpt_ids: input.cptIds, changes: input.changes };
  if (isTauriRuntime()) return invokeDesktop("validate_manual_cpt_selection_batch", { request });
  await initializeWasm(() => initWasm());
  return validate_manual_cpt_selection_batch(request) as ManualCptSelectionBatchResult;
}

export async function validateLoadPointLockBatchCore(input: {
  loadPointIds: number[]; changes: LoadPointLockProposal[];
}): Promise<LoadPointLockBatchResult> {
  const request = { load_point_ids: input.loadPointIds, changes: input.changes };
  if (isTauriRuntime()) return invokeDesktop("validate_load_point_lock_batch", { request });
  await initializeWasm(() => initWasm());
  return validate_load_point_lock_batch(request) as LoadPointLockBatchResult;
}
