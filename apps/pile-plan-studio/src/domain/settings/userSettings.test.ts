import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_USER_SETTINGS, normalizeUserSettings, patchPileCostDefaults, patchUserSettings } from "./userSettings.ts";

describe("user settings", () => {
  it("round-trips column order and visibility without changing other preferences", () => {
    const initial = normalizeUserSettings(undefined);
    const columns = initial.preferences.pileOptionColumns;
    const single = [...columns.single].reverse().map(column => ({ ...column, visible: column.key !== "cost" }));
    const next = patchUserSettings(initial, { pileOptionColumns: { ...columns, single } });
    const restored = normalizeUserSettings(JSON.parse(JSON.stringify(next)));
    assert.deepEqual(restored.preferences.pileOptionColumns.single, single);
    assert.deepEqual(restored.preferences.pileOptionColumns.multiple, columns.multiple);
    assert.deepEqual(restored.preferences.workspaceLayout, initial.preferences.workspaceLayout);
    assert.notDeepEqual(initial.preferences.pileOptionColumns.single, single);
  });

  it("provides stable application defaults", () => {
    assert.deepEqual(DEFAULT_USER_SETTINGS, {
      schemaVersion: 1,
      preferences: {
        language: "auto",
        theme: "light",
        interfaceScalePercent: 100,
        defaultCurrencyCode: "EUR",
        pileOptionColumns: {
          single: ["symbol", "size", "tip", "status", "cost", "use", "governing", "frd"].map(key => ({ key, visible: true })),
          multiple: ["symbol", "size", "tip", "status", "totalCost", "maxUse", "criticalLoadPoint"].map(key => ({ key, visible: true })),
        },
        ilpSections: {
          optimize: true, limits: true, neighbors: false, result: false, saveAs: false, candidates: false, costLimits: false,
        },
        workspaceLayout: {
          explorerVisible: true,
          explorerWidth: 240,
          propertiesVisible: true,
          propertiesWidth: 620,
          propertiesSplitRatio: 0.7,
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
          propertiesSplitRatio: 4,
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
          propertiesSplitRatio: 0.85,
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

  it("restores disclosure choices and defaults missing or invalid sections independently", () => {
    const restored = normalizeUserSettings({ preferences: {
      ilpSections: { optimize: false, result: true, neighbors: "yes", budget: false, unknown: true },
    } });
    assert.deepEqual(restored.preferences.ilpSections, {
      optimize: false, limits: true, neighbors: false, result: true, saveAs: false, candidates: false, costLimits: false,
    });
    assert.deepEqual(normalizeUserSettings(JSON.parse(JSON.stringify(restored))), restored);
    assert.equal(DEFAULT_USER_SETTINGS.preferences.ilpSections.optimize, true);
  });
});
