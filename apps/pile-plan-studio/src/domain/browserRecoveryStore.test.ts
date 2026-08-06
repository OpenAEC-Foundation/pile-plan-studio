import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserRecoveryRecord } from "./browserRecovery.ts";
import {
  createBrowserRecoveryWriter,
  type BrowserRecoveryStore,
} from "./browserRecoveryStore.ts";

function record(projectName: string): BrowserRecoveryRecord {
  return {
    formatVersion: 1,
    appVersion: "0.1.7",
    schemaVersion: 2,
    projectName,
    updatedAt: "2026-08-05T10:00:00.000Z",
    ifcppText: JSON.stringify({ schema: "IFCPP", schema_version: 2, metadata: { name: projectName } }),
    savedProjectSignature: "",
    isDirty: true,
  };
}

function harness(options?: { rejectWrite?: boolean }) {
  const writes: BrowserRecoveryRecord[] = [];
  const errors: unknown[] = [];
  let callback: (() => void) | null = null;
  const store: BrowserRecoveryStore = {
    read: async () => null,
    clear: async () => undefined,
    write: async (value) => {
      if (options?.rejectWrite) throw new Error("quota exceeded");
      writes.push(value);
    },
  };
  const writer = createBrowserRecoveryWriter({
    store,
    delayMs: 500,
    onError: (error) => errors.push(error),
    setTimer: (next) => {
      callback = next;
      return 1;
    },
    clearTimer: () => {
      callback = null;
    },
  });
  return {
    errors,
    writes,
    writer,
    runTimer: async () => {
      const next = callback;
      callback = null;
      next?.();
      await writer.flushPendingWrites();
    },
  };
}

describe("browser recovery writer", () => {
  it("does not write before the initial recovery lookup is complete", async () => {
    const test = harness();
    test.writer.schedule(() => Promise.resolve(record("Too early")));
    await test.runTimer();
    assert.deepEqual(test.writes, []);
  });

  it("debounces rapid changes and writes only the latest project", async () => {
    const test = harness();
    test.writer.markReady();
    test.writer.schedule(() => Promise.resolve(record("First")));
    test.writer.schedule(() => Promise.resolve(record("Latest")));

    await test.runTimer();

    assert.deepEqual(test.writes.map((value) => value.projectName), ["Latest"]);
  });

  it("flushes pending recovery immediately", async () => {
    const test = harness();
    test.writer.markReady();
    test.writer.schedule(() => Promise.resolve(record("Flush me")));

    await test.writer.flush();

    assert.deepEqual(test.writes.map((value) => value.projectName), ["Flush me"]);
  });

  it("reports storage failures without rejecting the editing flow", async () => {
    const test = harness({ rejectWrite: true });
    test.writer.markReady();
    test.writer.schedule(() => Promise.resolve(record("Still editable")));

    await test.writer.flush();

    assert.equal(test.errors.length, 1);
    assert.deepEqual(test.writes, []);
  });
});
