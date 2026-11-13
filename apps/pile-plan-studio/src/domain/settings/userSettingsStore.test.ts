import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LegendItems, PileCostSettings } from "../../core/projectTypes.ts";
import {
  DEFAULT_USER_SETTINGS, getCostImportDefault, patchCostImportDefault, patchCostProfiles, patchLegendProfiles,
} from "./userSettings.ts";
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
  it("migrates and persists named cost catalogs and their independent import choice", async () => {
    const legacy: PileCostSettings = {
      schema_version: 1, items: [
        { pile_size_mm: 290, shape: "square", cost_per_m3: 545 },
        { pile_size_mm: 350, shape: "round", cost_per_m3: 580 },
      ],
    };
    const store = createMemoryStore({ preferences: { language: "nl" }, defaults: { pileCostCatalog: legacy } });
    const migrated = await loadUserSettings(store);
    assert.deepEqual(migrated.defaults.costProfiles, [{ name: "Standaard", value: legacy }]);
    assert.deepEqual(getCostImportDefault(migrated), legacy);
    const updatedCatalog: PileCostSettings = {
      schema_version: 1, items: [{ pile_size_mm: 290, shape: "round", cost_per_m3: 599 }],
    };
    const two = patchCostProfiles(migrated, { kind: "save", name: "Other rates", value: updatedCatalog })!;
    const updated = patchCostProfiles(two, { kind: "update", name: "Standaard", value: updatedCatalog })!;
    assert.deepEqual(getCostImportDefault(updated)?.items, [updatedCatalog.items[0], legacy.items[1]]);
    assert.deepEqual(updated.defaults.costProfiles[1].value, updatedCatalog);

    const selected = patchCostImportDefault(updated, "Other rates");
    const renamed = patchCostProfiles(selected, { kind: "rename", name: "Other rates", nextName: "Special rates" })!;
    await saveUserSettings(store, renamed);
    const reopened = await loadUserSettings(store);
    assert.equal(reopened.defaults.costImportDefaultName, "Special rates");
    assert.deepEqual(getCostImportDefault(reopened), updatedCatalog);
    const deleted = patchCostProfiles(reopened, { kind: "delete", name: "Special rates" })!;
    assert.equal(getCostImportDefault(deleted), null);
    assert.deepEqual(deleted.defaults.costProfiles.map(({ name }) => name), ["Standaard"]);
  });

  it("persists independently named legend defaults and retains absent styles when updating one", async () => {
    const store = createMemoryStore(null);
    const retainedSize: LegendItems["pileSizes"][number] = {
      value: 350, symbol: { baseShape: "square", fillPattern: "full" },
      color: "#AB2210", colorAutomatic: false, symbolAutomatic: false,
    };
    const appearance: LegendItems = {
      encodingMode: "tip-symbol", pileSizeColorScheme: "cool-warm", pileTipLevelColorScheme: "light-dark",
      pileSizes: [{ value: 300, symbol: { baseShape: "diamond", fillPattern: "left-half" },
        color: "#123456", colorAutomatic: false, symbolAutomatic: true }, retainedSize],
      pileTipLevels: [{ value: -12000, symbol: { baseShape: "square", fillPattern: "full" },
        color: "#ABCDEF", colorAutomatic: false, symbolAutomatic: false }],
    };
    const initial = await loadUserSettings(store);
    assert.deepEqual(initial.defaults.legendProfiles, []);
    const first = patchLegendProfiles(initial, { kind: "save", name: "  Atlas  ", value: appearance })!;
    const other = { ...appearance, encodingMode: "size-color-tip-region" as const };
    await saveUserSettings(store, patchLegendProfiles(first, { kind: "save", name: "Field", value: other })!);
    const reopened = await loadUserSettings(store);
    assert.deepEqual(reopened.defaults.legendProfiles, [{ name: "Atlas", value: appearance }, { name: "Field", value: other }]);
    assert.equal(patchLegendProfiles(reopened, { kind: "save", name: "atlas", value: appearance }), null);

    const newStyle: LegendItems["pileSizes"][number] = { value: 400,
      symbol: { baseShape: "circle", fillPattern: "full" }, color: "#345678",
      colorAutomatic: false, symbolAutomatic: true };
    const updatedStyle = { ...appearance.pileSizes[0], color: "#222222" };
    await saveUserSettings(store, patchLegendProfiles(reopened, { kind: "update", name: "Atlas", value: {
      ...appearance, encodingMode: "size-symbol", pileSizes: [updatedStyle, newStyle], pileTipLevels: [],
    } })!);
    const replaced = await loadUserSettings(store);
    const updated = replaced.defaults.legendProfiles[0].value;
    assert.equal(updated.encodingMode, "size-symbol");
    assert.deepEqual(updated.pileSizes, [updatedStyle, retainedSize, newStyle]);
    assert.deepEqual(updated.pileTipLevels, appearance.pileTipLevels);
    assert.deepEqual(replaced.defaults.legendProfiles[1], { name: "Field", value: other });

    assert.equal(patchLegendProfiles(replaced, { kind: "rename", name: "Atlas", nextName: " field " }), null);
    const renamed = patchLegendProfiles(replaced, { kind: "rename", name: "Atlas", nextName: "Office" })!;
    await saveUserSettings(store, patchLegendProfiles(renamed, { kind: "delete", name: "Field" })!);
    assert.deepEqual((await loadUserSettings(store)).defaults.legendProfiles, [{ name: "Office", value: updated }]);
  });

  it("persists export notation through the shared browser/desktop settings record", async () => {
    const store = createMemoryStore(null);
    await saveUserSettings(store, { ...DEFAULT_USER_SETTINGS, preferences: {
      ...DEFAULT_USER_SETTINGS.preferences, pileSizeExportFormat: "dimensions",
    } });
    assert.equal((await loadUserSettings(store)).preferences.pileSizeExportFormat, "dimensions");
  });
  it("normalizes values read through the platform-independent store", async () => {
    const store: UserSettingsStore = {
      read: async () => ({ preferences: { theme: "openaec", defaultCurrencyCode: "usd" } }),
      write: async () => undefined,
    };

    assert.deepEqual(await loadUserSettings(store), {
      ...DEFAULT_USER_SETTINGS,
      preferences: {
        ...DEFAULT_USER_SETTINGS.preferences,
        theme: "dark",
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
    assert.equal(settings.preferences.theme, "dark");
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
