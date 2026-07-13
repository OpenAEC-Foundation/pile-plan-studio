import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSetting, setSetting } from "./store.ts";

describe("preference store", () => {
  it("uses browser storage when the Tauri store is unavailable", async () => {
    const values = new Map<string, string>();
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    try {
      await setSetting("pile-cost-defaults", { pile_head_level_m: 1.2 });
      assert.deepEqual(
        await getSetting("pile-cost-defaults", { pile_head_level_m: 0 }),
        { pile_head_level_m: 1.2 },
      );
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
    }
  });
});
