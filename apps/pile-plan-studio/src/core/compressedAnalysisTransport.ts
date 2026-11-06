import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

const bulkAnalysisCommands = new Set([
  "calculate_pile_option_analysis",
  "assess_technical_assignment",
  "aggregate_pile_options",
  "choose_default_options",
  "build_tip_level_region_topology",
]);

export function supportsCompressedAnalysis(command: string): boolean {
  return bulkAnalysisCommands.has(command)
    && typeof CompressionStream === "function"
    && typeof DecompressionStream === "function";
}

/** Keep full Rust facts while avoiding large JSON trees in Tauri's IPC decoder. */
export async function invokeCompressedAnalysis<T>(command: string, args: InvokeArgs): Promise<T> {
  const request = (args as Record<string, unknown>).request;
  const payload = await new Response(new Blob([JSON.stringify({ command, request })]).stream()
    .pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const response = await invoke<ArrayBuffer | number[]>("run_analysis_payload", payload);
  const responseBytes = Array.isArray(response) ? Uint8Array.from(response) : response;
  return new Response(new Blob([responseBytes]).stream()
    .pipeThrough(new DecompressionStream("gzip"))).json() as Promise<T>;
}
