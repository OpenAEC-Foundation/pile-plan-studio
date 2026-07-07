import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPileOptionsByLoadPoint,
  calculatePileConfigurationOptions,
  calculatePileCost,
  createBearingCapacityIndex,
  chooseDefaultPileOption,
  getConfigurationStyle,
  getLegendItems,
  getManuallySelectedCpts,
  getBearingCapacityRowsForCpt,
  getBearingCapacitySummary,
  getProjectBounds,
  getSelectedCpts,
  getSelectedCptsByMaximumAngle,
  getSelectedCptsByQuadrant,
  projectPoint,
  type BearingCapacity,
  type Cpt,
  type LoadPoint,
  type PileCostSettings,
} from "./projectData.ts";

const loadPoints: LoadPoint[] = [
  { id: 1, name: "Load point 1", x_mm: 0, y_mm: 0, design_load_kn: 100 },
  { id: 2, name: "Load point 2", x_mm: 100, y_mm: 200, design_load_kn: 250 },
];

const cpts: Cpt[] = [
  { id: 11, name: "CPT 11", x_mm: 50, y_mm: -50 },
  { id: 12, name: "CPT 12", x_mm: 200, y_mm: 100 },
];

const capacities: BearingCapacity[] = [
  { cpt_id: 11, pile_tip_level_m: -18, pile_size_mm: 320, frd_kn: 700 },
  { cpt_id: 11, pile_tip_level_m: -19, pile_size_mm: 320, frd_kn: 740 },
  { cpt_id: 12, pile_tip_level_m: -18, pile_size_mm: 320, frd_kn: 650 },
];

const costSettings: PileCostSettings = {
  schema_version: 1,
  pile_head_level_m: -3.5,
  items: [
    { pile_size_mm: 290, shape: "square", cost_per_m3_eur: 220 },
    { pile_size_mm: 320, shape: "square", cost_per_m3_eur: 205 },
    { pile_size_mm: 356, shape: "round", cost_per_m3_eur: 190 },
  ],
};

