import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const wasmInitializations = new WeakMap<() => Promise<unknown>, Promise<void>>();

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function initializeWasm(initialize: () => Promise<unknown>): Promise<void> {
  let pending = wasmInitializations.get(initialize);
  if (!pending) {
    pending = Promise.resolve().then(initialize).then(() => undefined).catch(error => {
      wasmInitializations.delete(initialize);
      throw error;
    });
    wasmInitializations.set(initialize, pending);
  }
  return pending;
}

export async function invokeDesktop<T>(command: string, args: InvokeArgs): Promise<T> {
  return invoke<T>(command, args);
}

export function listenDesktop(event: string, handler: () => void): Promise<() => void> {
  return listen(event, handler);
}
