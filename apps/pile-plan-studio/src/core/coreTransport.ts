import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { invokeCompressedAnalysis, supportsCompressedAnalysis } from "./compressedAnalysisTransport.ts";

const wasmInitializations = new WeakMap<() => Promise<unknown>, Promise<void>>();

export function isTauriRuntime(): boolean {
  // WebView2 can inject the host application's Tauri globals into its iframes.
  return typeof window !== "undefined" && window.top === window && "__TAURI_INTERNALS__" in window;
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
  return supportsCompressedAnalysis(command)
    ? invokeCompressedAnalysis<T>(command, args) : invoke<T>(command, args);
}

export function listenDesktop(event: string, handler: () => void): Promise<() => void> {
  return listen(event, handler);
}
