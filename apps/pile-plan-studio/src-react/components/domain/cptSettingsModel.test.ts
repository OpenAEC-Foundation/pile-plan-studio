import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCptSelectionSettings,
  beginManualCptSelection,
  cancelManualCptSelection,
  clearManualCptSelection,
  getActiveCptSelectionSettings,
  saveManualCptSelection,
  toggleManualCpt,
} from "./cptSettingsModel.ts";
import type { ProjectState } from "../../domain/projectState.ts";

describe("React CPT settings model", () => {
  it("applies global settings to all load points", () => {
    const state = minimalState();
    const next = applyCptSelectionSettings(state, {
      algorithm: "maximum-angle",
      maxDistanceM: 30,
      maxAngleDegrees: 100,
    });

    assert.equal(next.globalCptSelectionSettings.algorithm, "maximum-angle");
    assert.equal(next.analysisRequest.revision, 1);
    assert.equal(next.analysisRequest.loadPointIds, null);
  });

  it("applies local settings only to the current load point", () => {
    const state = minimalState({ cptSettingsScope: "current" });
    const next = applyCptSelectionSettings(state, {
      algorithm: "quadrants",
      maxDistanceM: 18,
      maxAngleDegrees: 120,
    });

    assert.equal(next.cptSelectionSettingsByLoadPoint.get(1)?.maxDistanceM, 18);
    assert.deepEqual(next.analysisRequest.loadPointIds, [1]);
    assert.equal(getActiveCptSelectionSettings(next).maxDistanceM, 18);
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
    bearingCapacities: [],
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    cptFrdRowsByCptId: new Map(),
    cptSelectionEditDraft: null,
    cptSelectionSettingsByLoadPoint: new Map(),
    cptSettingsScope: "all",
    cpts: [],
    globalCptSelectionSettings: { algorithm: "quadrants", maxDistanceM: 25, maxAngleDegrees: 120 },
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