describe("project data view helpers", () => {
  it("calculates bounds across load points and CPTs", () => {
    assert.deepEqual(getProjectBounds(loadPoints, cpts), {
      minX: 0,
      maxX: 200,
      minY: -50,
      maxY: 200,
    });
  });

  it("falls back to CPT bounds when there are no load points", () => {
    assert.deepEqual(getProjectBounds([], cpts), {
      minX: 50,
      maxX: 200,
      minY: -50,
      maxY: 100,
    });
  });

  it("projects coordinates into a stable view box", () => {
    assert.deepEqual(projectPoint({ x_mm: 0, y_mm: -50 }, getProjectBounds(loadPoints, cpts)), {
      x: 10,
      y: 90,
    });
    assert.deepEqual(projectPoint({ x_mm: 200, y_mm: 200 }, getProjectBounds(loadPoints, cpts)), {
      x: 90,
      y: 10,
    });
  });

  it("summarizes bearing capacities by CPT", () => {
    assert.deepEqual(getBearingCapacitySummary(capacities, 11), {
      count: 2,
      minFrdKn: 700,
      maxFrdKn: 740,
    });
  });

  it("lists bearing capacities for one CPT sorted by pile option", () => {
    assert.deepEqual(getBearingCapacityRowsForCpt(capacities, 11), [
      { pile_size_mm: 320, pile_tip_level_m: -18, frd_kn: 700 },
      { pile_size_mm: 320, pile_tip_level_m: -19, frd_kn: 740 },
    ]);
  });

  it("selects the nearest CPT in each quadrant", () => {
    const selected = getSelectedCptsByQuadrant(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10, y_mm: 10 },
        { id: 2, name: "CPT 2", x_mm: 20, y_mm: 20 },
        { id: 3, name: "CPT 3", x_mm: 10, y_mm: -10 },
        { id: 4, name: "CPT 4", x_mm: -10, y_mm: 10 },
        { id: 5, name: "CPT 5", x_mm: -10, y_mm: -10 },
      ],
    );

    assert.deepEqual(
      selected.map((item) => [item.label, item.quadrant, item.cpt.id]),
      [
        ["upper right", "upper right", 1],
        ["lower right", "lower right", 3],
        ["upper left", "upper left", 4],
        ["lower left", "lower left", 5],
      ],
    );
  });

  it("selects CPTs by the maximum angle algorithm", () => {
    const selected = getSelectedCptsByMaximumAngle(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10_000, y_mm: 0 },
        { id: 2, name: "CPT 2", x_mm: 0, y_mm: 10_000 },
        { id: 3, name: "CPT 3", x_mm: -10_000, y_mm: 0 },
        { id: 4, name: "CPT 4", x_mm: 0, y_mm: -10_000 },
      ],
      25,
      120,
    );

    assert.deepEqual(
      selected.map((item) => [item.label, item.cpt.id]),
      [
        ["nearest", 1],
        ["angle 2", 4],
        ["angle 3", 3],
        ["angle 4", 2],
      ],
    );
  });

  it("selects CPTs through configurable selection settings", () => {
    const selected = getSelectedCpts(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10_000, y_mm: 0 },
        { id: 2, name: "CPT 2", x_mm: 26_000, y_mm: 0 },
      ],
      { algorithm: "maximum-angle", maxDistanceM: 25, maxAngleDegrees: 120 },
    );

    assert.deepEqual(selected.map((item) => item.cpt.id), [1]);
  });

  it("uses manually selected CPTs instead of the algorithm when they are provided", () => {
    const selected = getSelectedCpts(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10_000, y_mm: 10_000 },
        { id: 2, name: "CPT 2", x_mm: -10_000, y_mm: -10_000 },
        { id: 3, name: "CPT 3", x_mm: 10_000, y_mm: -10_000 },
      ],
      { algorithm: "quadrants", maxDistanceM: 25, maxAngleDegrees: 120 },
      [3, 1],
    );

    assert.deepEqual(
      selected.map((item) => [item.label, item.cpt.id]),
      [
        ["manual 1", 3],
        ["manual 2", 1],
      ],
    );
  });

  it("ignores unknown manual CPT ids", () => {
    const selected = getManuallySelectedCpts(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [{ id: 1, name: "CPT 1", x_mm: 10_000, y_mm: 10_000 }],
      [99, 1],
    );

    assert.deepEqual(selected.map((item) => item.cpt.id), [1]);
  });

  it("leaves quadrants empty when no CPT is available", () => {
    const selected = getSelectedCptsByQuadrant(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10, y_mm: 10 },
        { id: 2, name: "CPT 2", x_mm: 5, y_mm: 5 },
      ],
    );

    assert.deepEqual(selected.map((item) => item.cpt.id), [2]);
  });

  it("ignores CPTs beyond the maximum selection distance", () => {
    const selected = getSelectedCptsByQuadrant(
      { id: 10, name: "Load point 10", x_mm: 0, y_mm: 0, design_load_kn: 100 },
      [
        { id: 1, name: "CPT 1", x_mm: 10_000, y_mm: 10_000 },
        { id: 2, name: "CPT 2", x_mm: 19_000, y_mm: 0 },
      ],
      18,
    );

    assert.deepEqual(selected.map((item) => item.cpt.id), [1]);
  });

  it("calculates pile configuration options for all selected CPTs", () => {
    const bearingCapacityIndex = createBearingCapacityIndex(capacities);
    const options = calculatePileConfigurationOptions({
      designLoadKn: 600,
      selectedCpts: [
        { quadrant: "upper right", cpt: { id: 11, name: "CPT 11", x_mm: 0, y_mm: 0 }, distance_mm: 0 },
        { quadrant: "upper left", cpt: { id: 12, name: "CPT 12", x_mm: 0, y_mm: 0 }, distance_mm: 0 },
      ],
      bearingCapacities: capacities,
      bearingCapacityIndex,
    });

    assert.deepEqual(options, [
      {
        pile_size_mm: 320,
        pile_tip_level_m: -18,
        isOption: true,
        governing_cpt_id: 12,
        governing_frd_kn: 650,
        utilization: 600 / 650,
        missing_cpt_ids: [],
      },
      {
        pile_size_mm: 320,
        pile_tip_level_m: -19,
        isOption: false,
        governing_cpt_id: 11,
        governing_frd_kn: 740,
        utilization: 600 / 740,
        missing_cpt_ids: [12],
      },
    ]);
  });

  it("calculates pile costs from shape, length, and cubic meter cost", () => {
    assert.equal(
      calculatePileCost({ pile_size_mm: 320, pile_tip_level_m: -18 }, costSettings),
      304,
    );

    assert.equal(
      calculatePileCost({ pile_size_mm: 356, pile_tip_level_m: -18 }, costSettings),
      274,
    );
  });

  it("returns null when pile cost settings are missing for a size", () => {
    assert.equal(calculatePileCost({ pile_size_mm: 400, pile_tip_level_m: -18 }, costSettings), null);
  });

  it("chooses the cheapest valid pile option by default", () => {
    const options = [
      {
        pile_size_mm: 320,
        pile_tip_level_m: -18,
        isOption: true,
        governing_cpt_id: 1,
        governing_frd_kn: 700,
        utilization: 0.7,
        missing_cpt_ids: [],
      },
      {
        pile_size_mm: 290,
        pile_tip_level_m: -18,
        isOption: true,
        governing_cpt_id: 1,
        governing_frd_kn: 650,
        utilization: 0.75,
        missing_cpt_ids: [],
      },
      {
        pile_size_mm: 356,
        pile_tip_level_m: -18,
        isOption: false,
        governing_cpt_id: 1,
        governing_frd_kn: 500,
        utilization: 1.2,
        missing_cpt_ids: [],
      },
    ];

    assert.equal(chooseDefaultPileOption(options, costSettings)?.pile_size_mm, 290);
  });

  it("looks up bearing capacities by CPT and configuration", () => {
    const index = createBearingCapacityIndex(capacities);

    assert.deepEqual(index.get(11, 320, -18), {
      cpt_id: 11,
      pile_tip_level_m: -18,
      pile_size_mm: 320,
      frd_kn: 700,
    });
    assert.equal(index.get(12, 320, -19), undefined);
  });

  it("builds pile options for every load point up front", () => {
    const index = createBearingCapacityIndex(capacities);
    const optionsByLoadPoint = buildPileOptionsByLoadPoint({
      loadPoints,
      cpts,
      bearingCapacities: capacities,
      bearingCapacityIndex: index,
      cptSelectionSettings: { algorithm: "quadrants", maxDistanceM: 100, maxAngleDegrees: 120 },
    });

    assert.equal(optionsByLoadPoint.size, 2);
    assert.equal(optionsByLoadPoint.get(1)?.length, 2);
    assert.equal(optionsByLoadPoint.get(2)?.length, 2);
  });

  it("builds pile options with per-load-point selection settings and manual CPTs", () => {
    const index = createBearingCapacityIndex(capacities);
    const optionsByLoadPoint = buildPileOptionsByLoadPoint({
      loadPoints,
      cpts,
      bearingCapacities: capacities,
      bearingCapacityIndex: index,
      cptSelectionSettings: (loadPoint) =>
        loadPoint.id === 1
          ? { algorithm: "maximum-angle", maxDistanceM: 100, maxAngleDegrees: 120 }
          : { algorithm: "quadrants", maxDistanceM: 100, maxAngleDegrees: 120 },
      manualCptIdsByLoadPoint: new Map([[1, [12]]]),
    });

    assert.deepEqual(
      optionsByLoadPoint.get(1)?.map((option) => option.governing_cpt_id),
      [12, null],
    );
  });

  it("builds legend items from bearing capacity configurations", () => {
    const manySizes: BearingCapacity[] = [290, 320, 350, 380, 400, 450, 500, 550, 600, 650]
      .map((pileSize) => ({
        cpt_id: 1,
        pile_tip_level_m: -18,
        pile_size_mm: pileSize,
        frd_kn: 700,
      }));

    assert.deepEqual(getLegendItems(manySizes), {
      pileSizes: [
        { value: 290, shape: "circle" },
        { value: 320, shape: "square" },
        { value: 350, shape: "diamond" },
        { value: 380, shape: "triangle-up" },
        { value: 400, shape: "triangle-down" },
        { value: 450, shape: "triangle-left" },
        { value: 500, shape: "triangle-right" },
        { value: 550, shape: "pentagon" },
        { value: 600, shape: "star" },
        { value: 650, shape: "thin-diamond" },
      ],
      pileTipLevels: [
        { value: -18, color: "#4e79a7" },
      ],
    });
  });

  it("returns a stable style for a pile configuration", () => {
    const legend = getLegendItems(capacities);

    assert.deepEqual(getConfigurationStyle({ pile_size_mm: 320, pile_tip_level_m: -18 }, legend), {
      shape: "circle",
      color: "#4e79a7",
    });
  });

  it("assigns unique colors when there are more than ten tip levels", () => {
    const manyTipLevels: BearingCapacity[] = Array.from({ length: 14 }, (_, index) => ({
      cpt_id: 1,
      pile_tip_level_m: -17 - index * 0.25,
      pile_size_mm: 320,
      frd_kn: 700,
    }));

    const colors = getLegendItems(manyTipLevels).pileTipLevels.map((item) => item.color);

    assert.equal(new Set(colors).size, colors.length);
  });
});
