import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLoadPointPanelTitle,
  getCptFrdPanelModel,
  getChosenPileOptionKeyForSelection,
  getRenderablePileOptionRows,
  getSelectedCptOverviewModel,
  getSelectedLoadPoints,
  optionKey,
} from "./rightPanelModel.ts";
import type { ProjectState } from "../../domain/projectState.ts";

describe("React right panel model", () => {
  it("returns selected load points in project order", () => {
    const state = minimalState({
      selectedLoadPointIds: [2, 1],
    });

    assert.deepEqual(getSelectedLoadPoints(state).map((loadPoint) => loadPoint.id), [1, 2]);
  });

  it("builds renderable pile option rows with status, governing CPT, and cost", () => {
    const state = minimalState({
      pileCostByOptionKey: new Map([["290|-17.5", 1234]]),
    });

    const rows = getRenderablePileOptionRows({
      cpts: state.cpts,
      costsByOptionKey: state.pileCostByOptionKey,
      options: [
        {
          pile_size_mm: 290,
          pile_tip_level_m: -17.5,
          isOption: true,
          governing_cpt_id: 64,
          governing_frd_kn: 900,
          utilization: 0.75,
          missing_cpt_ids: [],
        },
      ],
      selectedLoadPointCount: 1,
      legend: {
        pileSizes: [{ value: 290, shape: "circle" }],
        pileTipLevels: [{ value: -17.5, color: "#4e79a7" }],
      },
    });

    assert.equal(rows[0].key, "290|-17.5");
    assert.equal(rows[0].statusLabel, "OK");
    assert.equal(rows[0].governingLabel, "CPT 64");
    assert.equal(rows[0].governingCptId, 64);
    assert.equal(rows[0].costLabel, "€1,234");
    assert.equal(rows[0].useLabel, "75%");
    assert.equal(rows[0].frdLabel, "900 kN");
  });

  it("shows the governing CPT id when an imported CPT has no name", () => {
    const rows = getRenderablePileOptionRows({
      cpts: [{ id: 64, name: "", x_mm: 0, y_mm: 0 }],
      costsByOptionKey: new Map(),
      options: [{
        pile_size_mm: 290,
        pile_tip_level_m: -17.5,
        isOption: true,
        governing_cpt_id: 64,
        governing_frd_kn: 900,
        utilization: 0.75,
        missing_cpt_ids: [],
      }],
      selectedLoadPointCount: 1,
      legend: {
        pileSizes: [{ value: 290, shape: "circle" }],
        pileTipLevels: [{ value: -17.5, color: "#4e79a7" }],
      },
    });

    assert.equal(rows[0].governingLabel, "CPT 64");
    assert.equal(rows[0].governingCptId, 64);
  });

  it("uses a shared chosen option key only when all selected load points match", () => {
    const state = minimalState({
      selectedLoadPointIds: [1, 2],
      selectedPileOptionKeysByLoadPoint: new Map([
        [1, "290|-17.5"],
        [2, "290|-17.5"],
      ]),
    });

    assert.equal(getChosenPileOptionKeyForSelection(state, getSelectedLoadPoints(state)), "290|-17.5");

    const mixed = minimalState({
      selectedLoadPointIds: [1, 2],
      selectedPileOptionKeysByLoadPoint: new Map([
        [1, "290|-17.5"],
        [2, "320|-18"],
      ]),
    });

    assert.equal(getChosenPileOptionKeyForSelection(mixed, getSelectedLoadPoints(mixed)), "");
  });

  it("builds stable pile option keys", () => {
    assert.equal(optionKey({ pile_size_mm: 350, pile_tip_level_m: -20.3 }), "350|-20.3");
  });

  it("does not duplicate the load point prefix in panel titles", () => {
    assert.equal(formatLoadPointPanelTitle("Load point 15"), "Load point 15");
    assert.equal(formatLoadPointPanelTitle("15"), "Load point 15");
  });

  it("builds a selected CPT overview for one load point with FRD ranges", () => {
    const state = minimalState({
      cptFrdRowsByCptId: new Map([
        [64, [
          { pile_size_mm: 290, pile_tip_level_m: -17.5, frd_kn: 693 },
          { pile_size_mm: 320, pile_tip_level_m: -18, frd_kn: 911 },
        ]],
      ]),
      selectedCptsByLoadPointId: new Map([
        [1, [{
          cpt: { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 },
          distance_mm: 12340,
          label: "upper left",
        }]],
      ]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.columns, ["Selection", "CPT", "Distance", "FRD range"]);
    assert.deepEqual(model.rows[0].values, ["upper left", "CPT 64", "12.3 m", "693-911 kN"]);
  });

  it("builds the union of CPTs for multiple selected load points", () => {
    const cpt64 = { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 };
    const state = minimalState({
      selectedLoadPointIds: [1, 2],
      selectedCptsByLoadPointId: new Map([
        [1, [{ cpt: cpt64, distance_mm: 1000, label: "upper left" }]],
        [2, [{ cpt: cpt64, distance_mm: 2000, label: "lower right" }]],
      ]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.columns, ["CPT", "Used by", "Load points", "FRD range"]);
    assert.equal(model.rows.length, 1);
    assert.deepEqual(model.rows[0].values.slice(0, 3), ["CPT 64", "2 / 2 load points", "1, 2"]);
  });

  it("builds the FRD table for one selected CPT", () => {
    const state = minimalState({
      cptFrdRowsByCptId: new Map([
        [64, [{ pile_size_mm: 290, pile_tip_level_m: -17.5, frd_kn: 693 }]],
      ]),
      selectedCptId: 64,
    });

    const model = getCptFrdPanelModel(state);

    assert.equal(model?.cpt.name, "CPT 64");
    assert.deepEqual(model?.rows[0], {
      frdLabel: "693 kN",
      sizeLabel: "290 mm",
      tipLabel: "-17.5 m",
    });
  });
});

function minimalState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    activePileSizes: [290, 320],
    activePileTipLevels: [-17.5, -18],
    analysisError: null,
    analysisRequest: { revision: 0, loadPointIds: null },
    defaultPileSelectionPending: false,
    bearingCapacities: [],
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    cptSelectionSettingsByLoadPoint: new Map(),
    cptFrdRowsByCptId: new Map(),
    cpts: [{ id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 }],
    globalCptSelectionSettings: { algorithm: "quadrants", maxDistanceM: 25, monopolyDistanceM: 1, maxAngleDegrees: 120 },
    inputSources: [],
    legendSelectionFilter: { pileSizes: [], pileTipLevels: [] },
    loadPoints: [
      { id: 1, name: "Load point 1", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      { id: 2, name: "Load point 2", x_mm: 1, y_mm: 1, design_load_kn: 200 },
    ],
    manualCptIdsByLoadPoint: new Map(),
    name: "Test",
    optimizationSettings: {
      baseline_pile_configurations: [],
      baseline_pile_sizes: [],
      baseline_pile_tip_levels: [],
      enabled_pile_sizes: [290, 320],
      enabled_pile_tip_levels: [-17.5, -18],
      max_pile_configurations: 4,
      max_pile_sizes: 2,
      max_pile_tip_levels: 2,
    },
    pileCostByOptionKey: new Map(),
    pileCostSettings: { schema_version: 1, pile_head_level_m: 0, items: [] },
    pileOptionFilters: {
      cost: [],
      frd: [],
      governing: [],
      size: [],
      status: [],
      symbol: [],
      tip: [],
      use: [],
    },
    pileOptionSort: null,
    pileOptionsByLoadPointId: new Map(),
    rightPanelMode: "load-point",
    selectedCptId: null,
    selectedCptsByLoadPointId: new Map(),
    selectedLoadPointId: 1,
    selectedLoadPointIds: [1],
    selectedPileOptionKeysByLoadPoint: new Map(),
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}
