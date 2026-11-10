import initWasm, { get_pile_plan_import_requirements, get_standard_csv_requirements } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

export async function sourceImportRequirements(): Promise<Record<string, unknown>> {
  if (isTauriRuntime()) return invokeDesktop("get_standard_csv_requirements", {});
  await initializeWasm(initWasm);
  return get_standard_csv_requirements();
}

export async function pilePlanImportRequirements(): Promise<Record<string, unknown>> {
  if (isTauriRuntime()) return invokeDesktop("get_pile_plan_import_requirements", {});
  await initializeWasm(initWasm);
  return get_pile_plan_import_requirements();
}
