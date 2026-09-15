import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let wasmInitialization: Promise<void> | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function initializeWasm(initialize: () => Promise<unknown>): Promise<void> {
  wasmInitialization ??= initialize().then(() => undefined);
  return wasmInitialization;
}

export async function invokeDesktop<T>(command: string, args: InvokeArgs): Promise<T> {
  return invoke<T>(command, args);
}

export function listenDesktop(event: string, handler: () => void): Promise<() => void> {
  return listen(event, handler);
}
