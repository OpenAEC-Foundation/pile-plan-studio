import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_USER_SETTINGS, normalizeUserSettings, patchCostProfiles, patchUserSettings, patchWorkspaceLayout } from "./userSettings.ts";

describe("user settings", () => {
  it("defaults to the start screen and preserves the explicit reopen preference", () => {
    assert.equal(normalizeUserSettings(null).preferences.openLastProjectOnStartup, false);
    assert.equal(normalizeUserSettings({ preferences: { openLastProjectOnStartup: "true" } }).preferences.openLastProjectOnStartup, false);
    const enabled = patchUserSettings(DEFAULT_USER_SETTINGS, { openLastProjectOnStartup: true });
    assert.equal(normalizeUserSettings(JSON.parse(JSON.stringify(enabled))).preferences.openLastProjectOnStartup, true);
  });
  it("remembers the plan background independently of the theme", () => {
    for (const workspaceAppearance of ["theme", "light", "dark"]) {
      const settings = normalizeUserSettings({ preferences: { theme: "dark", workspaceAppearance } });
      assert.equal(settings.preferences.workspaceAppearance, workspaceAppearance);
      assert.equal(normalizeUserSettings(JSON.parse(JSON.stringify(settings))).preferences.workspaceAppearance, workspaceAppearance);
    }
    for (const value of [undefined, null, "unknown", 42]) {
      assert.equal(normalizeUserSettings({ preferences: { workspaceAppearance: value } }).preferences.workspaceAppearance, "theme");
    }
  });
  it("migrates legacy themes and preserves current Blueprint themes without changing other preferences", () => {
    for (const [saved, expected] of [
      ["forge", "dark"], ["openaec", "dark"], ["contrast", "high-contrast-dark"],
      ["light", "light"], ["dark", "dark"], ["blueprint", "blueprint"],
      ["high-contrast-dark", "high-contrast-dark"], ["high-contrast-light", "high-contrast-light"],
      ["unknown", "light"], ["", "light"], [null, "light"],
    ]) {
      const result = normalizeUserSettings({ preferences: { theme: saved, interfaceScalePercent: 120 } });
      assert.equal(result.preferences.theme, expected, String(saved));
      assert.equal(result.preferences.interfaceScalePercent, 120);
      assert.deepEqual(result.defaults, DEFAULT_USER_SETTINGS.defaults);
    }
  });
  it("remembers export notation independently and normalizes missing or invalid preferences", () => {
    for (const format of ["numeric", "dimensions"] as const) {
      const saved = patchUserSettings(DEFAULT_USER_SETTINGS, { pileSizeExportFormat: format });
      assert.equal(normalizeUserSettings(JSON.parse(JSON.stringify(saved))).preferences.pileSizeExportFormat, format);
      assert.equal(DEFAULT_USER_SETTINGS.preferences.pileSizeExportFormat, "numeric");
      assert.deepEqual(saved.defaults, DEFAULT_USER_SETTINGS.defaults);
    }
    for (const value of [undefined, null, "290x290", "other", 42]) {
      assert.equal(normalizeUserSettings({ preferences: { pileSizeExportFormat: value } }).preferences.pileSizeExportFormat, "numeric");
    }
  });
  it("defaults to four expanded selection rows and preserves resized/collapsed layout separately from project content", () => {
    assert.equal(normalizeUserSettings(undefined).preferences.workspaceLayout.selectionOverviewRows, 4);
    const saved = patchWorkspaceLayout(DEFAULT_USER_SETTINGS, { selectionOverviewRows: 7, selectionOverviewCollapsed: true });
    const restored = normalizeUserSettings(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.preferences.workspaceLayout.selectionOverviewRows, 7);
    assert.equal(restored.preferences.workspaceLayout.selectionOverviewCollapsed, true);
    assert.equal(DEFAULT_USER_SETTINGS.preferences.workspaceLayout.selectionOverviewRows, 4);
    assert.equal(DEFAULT_USER_SETTINGS.preferences.workspaceLayout.selectionOverviewCollapsed, false);
  });
  it("keeps a personal optimizer duration and normalizes invalid limits", () => {
    assert.equal(DEFAULT_USER_SETTINGS.preferences.optimizationTimeLimitSeconds, 600);
    for (const value of [null, 1800]) {
      const saved = patchUserSettings(DEFAULT_USER_SETTINGS, { optimizationTimeLimitSeconds: value });
      assert.equal(normalizeUserSettings(JSON.parse(JSON.stringify(saved))).preferences.optimizationTimeLimitSeconds, value);
    }
    for (const value of [0, 7201, 1.5, "600"]) {
      assert.equal(normalizeUserSettings({ preferences: { optimizationTimeLimitSeconds: value } }).preferences.optimizationTimeLimitSeconds, 600);
    }
  });
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
        workspaceAppearance: "theme",
        interfaceScalePercent: 100,
        defaultCurrencyCode: "EUR",
        openLastProjectOnStartup: false,
        optimizationTimeLimitSeconds: 600,
        pileSizeExportFormat: "numeric",
        pilePlanExportOptions: {
          mark:{enabled:false,start:1,rule:{axis:"y",x_direction:"ascending",y_direction:"descending",tolerance_mm:1}},
          tip_code:{enabled:false,sequence:"letters",direction:"descending"},
        },
        pileOptionColumns: {
          single: [
            ...["symbol", "size", "tip", "status", "cost", "use", "governing", "frd"].map(key => ({ key, visible: true })),
            { key: "fed", visible: false },
          ],
          multiple: [
            ...["symbol", "size", "tip", "status", "totalCost", "maxUse", "criticalLoadPoint"].map(key => ({ key, visible: true })),
            ...["frd", "governing", "fed"].map(key => ({ key, visible: false })),
          ],
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
          selectionOverviewRows: 4,
          selectionOverviewCollapsed: false,
          inputSourcesExpanded: true,
          pilePlansExpanded: true,
        },
      },
      defaults: { costProfiles: [], costImportDefaultName: null, legendProfiles: [] },
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
        theme: "dark",
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
    const withCatalog = patchCostProfiles(DEFAULT_USER_SETTINGS, { kind: "save", name: "Standard rates", value: catalog })!;

    assert.deepEqual(withCatalog.defaults.costProfiles[0].value.items, catalog.items);
    assert.equal(withCatalog.defaults.costImportDefaultName, "Standard rates");
    assert.deepEqual(withCatalog.preferences, DEFAULT_USER_SETTINGS.preferences);
    assert.deepEqual(patchCostProfiles(withCatalog, { kind: "delete", name: "Standard rates" })?.defaults.costProfiles, []);
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
