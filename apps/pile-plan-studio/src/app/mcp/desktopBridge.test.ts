import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDesktopMcpBridge } from "./desktopBridge.ts";

describe("desktop MCP event adapter", () => {
  it("correlates requests and stops answering after disable", async () => {
    let handler: ((event: { payload: { id: string; body: string } }) => void) | null = null;
    const responses: Array<{ id: string; body: string }> = [];
    const bridge = createDesktopMcpBridge({
      invoke: async (name: string) => name === "mcp_bridge_start"
        ? { endpoint: "http://127.0.0.1:1234/mcp", token: "test" } : undefined,
      listen: async (_name, callback) => { handler = callback; return () => { handler = null; }; },
      emit: async (_name, payload) => { responses.push(payload); },
    });
    await bridge.start(async (body) => JSON.stringify({ body }));
    await handler?.({ payload: { id: "one", body: "hello" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(responses[0].id, "one");
    await bridge.stop();
    await handler?.({ payload: { id: "two", body: "late" } });
    assert.equal(responses.length, 1);
  });

  it("answers a request received while the listener is starting", async () => {
    let handler: ((event: { payload: { id: string; body: string } }) => void) | null = null;
    const responses: Array<{ id: string; body: string }> = [];
    let finishStart: ((value: unknown) => void) | null = null;
    const bridge = createDesktopMcpBridge({
      invoke: (name: string) => name === "mcp_bridge_start"
        ? new Promise((resolve) => { finishStart = resolve; }) : Promise.resolve(),
      listen: async (_name, callback) => { handler = callback; return () => { handler = null; }; },
      emit: async (_name, payload) => { responses.push(payload); },
    });
    const starting = bridge.start(async () => "{}");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handler?.({ payload: { id: "early", body: "{}" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(responses.length, 1);
    finishStart?.({ endpoint: "http://127.0.0.1:1234/mcp", token: "test" });
    await starting;
    await bridge.stop();
  });
});
