import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { invokeDesktop } from "./coreTransport.ts";

const previousWindow = globalThis.window;
beforeEach(() => { globalThis.window = {} as Window & typeof globalThis; });
afterEach(() => { clearMocks(); globalThis.window = previousWindow; });

const fixture = {
  label: "Sondering café Ω", missing: null, valid: false,
  compression: { demand_kn: 123.45, cpt_resistances: [{ cpt_id: 7, frd_kn: null }] },
  tension: { status: "not_assessed" },
};

async function gzip(value: unknown): Promise<ArrayBuffer> {
  return new Response(new Blob([JSON.stringify(value)]).stream()
    .pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

test("bulk native analysis uses compressed byte bodies and preserves complete result facts", async () => {
  mockIPC(async (command, body) => {
    assert.equal(command, "run_analysis_payload");
    assert.ok(body instanceof ArrayBuffer);
    const request = await new Response(new Blob([body]).stream()
      .pipeThrough(new DecompressionStream("gzip"))).json();
    assert.deepEqual(request, { command: "calculate_pile_option_analysis", request: fixture });
    return gzip(fixture);
  });
  try {
    assert.deepEqual(await invokeDesktop("calculate_pile_option_analysis", { request: fixture }), fixture);
  } finally { clearMocks(); }
});

test("structured native errors propagate without retrying the expensive request", async () => {
  const failure = { missing_load_point_ids: [7] };
  let calls = 0;
  mockIPC((command) => {
    assert.equal(command, "run_analysis_payload");
    calls++;
    throw failure;
  });
  try {
    await assert.rejects(invokeDesktop("assess_technical_assignment", { request: {} }),
      error => { assert.deepEqual(error, failure); return true; });
    assert.equal(calls, 1);
  } finally { clearMocks(); }
});

test("accepts byte-array responses from WebView IPC fallbacks", async () => {
  mockIPC(async () => Array.from(new Uint8Array(await gzip(fixture))));
  try { assert.deepEqual(await invokeDesktop("aggregate_pile_options", { request: {} }), fixture); }
  finally { clearMocks(); }
});

test("desktop WebViews without Compression Streams retain the ordinary command", async () => {
  const original = globalThis.CompressionStream;
  Object.defineProperty(globalThis, "CompressionStream", { value: undefined, configurable: true, writable: true });
  mockIPC((command, request) => {
    assert.equal(command, "calculate_pile_option_analysis");
    assert.deepEqual(request, { request: fixture });
    return fixture;
  });
  try { assert.deepEqual(await invokeDesktop("calculate_pile_option_analysis", { request: fixture }), fixture); }
  finally {
    globalThis.CompressionStream = original;
    clearMocks();
  }
});

test("ordinary desktop commands keep their existing payload and response", async () => {
  mockIPC((command, request) => {
    assert.equal(command, "calculate_pile_option_cost");
    assert.deepEqual(request, { request: { size: 320 } });
    return { cost: null };
  });
  try { assert.deepEqual(await invokeDesktop("calculate_pile_option_cost", { request: { size: 320 } }), { cost: null }); }
  finally { clearMocks(); }
});
