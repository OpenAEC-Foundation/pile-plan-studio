import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCptSelectionSettingsPatch,
  beginManualCptSelection,
  cancelManualCptSelection,
  clearManualCptSelection,
  getCptSelectionSettingsAggregate,
  removeManualCpt,
  saveManualCptSelection,
  startManualCptSelectionEdit,
  selectOnlyNearestCpts,
  toggleManualCpt,
} from "./cptSettingsModel.ts";
import type { ProjectState } from "../../domain/projectState.ts";

describe("React CPT settings model", () => {
  it("keeps the manual draft when switching into CPT edit mode", () => {
    const editing = startManualCptSelectionEdit(minimalState({
      rightPanelMode: "cpt-settings",
      selectedCptId: 61,
      selectedLoadPointIds: [1],
      selectedCptsByLoadPointId: new Map([[1, [selectedCpt(cpt(61))]]]),
    }));

    assert.equal(editing.rightPanelMode, "cpts");
    assert.equal(editing.selectedCptId, null);
    assert.deepEqual(editing.cptSelectionEditDraft?.loadPointIds, [1]);
    assert.deepEqual([...editing.cptSelectionEditDraft!.cptIdsByLoadPoint.get(1)!], [61]);
  });

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

  it("captures selected load points with their manual or analyzed CPT selections", () => {
    const editing = beginManualCptSelection(minimalState({
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[1, [61, 62]]]),
      selectedCptsByLoadPointId: new Map([[2, [selectedCpt(cpt(63))]]]),
      selectedLoadPointIds: [1, 2],
    }));

    assert.deepEqual(editing.cptSelectionEditDraft?.loadPointIds, [1, 2]);
    assert.deepEqual(editing.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61, 62]));
    assert.deepEqual(editing.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([63]));
  });

  it("toggles a CPT across every captured target based on complete presence", () => {
    const editing = beginManualCptSelection(minimalState({
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[1, [61, 62]], [2, [62, 63]]]),
      selectedLoadPointIds: [1, 2],
    }));
    const removed = toggleManualCpt(editing, 62);
    const added = toggleManualCpt(editing, 61);

    assert.deepEqual(removed.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61]));
    assert.deepEqual(removed.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([63]));
    assert.deepEqual(added.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61, 62]));
    assert.deepEqual(added.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([61, 62, 63]));
    assert.deepEqual(editing.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([62, 63]));
  });

  it("removes a CPT from every captured target", () => {
    const editing = beginManualCptSelection(minimalState({
      loadPoints: [loadPoint(1), loadPoint(2)],
      manualCptIdsByLoadPoint: new Map([[1, [61, 62]], [2, [62, 63]]]),
      selectedLoadPointIds: [1, 2],
    }));
    const removed = removeManualCpt(editing, 62);

    assert.deepEqual(removed.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61]));
    assert.deepEqual(removed.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([63]));
  });

  it("selects the nearest eligible CPT independently for every captured target", () => {
    const editing = beginManualCptSelection(minimalState({
      cpts: [cpt(61, 1000), cpt(62, 9000)],
      cptSelectionSettingsByLoadPoint: new Map([[2, settings({ maxDistanceM: 2 })]]),
      loadPoints: [loadPoint(1, 0), loadPoint(2, 10000)],
      selectedLoadPointIds: [1, 2],
    }));
    const nearest = selectOnlyNearestCpts(editing);

    assert.deepEqual(nearest.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61]));
    assert.deepEqual(nearest.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set([62]));
  });

  it("uses an empty set when no CPT is within a target's maximum distance", () => {
    const editing = beginManualCptSelection(minimalState({
      cpts: [cpt(61, 1000), cpt(62, 9000)],
      cptSelectionSettingsByLoadPoint: new Map([[2, settings({ maxDistanceM: 0.5 })]]),
      globalCptSelectionSettings: settings({ maxDistanceM: 2 }),
      loadPoints: [loadPoint(1, 0), loadPoint(2, 10000)],
      selectedLoadPointIds: [1, 2],
    }));
    const nearest = selectOnlyNearestCpts(editing);

    assert.deepEqual(nearest.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([61]));
    assert.deepEqual(nearest.cptSelectionEditDraft?.cptIdsByLoadPoint.get(2), new Set());
  });

  it("breaks equal-distance nearest CPT ties by lower CPT id", () => {
    const editing = beginManualCptSelection(minimalState({
      cpts: [cpt(72, 1000), cpt(71, -1000)],
      loadPoints: [loadPoint(1, 0)],
      selectedLoadPointIds: [1],
    }));
    const nearest = selectOnlyNearestCpts(editing);

    assert.deepEqual(nearest.cptSelectionEditDraft?.cptIdsByLoadPoint.get(1), new Set([71]));
  });

  it("saves sorted manual CPT ids for every captured target and reanalyzes only those targets", () => {
    const saved = saveManualCptSelection(minimalState({
      cptSelectionEditDraft: {
        loadPointIds: [2, 1],
        cptIdsByLoadPoint: new Map([[1, new Set([64, 61])], [2, new Set([62])]]),
      },
      manualCptIdsByLoadPoint: new Map([[3, [99]]]),
      selectedLoadPointIds: [3],
    }));

    assert.deepEqual(saved.manualCptIdsByLoadPoint.get(1), [61, 64]);
    assert.deepEqual(saved.manualCptIdsByLoadPoint.get(2), [62]);
    assert.deepEqual(saved.manualCptIdsByLoadPoint.get(3), [99]);
    assert.equal(saved.cptSelectionEditDraft, null);
    assert.deepEqual(saved.analysisRequest.loadPointIds, [2, 1]);
  });

  it("cancels editing without changing persisted manual selections or analysis", () => {
    const editing = minimalState({
      cptSelectionEditDraft: {
        loadPointIds: [1, 2],
        cptIdsByLoadPoint: new Map([[1, new Set([61])], [2, new Set([62])]]),
      },
      manualCptIdsByLoadPoint: new Map([[1, [61]], [2, [63]]]),
    });
    const cancelled = cancelManualCptSelection(editing);

    assert.equal(cancelled.cptSelectionEditDraft, null);
    assert.deepEqual(cancelled.manualCptIdsByLoadPoint, editing.manualCptIdsByLoadPoint);
    assert.equal(cancelled.analysisRequest, editing.analysisRequest);

    const manual = minimalState({
      manualCptIdsByLoadPoint: new Map([[1, [61]], [2, [62]], [3, [63]]]),
      selectedLoadPointId: 1,
      selectedLoadPointIds: [1, 2],
    });
    const cleared = clearManualCptSelection(manual);
    assert.equal(cleared.manualCptIdsByLoadPoint.has(1), false);
    assert.equal(cleared.manualCptIdsByLoadPoint.has(2), false);
    assert.deepEqual(cleared.manualCptIdsByLoadPoint.get(3), [63]);
    assert.deepEqual(cleared.analysisRequest.loadPointIds, [1, 2]);
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

function loadPoint(id: number, x_mm = 0, y_mm = 0) {
  return { id, name: `Load point ${id}`, x_mm, y_mm, design_load_kn: 100 };
}

function cpt(id: number, x_mm = 0, y_mm = 0) {
  return { id, name: `CPT ${id}`, x_mm, y_mm };
}

function selectedCpt(item: ReturnType<typeof cpt>) {
  return { cpt: item, distance_mm: 0, label: "upper left" as const };
}

function settings(overrides: Partial<ProjectState["globalCptSelectionSettings"]> = {}) {
  return { algorithm: "quadrants" as const, maxDistanceM: 25, monopolyDistanceM: 1, maxAngleDegrees: 120, ...overrides };
}
