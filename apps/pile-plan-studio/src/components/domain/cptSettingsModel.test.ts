import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCptSelectionSettingsPatch,
  beginManualCptSelection,
  cancelManualCptSelection,
  clearManualCptSelection,
  getCptSelectionSettingsAggregate,
  saveManualCptSelection,
  toggleManualCpt,
} from "./cptSettingsModel.ts";
import type { ProjectState } from "../../domain/projectState.ts";

describe("React CPT settings model", () => {
  it("patches every load point and requests all analysis when scope is all", () => {
    const state = minimalState({
      cptSelectionSettingsByLoadPoint: new Map([[2, settings({ maxDistanceM: 18, maxAngleDegrees: 100 })]]),
      loadPoints: [loadPoint(1), loadPoint(2), loadPoint(3)],
      selectedLoadPointIds: [1, 2],
    });
    const next = applyCptSelectionSettingsPatch(state, { algorithm: "maximum-angle" });

    assert.equal(next.globalCptSelectionSettings.algorithm, "maximum-angle");
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(2)?.algorithm, "maximum-angle");
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(2)?.maxDistanceM, 18);
    assert.equal(next.cptSelectionSettingsByLoadPoint.has(1), false);
    assert.equal(next.analysisRequest.revision, 1);
    assert.equal(next.analysisRequest.loadPointIds, null);
  });

  it("preserves inherited settings for a manual load point during an all-scope patch", () => {
    const oldGlobalSettings = settings({
      algorithm: "maximum-angle",
      maxDistanceM: 25,
      monopolyDistanceM: 2,
      maxAngleDegrees: 100,
    });
    const state = minimalState({
      globalCptSelectionSettings: oldGlobalSettings,
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[1, [61]]]),
      selectedLoadPointIds: [1, 2],
    });
    const next = applyCptSelectionSettingsPatch(state, { maxDistanceM: 30 });

    assert.deepEqual(next.cptSelectionSettingsByLoadPoint.get(1), oldGlobalSettings);
    assert.deepEqual(
      next.cptSelectionSettingsByLoadPoint.get(2) ?? next.globalCptSelectionSettings,
      settings({ algorithm: "maximum-angle", maxDistanceM: 30, monopolyDistanceM: 2, maxAngleDegrees: 100 }),
    );
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(1), [61]);
  });

  it("patches exactly selected load points and requests their analysis", () => {
    const state = minimalState({
      cptSettingsScope: "selected",
      loadPoints: [loadPoint(1), loadPoint(2), loadPoint(3)],
      selectedLoadPointIds: [1, 3],
    });
    const next = applyCptSelectionSettingsPatch(state, { maxDistanceM: 18 });

    assert.equal(next.cptSelectionSettingsByLoadPoint.get(1)?.maxDistanceM, 18);
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(3)?.maxDistanceM, 18);
    assert.equal(next.cptSelectionSettingsByLoadPoint.has(2), false);
    assert.deepEqual(next.analysisRequest.loadPointIds, [1, 3]);
  });

  it("falls back to all load points when selected scope has no selection", () => {
    const state = minimalState({
      cptSettingsScope: "selected",
      selectedLoadPointId: null,
      selectedLoadPointIds: [],
    });
    const next = applyCptSelectionSettingsPatch(state, { maxDistanceM: 18 });

    assert.equal(next.cptSettingsScope, "all");
    assert.equal(next.globalCptSelectionSettings.maxDistanceM, 18);
    assert.equal(next.analysisRequest.loadPointIds, null);
  });

  it("aggregates common settings and reports mixed fields as null", () => {
    const state = minimalState({
      cptSelectionSettingsByLoadPoint: new Map([
        [1, settings({ maxDistanceM: 18 })],
        [2, settings({ maxDistanceM: 30, maxAngleDegrees: 100 })],
      ]),
      loadPoints: [loadPoint(1), loadPoint(2)],
      selectedLoadPointIds: [1, 2],
    });

    assert.deepEqual(getCptSelectionSettingsAggregate(state), {
      algorithm: "quadrants",
      maxDistanceM: null,
      monopolyDistanceM: 1,
      maxAngleDegrees: null,
    });
  });

  it("preserves untouched mixed settings while applying a field-level patch", () => {
    const state = minimalState({
      cptSelectionSettingsByLoadPoint: new Map([
        [1, settings({ maxDistanceM: 18, maxAngleDegrees: 90 })],
        [2, settings({ maxDistanceM: 30, maxAngleDegrees: 140 })],
      ]),
      cptSettingsScope: "selected",
      loadPoints: [loadPoint(1), loadPoint(2)],
      selectedLoadPointIds: [1, 2],
    });
    const next = applyCptSelectionSettingsPatch(state, { algorithm: "maximum-angle" });

    assert.deepEqual(next.cptSelectionSettingsByLoadPoint.get(1), settings({ algorithm: "maximum-angle", maxDistanceM: 18, maxAngleDegrees: 90 }));
    assert.deepEqual(next.cptSelectionSettingsByLoadPoint.get(2), settings({ algorithm: "maximum-angle", maxDistanceM: 30, maxAngleDegrees: 140 }));
  });

  it("keeps manual selections and their settings untouched unless overwrite is explicit", () => {
    const state = minimalState({
      cptSelectionSettingsByLoadPoint: new Map([[2, settings({ maxDistanceM: 18 })]]),
      cptSettingsScope: "selected",
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[2, [61]]]),
      selectedLoadPointIds: [1, 2],
    });
    const next = applyCptSelectionSettingsPatch(state, { maxDistanceM: 30 });

    assert.equal(next.cptSelectionSettingsByLoadPoint.get(1)?.maxDistanceM, 30);
    assert.equal(next.cptSelectionSettingsByLoadPoint.get(2)?.maxDistanceM, 18);
    assert.deepEqual(next.manualCptIdsByLoadPoint.get(2), [61]);
    assert.deepEqual(next.analysisRequest.loadPointIds, [1, 2]);
  });

  it("removes manual selections for targets and reanalyzes them when overwrite is explicit", () => {
    const state = minimalState({
      cptSelectionSettingsByLoadPoint: new Map([[2, settings({ maxDistanceM: 18 })]]),
      cptSettingsScope: "selected",
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[2, [61]]]),
      selectedLoadPointIds: [1, 2],
    });
    const next = applyCptSelectionSettingsPatch(state, { maxDistanceM: 30 }, true);

    assert.equal(next.cptSelectionSettingsByLoadPoint.get(2)?.maxDistanceM, 30);
    assert.equal(next.manualCptIdsByLoadPoint.has(2), false);
    assert.deepEqual(next.analysisRequest.loadPointIds, [1, 2]);
  });

  it("edits, toggles, and saves a manual CPT selection for one load point", () => {
    const editing = beginManualCptSelection(minimalState(), [61, 62]);
    const toggled = toggleManualCpt(toggleManualCpt(editing, 62), 64);
    const saved = saveManualCptSelection(toggled);

    assert.deepEqual(saved.manualCptIdsByLoadPoint.get(1), [61, 64]);
    assert.equal(saved.cptSelectionEditDraft, null);
    assert.deepEqual(saved.analysisRequest.loadPointIds, [1]);
  });

  it("can cancel editing or return a load point to algorithmic selection", () => {
    const editing = beginManualCptSelection(minimalState(), [61]);
    assert.equal(cancelManualCptSelection(editing).cptSelectionEditDraft, null);

    const manual = minimalState({ manualCptIdsByLoadPoint: new Map([[1, [61]]]) });
    const cleared = clearManualCptSelection(manual);
    assert.equal(cleared.manualCptIdsByLoadPoint.has(1), false);
    assert.deepEqual(cleared.analysisRequest.loadPointIds, [1]);
  });
});

