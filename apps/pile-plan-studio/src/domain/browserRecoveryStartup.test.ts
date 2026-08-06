import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBrowserRecoveryRecord } from "./browserRecovery.ts";
import { loadBrowserRecovery } from "./browserRecoveryStartup.ts";
import type { BrowserRecoveryStore } from "./browserRecoveryStore.ts";

const ifcppText = JSON.stringify({
  schema: "IFCPP",
  schema_version: 2,
  metadata: { name: "Recovered project" },
});

function store(value: unknown, options?: { readError?: Error }) {
  let clearCount = 0;
  const recoveryStore: BrowserRecoveryStore = {
    read: async () => {
      if (options?.readError) throw options.readError;
      return value;
    },
    write: async () => undefined,
    clear: async () => {
      clearCount += 1;
    },
  };
  return { recoveryStore, clearCount: () => clearCount };
}

describe("browser recovery startup", () => {
  it("restores a valid browser recovery record", async () => {
    const record = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "saved",
      isDirty: true,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });
    const test = store(record);

    const result = await loadBrowserRecovery({ isDesktop: false, store: test.recoveryStore });

    assert.deepEqual(result, { kind: "restored", record });
  });

  it("opens the sample when no recovery record exists", async () => {
    const test = store(null);
    assert.deepEqual(
      await loadBrowserRecovery({ isDesktop: false, store: test.recoveryStore }),
      { kind: "empty" },
    );
  });

  it("clears invalid recovery data and falls back safely", async () => {
    const test = store({ formatVersion: 99 });
    assert.deepEqual(
      await loadBrowserRecovery({ isDesktop: false, store: test.recoveryStore }),
      { kind: "invalid" },
    );
    assert.equal(test.clearCount(), 1);
  });

  it("discards a structurally valid record when the project loader rejects it", async () => {
    const record = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "",
      isDirty: false,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });
    const test = store(record);

    const result = await loadBrowserRecovery({
      isDesktop: false,
      store: test.recoveryStore,
      validateProject: () => {
        throw new Error("Missing project inputs");
      },
    });

    assert.deepEqual(result, { kind: "invalid" });
    assert.equal(test.clearCount(), 1);
  });

  it("reports unavailable storage without throwing", async () => {
    const test = store(null, { readError: new Error("private mode") });
    const result = await loadBrowserRecovery({ isDesktop: false, store: test.recoveryStore });
    assert.equal(result.kind, "unavailable");
  });

  it("does not access IndexedDB in the desktop runtime", async () => {
    let reads = 0;
    const recoveryStore: BrowserRecoveryStore = {
      read: async () => {
        reads += 1;
        return null;
      },
      write: async () => undefined,
      clear: async () => undefined,
    };

    assert.deepEqual(
      await loadBrowserRecovery({ isDesktop: true, store: recoveryStore }),
      { kind: "disabled" },
    );
    assert.equal(reads, 0);
  });
});
