import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLoadPointPanelTitle,
  getCptFrdPanelModel,
  getChosenPileOptionKeyForSelection,
  getPileOptionsForSelectedLoadPoints,
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
      pileCostByOptionKey: new Map([["290|-17500", 1234]]),
    });

    const rows = getRenderablePileOptionRows({
      cpts: state.cpts,
      costsByOptionKey: state.pileCostByOptionKey,
      currencyCode: "GBP",
      options: [
        {
          configuration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
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
        encodingMode: "tip-symbol",
        pileSizes: [{
          value: 290,
          symbol: { baseShape: "circle", fillPattern: "full" },
          color: "#123456",
        }],
        pileTipLevels: [{
          value: -17.5,
          symbol: { baseShape: "rectangle-horizontal", fillPattern: "top-half" },
          color: "#4E79A7",
        }],
      },
    });

    assert.equal(rows[0].key, "290|-17500");
    assert.equal(rows[0].statusLabel, "OK");
    assert.equal(rows[0].governingLabel, "CPT 64");
    assert.equal(rows[0].governingCptId, 64);
    assert.equal(rows[0].costLabel, "£1,234");
    assert.equal(rows[0].useLabel, "75%");
    assert.equal(rows[0].frdLabel, "900 kN");
    assert.match(rows[0].symbolHtml, /<rect x="3" y="7" width="18" height="10"/);
    assert.match(rows[0].symbolHtml, /fill="#123456"/);
  });

  it("shows the governing CPT id when an imported CPT has no name", () => {
    const rows = getRenderablePileOptionRows({
      cpts: [{ id: 64, name: "", x_mm: 0, y_mm: 0 }],
      costsByOptionKey: new Map(),
      options: [{
        configuration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
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
        encodingMode: "size-symbol",
        pileSizes: [{
          value: 290,
          symbol: { baseShape: "circle", fillPattern: "full" },
          color: "#123456",
        }],
        pileTipLevels: [{
          value: -17.5,
          symbol: { baseShape: "square", fillPattern: "full" },
          color: "#4E79A7",
        }],
      },
    });

    assert.equal(rows[0].governingLabel, "CPT 64");
    assert.equal(rows[0].governingCptId, 64);
  });

  it("uses a shared chosen option key only when all selected load points match", () => {
    const state = minimalState({
      selectedLoadPointIds: [1, 2],
      selectedPileConfigurationsByLoadPoint: new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
        [2, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
      ]),
    });

    assert.equal(getChosenPileOptionKeyForSelection(state, getSelectedLoadPoints(state)), "290|-17500");

    const mixed = minimalState({
      selectedLoadPointIds: [1, 2],
      selectedPileConfigurationsByLoadPoint: new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
        [2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
      ]),
    });

    assert.equal(getChosenPileOptionKeyForSelection(mixed, getSelectedLoadPoints(mixed)), "");
  });

  it("builds stable pile option keys", () => {
    assert.equal(optionKey({
      configuration: { pile_size_mm: 350, pile_tip_level_mm: -20_300 },
    }), "350|-20300");
  });

  it("does not duplicate the load point prefix in panel titles", () => {
    assert.equal(formatLoadPointPanelTitle("Load point 15"), "Load point 15");
    assert.equal(formatLoadPointPanelTitle("15"), "Load point 15");
  });

  it("shows the CPT capacity for the pile assigned to one load point", () => {
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
      selectedPileOptionKeysByLoadPoint: new Map([[1, "290|-17.5"]]),
      pileOptionsByLoadPointId: new Map([[1, [{
        pile_size_mm: 290,
        pile_tip_level_m: -17.5,
        isOption: true,
        governing_cpt_id: 64,
        governing_frd_kn: 693,
        utilization: 0.75,
        missing_cpt_ids: [],
      }]]]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.columns, ["Selection", "CPT", "Distance", "Chosen pile FRD"]);
    assert.deepEqual(model.rows[0].values, ["upper left", "CPT 64", "12.3 m", "693 kN"]);
    assert.equal(model.rows[0].governingLoadPointCount, 1);
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

    assert.deepEqual(model.columns, ["CPT", "Used by", "Governing for"]);
    assert.equal(model.rows.length, 1);
    assert.deepEqual(model.rows[0].values, ["CPT 64", "2 / 2 load points", "0 / 2 load points"]);
    assert.equal(model.rows[0].usageDetails, "1, 2");
  });

  it("counts governing CPTs when selected load points have different assigned piles", () => {
    const cpt64 = { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 };
    const cpt65 = { id: 65, name: "CPT 65", x_mm: 10, y_mm: 10 };
    const state = minimalState({
      cpts: [cpt64, cpt65],
      selectedLoadPointIds: [1, 2],
      selectedCptsByLoadPointId: new Map([
        [1, [{ cpt: cpt64, distance_mm: 1000, label: "upper left" }]],
        [2, [{ cpt: cpt64, distance_mm: 2000, label: "lower right" }, { cpt: cpt65, distance_mm: 3000, label: "upper right" }]],
      ]),
      selectedPileOptionKeysByLoadPoint: new Map([[1, "290|-17.5"], [2, "320|-18"]]),
      pileOptionsByLoadPointId: new Map([
        [1, [{ pile_size_mm: 290, pile_tip_level_m: -17.5, isOption: true, governing_cpt_id: 64, governing_frd_kn: 693, utilization: 0.8, missing_cpt_ids: [] }]],
        [2, [{ pile_size_mm: 320, pile_tip_level_m: -18, isOption: true, governing_cpt_id: 65, governing_frd_kn: 800, utilization: 0.7, missing_cpt_ids: [] }]],
      ]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.equal(model.columns[2], "Governing for");
    assert.deepEqual(model.rows.map((row) => [row.cpt.id, row.values[2], row.governingLoadPointCount]), [
      [64, "1 / 2 load points", 1],
      [65, "1 / 2 load points", 1],
    ]);
  });

  it("uses a ready CPT draft preview for pile feasibility", () => {
    const savedOption = { pile_size_mm: 290, pile_tip_level_m: -17.5, isOption: true, governing_cpt_id: 64, governing_frd_kn: 900, utilization: 0.5, missing_cpt_ids: [] };
    const previewOption = { ...savedOption, governing_cpt_id: 65, governing_frd_kn: 600, utilization: 0.75 };
    const draft = {
      loadPointIds: [1],
      cptIdsByLoadPoint: new Map([[1, new Set([65])]]),
    };
    const state = minimalState({
      cptSelectionEditDraft: draft,
      pileOptionsByLoadPointId: new Map([[1, [savedOption]]]),
    }) as ProjectState & { cptSelectionPreview: unknown };
    state.cptSelectionPreview = {
      draft,
      status: "ready",
      pileOptionsByLoadPointId: new Map([[1, [previewOption]]]),
      selectedCptsByLoadPointId: new Map(),
    };

    const options = getPileOptionsForSelectedLoadPoints(state, getSelectedLoadPoints(state));

    assert.equal(options[0].governing_cpt_id, 65);
    assert.equal(options[0].utilization, 0.75);
  });

  it("builds the CPT overview from a manual draft with all-or-some usage", () => {
    const cpt64 = { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 };
    const cpt65 = { id: 65, name: "CPT 65", x_mm: 10, y_mm: 10 };
    const state = minimalState({
      cpts: [cpt64, cpt65],
      cptSelectionEditDraft: {
        loadPointIds: [1, 2],
        cptIdsByLoadPoint: new Map([
          [1, new Set([64, 65])],
          [2, new Set([64])],
        ]),
      },
      selectedCptId: null,
      selectedCptsByLoadPointId: new Map(),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.columns.slice(0, 2), ["CPT", "Used by"]);
    assert.deepEqual(model.rows.map((row) => row.values.slice(0, 2)), [
      ["CPT 64", "2 / 2 load points"],
      ["CPT 65", "1 / 2 load points"],
    ]);
    assert.deepEqual(model.rows.map((row) => row.usageDetails), ["1, 2", "1"]);
  });

  it("preserves selection and distance metadata while editing one load point", () => {
    const cpt64 = { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 };
    const state = minimalState({
      cpts: [cpt64],
      cptSelectionEditDraft: {
        loadPointIds: [1],
        cptIdsByLoadPoint: new Map([[1, new Set([64])]]),
      },
      selectedCptsByLoadPointId: new Map([[
        1,
        [{ cpt: cpt64, distance_mm: 12340, label: "upper left" }],
      ]]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.columns, ["Selection", "CPT", "Distance", "Chosen pile FRD"]);
    assert.deepEqual(model.rows[0].values.slice(0, 3), ["upper left", "CPT 64", "12.3 m"]);
  });

  it("numbers newly added manual CPTs immediately while editing", () => {
    const cpt64 = { id: 64, name: "CPT 64", x_mm: 0, y_mm: 0 };
    const cpt65 = { id: 65, name: "CPT 65", x_mm: 1000, y_mm: 0 };
    const cpt66 = { id: 66, name: "CPT 66", x_mm: 2000, y_mm: 0 };
    const state = minimalState({
      cpts: [cpt64, cpt65, cpt66],
      cptSelectionEditDraft: {
        loadPointIds: [1],
        cptIdsByLoadPoint: new Map([[1, new Set([64, 65, 66])]]),
      },
      selectedCptsByLoadPointId: new Map([[
        1,
        [{ cpt: cpt64, distance_mm: 0, label: "manual 1" }],
      ]]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.rows.map((row) => row.values[0]), ["manual 1", "manual 2", "manual 3"]);
  });

  it("keeps algorithm selections first and sorts draft manual additions by distance", () => {
    const cpt61 = { id: 61, name: "CPT 61", x_mm: 1000, y_mm: 0 };
    const cpt62 = { id: 62, name: "CPT 62", x_mm: 3000, y_mm: 0 };
    const cpt63 = { id: 63, name: "CPT 63", x_mm: 2000, y_mm: 0 };
    const state = minimalState({
      cpts: [cpt61, cpt62, cpt63],
      cptSelectionEditDraft: {
        loadPointIds: [1],
        cptIdsByLoadPoint: new Map([[1, new Set([62, 63, 61])]]),
      },
      selectedCptsByLoadPointId: new Map([[
        1,
        [{ cpt: cpt61, distance_mm: 1000, label: "nearest" }],
      ]]),
    });

    const model = getSelectedCptOverviewModel(state, getSelectedLoadPoints(state));

    assert.deepEqual(model.rows.map((row) => [row.cpt.id, row.values[0]]), [
      [61, "nearest"],
      [63, "manual 1"],
      [62, "manual 2"],
    ]);
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
    pileLegend: {
      encodingMode: "size-symbol",
      pileSizes: [],
      pileTipLevels: [],
    },
    legendImportWarnings: [],
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
    selectedPileConfigurationsByLoadPoint: new Map(),
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    ...overrides,
  };
}
