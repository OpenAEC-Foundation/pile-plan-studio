import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_USER_SETTINGS, normalizeUserSettings, patchPileCostDefaults } from "./userSettings.ts";

describe("user settings", () => {
  it("provides stable application defaults", () => {
    assert.deepEqual(DEFAULT_USER_SETTINGS, {
      schemaVersion: 1,
      preferences: {
        language: "auto",
        theme: "light",
        interfaceScalePercent: 100,
        defaultCurrencyCode: "EUR",
        workspaceLayout: {
          explorerVisible: true,
          explorerWidth: 240,
          propertiesVisible: true,
          propertiesWidth: 620,
          inputSourcesExpanded: true,
          pilePlansExpanded: true,
        },
      },
      defaults: { pileCostCatalog: null },
    });
  });

  it("normalizes corrupt and future values field by field", () => {
    assert.deepEqual(normalizeUserSettings({
      schemaVersion: 99,
      preferences: {
        language: "de",
        theme: "forge",
        defaultCurrencyCode: " gbp ",
        interfaceScalePercent: 900,
        workspaceLayout: {
          explorerVisible: false,
          explorerWidth: -20,
          propertiesVisible: "yes",
          propertiesWidth: 4000,
        },
      },
    }), {
      ...DEFAULT_USER_SETTINGS,
      preferences: {
        ...DEFAULT_USER_SETTINGS.preferences,
        theme: "forge",
        defaultCurrencyCode: "GBP",
        interfaceScalePercent: 150,
        workspaceLayout: {
          ...DEFAULT_USER_SETTINGS.preferences.workspaceLayout,
          explorerVisible: false,
          explorerWidth: 180,
          propertiesWidth: 980,
        },
      },
    });
  });

  it("stores and removes a personal pile cost catalog independently of preferences", () => {
    const catalog = {
      schema_version: 2,
      items: [{ pile_size_mm: 350, shape: "square" as const, cost_per_m3: 245 }],
    };
    const withCatalog = patchPileCostDefaults(DEFAULT_USER_SETTINGS, catalog);

    assert.deepEqual(withCatalog.defaults.pileCostCatalog?.items, catalog.items);
    assert.deepEqual(withCatalog.preferences, DEFAULT_USER_SETTINGS.preferences);
    assert.equal(patchPileCostDefaults(withCatalog, null).defaults.pileCostCatalog, null);
  });
});