function minimalState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    activePileSizes: [],
    activePileTipLevels: [],
    analysisError: null,
    analysisRequest: { revision: 0, loadPointIds: null },
    defaultPileSelectionPending: false,
    bearingCapacities: [],
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    cptFrdRowsByCptId: new Map(),
    cptSelectionEditDraft: null,
    cptSelectionSettingsByLoadPoint: new Map(),
    cptSettingsScope: "all",
    cpts: [],
    globalCptSelectionSettings: { algorithm: "quadrants", maxDistanceM: 25, monopolyDistanceM: 1, maxAngleDegrees: 120 },
    inputSources: [],
    legendSelectionFilter: { pileSizes: [], pileTipLevels: [] },
    loadPoints: [{ id: 1, name: "Load point 1", x_mm: 0, y_mm: 0, design_load_kn: 100 }],
    manualCptIdsByLoadPoint: new Map(),
    name: "Test",
    optimizationSettings: {
      baseline_pile_configurations: [], baseline_pile_sizes: [], baseline_pile_tip_levels: [],
      enabled_pile_sizes: [], enabled_pile_tip_levels: [], max_pile_configurations: 0,
      max_pile_sizes: 0, max_pile_tip_levels: 0,
    },
    pileCostByOptionKey: new Map(),
    pileCostSettings: { schema_version: 1, pile_head_level_m: 0, items: [] },
    pileOptionFilters: { cost: [], frd: [], governing: [], size: [], status: [], symbol: [], tip: [], use: [] },
    pileOptionSort: null,
    pileOptionsByLoadPointId: new Map(),
    rightPanelMode: "cpt-settings",
    selectedCptId: null,
    selectedCptsByLoadPointId: new Map(),
    selectedLoadPointId: 1,
    selectedLoadPointIds: [1],
    selectedPileOptionKeysByLoadPoint: new Map(),
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}

function loadPoint(id: number) {
  return { id, name: `Load point ${id}`, x_mm: 0, y_mm: 0, design_load_kn: 100 };
}

function settings(overrides: Partial<ProjectState["globalCptSelectionSettings"]> = {}) {
  return { algorithm: "quadrants" as const, maxDistanceM: 25, monopolyDistanceM: 1, maxAngleDegrees: 120, ...overrides };
}
