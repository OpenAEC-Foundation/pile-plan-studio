import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_USER_SETTINGS } from "./userSettings.ts";
import {
  createPlatformUserSettingsStore,
  loadUserSettings,
  saveUserSettings,
  type UserSettingsStore,
} from "./userSettingsStore.ts";

function createMemoryStore(initial: unknown): UserSettingsStore {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => { value = next; },
  };
}

describe("user settings store", () => {
  it("normalizes values read through the platform-independent store", async () => {
    const store: UserSettingsStore = {
      read: async () => ({ preferences: { theme: "openaec", defaultCurrencyCode: "usd" } }),
      write: async () => undefined,
    };

    assert.deepEqual(await loadUserSettings(store), {
      ...DEFAULT_USER_SETTINGS,
      preferences: {
        ...DEFAULT_USER_SETTINGS.preferences,
        theme: "openaec",
        defaultCurrencyCode: "USD",
      },
    });
  });

  it("writes a normalized complete record", async () => {
    const writes: unknown[] = [];
    const store: UserSettingsStore = {
      read: async () => null,
      write: async (value) => { writes.push(value); },
    };

    await saveUserSettings(store, {
      ...DEFAULT_USER_SETTINGS,
      preferences: { ...DEFAULT_USER_SETTINGS.preferences, defaultCurrencyCode: " chf " },
    });

    assert.deepEqual(writes, [{
      ...DEFAULT_USER_SETTINGS,
      preferences: { ...DEFAULT_USER_SETTINGS.preferences, defaultCurrencyCode: "CHF" },
    }]);
  });

  it("selects the desktop adapter without touching IndexedDB", async () => {
    let desktopLoads = 0;
    const desktopStore: UserSettingsStore = { read: async () => null, write: async () => undefined };
    const selected = await createPlatformUserSettingsStore({
      isTauri: true,
      loadDesktopStore: async () => { desktopLoads += 1; return desktopStore; },
    });

    assert.equal(selected, desktopStore);
    assert.equal(desktopLoads, 1);
  });

  it("migrates legacy application preferences only when no unified record exists", async () => {
    const values = new Map<string, unknown>([
      ["language", "nl"],
      ["theme", "forge"],
      ["interface-scale-percent", 80],
    ]);
    const emptyStore = createMemoryStore(null);

    const settings = await loadUserSettings(
      emptyStore,
      async (key, fallback) => values.get(key) ?? fallback,
    );

    assert.equal(settings.preferences.language, "nl");
    assert.equal(settings.preferences.theme, "forge");
    assert.equal(settings.preferences.interfaceScalePercent, 80);

    const stored = createMemoryStore({
      schemaVersion: 1,
      preferences: { language: "en", theme: "light", interfaceScalePercent: 110 },
    });
    const existing = await loadUserSettings(
      stored,
      async () => "legacy-value",
    );
    assert.equal(existing.preferences.language, "en");
    assert.equal(existing.preferences.theme, "light");
    assert.equal(existing.preferences.interfaceScalePercent, 110);
  });
});
