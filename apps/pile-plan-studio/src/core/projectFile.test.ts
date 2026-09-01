import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyDefaultPileCostSettings,
  createIfcppProject,
  loadIfcppProjectData,
  getImportSummary,
  type IfcppProject,
} from "./projectFile.ts";

function projectFixture(): IfcppProject {
  return {
    schema: "IFCPP",
    schema_version: 1,
    metadata: {
      name: "Fixture Project",
    },
    inputs: {
      load_points: [
        { id: 1, name: "Load point 1", x_mm: 100, y_mm: 200, design_load_kn: 300 },
      ],
      cpts: [
        { id: 10, name: "CPT 10", x_mm: 0, y_mm: 0 },
      ],
      bearing_capacities: [
        { cpt_id: 10, pile_size_mm: 290, pile_tip_level_m: -18, frd_kn: 700 },
      ],
    },
    settings: {
      global_cpt_selection: {
        algorithm: "maximum-angle",
        max_distance_m: 18,
        max_angle_degrees: 110,
      },
      cpt_selection_by_load_point: {
        "1": {
          algorithm: "quadrants",
          max_distance_m: 25,
          max_angle_degrees: 120,
        },
      },
      pile_costs: {
        schema_version: 1,
        pile_head_level_m: -3.5,
        items: [{ pile_size_mm: 290, shape: "square", cost_per_m3: 220 }],
      },
      optimization: {
        max_pile_sizes: 1,
        max_pile_tip_levels: 1,
        max_pile_configurations: 1,
        enabled_pile_sizes: [290],
        enabled_pile_tip_levels: [-18],
      },
      active_pile_sizes: [290],
      active_pile_tip_levels: [-18],
    },
    user_state: {
      selected_piles: {
        "1": {
          pile: { pile_size_mm: 290, pile_tip_level_m_key: -18000 },
        },
      },
      manual_cpt_selections: {
        "1": [10, 11],
      },
    },
  };
}

describe("IFCPP project loading", () => {
  it("preserves source provenance for the interpreted source viewer", () => {
    const project = projectFixture();
    project.import_log = [{
      source_file: "loads.xlsx",
      source_role: "load_points",
      source_profile: "rfem-export",
      warnings: ["Example warning"],
    }];

    const saved = createIfcppProject(loadIfcppProjectData(project));

    assert.deepEqual(saved.import_log, project.import_log);
  });
  it("summarizes imported counts and persisted warnings", () => {
    const project = projectFixture();
    project.import_log = [{
      source_file: "capacities.csv",
      warnings: ["Ignored 2 bearing-capacity rows", "CPTs without bearing capacities: 63"],
    }];

    assert.deepEqual(getImportSummary(project), {
      loadPointCount: 1,
      cptCount: 1,
      bearingCapacityCount: 1,
      warnings: ["Ignored 2 bearing-capacity rows", "CPTs without bearing capacities: 63"],
    });
  });
  it("loads legacy IFCPP settings with a one-meter monopoly distance", () => {
    const data = loadIfcppProjectData(projectFixture());

    assert.equal(data.name, "Fixture Project");
    assert.equal(data.loadPoints[0].design_load_kn, 300);
    assert.deepEqual(data.globalCptSelectionSettings, {
      algorithm: "maximum-angle",
      maxDistanceM: 18,
      monopolyDistanceM: 1,
      maxAngleDegrees: 110,
    });
    assert.equal(data.cptSelectionSettingsByLoadPoint.get(1)?.monopolyDistanceM, 1);
    assert.equal(data.cptSelectionSettingsByLoadPoint.get(1)?.maxDistanceM, 25);
    assert.deepEqual(data.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 290,
      pile_tip_level_mm: -18_000,
    });
    assert.deepEqual(data.manualCptIdsByLoadPoint.get(1), [10, 11]);
    assert.deepEqual(data.viewerUtilizationSettings, { minimum: 0, maximum: 1 });
    assert.equal(data.optimizationSettings.max_utilization, 1);
    assert.equal(data.activePilePlanId, "pile-plan-1");
    assert.equal(data.pilePlans.length, 1);
    assert.equal(data.pilePlans[0].name, "Pile plan 1");
    assert.deepEqual(data.pilePlans[0].lockedLoadPointIds, []);
    assert.equal(data.pileHeadLevelM, -3.5);
    assert.equal(data.currencyCode, "EUR");
    assert.equal(data.symbolScalePercent, 100);
    assert.equal(data.foregroundLayer, "load-points");
    assert.equal(data.showGrid, true);
    assert.equal(data.showTipLevelRegions, false);
  });

  it("round-trips tip-level region visibility without changing the schema version", () => {
    const loaded = loadIfcppProjectData(projectFixture());
    const saved = createIfcppProject({ ...loaded, showTipLevelRegions: true });
    const restored = loadIfcppProjectData(saved);

    assert.equal(saved.schema_version, 3);
    assert.equal(saved.settings.viewer?.show_tip_level_regions, true);
    assert.equal(restored.showTipLevelRegions, true);
  });

  it("migrates schema two cost fields and writes schema three", () => {
    const legacy = projectFixture() as unknown as Record<string, any>;
    legacy.schema_version = 2;
    legacy.units = { costs: "GBP" };
    legacy.settings.pile_costs.items[0].cost_per_m3_eur = 245;
    delete legacy.settings.pile_costs.items[0].cost_per_m3;

    const loaded = loadIfcppProjectData(legacy as unknown as IfcppProject);
    const saved = createIfcppProject(loaded);

    assert.equal(loaded.pileCostSettings.items[0].cost_per_m3, 245);
    assert.equal(loaded.currencyCode, "GBP");
    assert.equal(saved.schema_version, 3);
    assert.equal(saved.settings.pile_head_level_m, -3.5);
    assert.equal(saved.settings.pile_costs.items[0].cost_per_m3, 245);
    assert.equal("pile_head_level_m" in saved.settings.pile_costs, false);
    assert.deepEqual(saved.settings.viewer, {
      symbol_scale_percent: 100,
      foreground_layer: "load-points",
      show_grid: true,
      show_tip_level_regions: false,
    });
  });

  it("loads the active plan from an IFCPP version two project", () => {
    const legacy = projectFixture();
    const project = {
      ...legacy,
      schema_version: 2,
      user_state: {
        pile_plans: [
          {
            id: "basis",
            name: "Basis",
            selected_piles: legacy.user_state.selected_piles,
            locked_load_point_ids: [1],
          },
          {
            id: "alternative",
            name: "Alternative",
            selected_piles: {},
            locked_load_point_ids: [],
          },
        ],
        active_pile_plan_id: "basis",
        manual_cpt_selections: legacy.user_state.manual_cpt_selections,
      },
    } as unknown as IfcppProject;

    const data = loadIfcppProjectData(project);

    assert.equal(data.activePilePlanId, "basis");
    assert.equal(data.pilePlans.length, 2);
    assert.deepEqual(data.pilePlans[0].lockedLoadPointIds, [1]);
    assert.deepEqual(data.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 290,
      pile_tip_level_mm: -18_000,
    });
  });

  it("round-trips optimizer outcomes per pile plan", () => {
    const legacy = projectFixture();
    const project = {
      ...legacy,
      schema_version: 3,
      user_state: {
        pile_plans: [{
          id: "basis",
          name: "Basis",
          selected_piles: legacy.user_state.selected_piles,
          locked_load_point_ids: [],
          optimization_unassigned: {
            "7": "configuration_limits",
            "8": "optimization_constraints",
          },
        }],
        active_pile_plan_id: "basis",
        manual_cpt_selections: legacy.user_state.manual_cpt_selections,
      },
    } as unknown as IfcppProject;

    const loaded = loadIfcppProjectData(project);
    const saved = createIfcppProject(loaded);
    const reloaded = loadIfcppProjectData(saved);

    assert.deepEqual(
      reloaded.pilePlans[0].optimizationUnassignedByLoadPoint,
      new Map([[7, "configuration_limits"], [8, "optimization_constraints"]]),
    );
  });

  it("normalizes an empty plan list and an unknown active plan", () => {
    const legacy = projectFixture();
    const project = {
      ...legacy,
      schema_version: 2,
      user_state: {
        pile_plans: [],
        active_pile_plan_id: "missing",
        manual_cpt_selections: {},
      },
    } as unknown as IfcppProject;

    const data = loadIfcppProjectData(project);

    assert.equal(data.pilePlans.length, 1);
    assert.equal(data.activePilePlanId, "pile-plan-1");
  });

  it("rejects duplicate pile plan IDs", () => {
    const legacy = projectFixture();
    const duplicatePlan = {
      id: "duplicate",
      name: "Duplicate",
      selected_piles: {},
      locked_load_point_ids: [],
    };
    const project = {
      ...legacy,
      schema_version: 2,
      user_state: {
        pile_plans: [duplicatePlan, duplicatePlan],
        active_pile_plan_id: "duplicate",
        manual_cpt_selections: {},
      },
    } as unknown as IfcppProject;

    assert.throws(() => loadIfcppProjectData(project), /Duplicate pile plan id 'duplicate'/);
  });

  it("normalizes persisted utilization settings", () => {
    const project = projectFixture();
    project.settings.viewer_utilization = { minimum: 1.2, maximum: -0.1 };
    project.settings.optimization.max_utilization = 0.82;

    const data = loadIfcppProjectData(project);

    assert.deepEqual(data.viewerUtilizationSettings, { minimum: 0, maximum: 1 });
    assert.equal(data.optimizationSettings.max_utilization, 0.82);
  });

  it("loads persisted choices and settings returned as WASM maps", () => {
    const project = projectFixture();
    project.settings.cpt_selection_by_load_point = new Map([
      [1, project.settings.cpt_selection_by_load_point["1"]],
    ]) as unknown as IfcppProject["settings"]["cpt_selection_by_load_point"];
    project.user_state.selected_piles = new Map([
      [1, project.user_state.selected_piles["1"]],
    ]) as unknown as IfcppProject["user_state"]["selected_piles"];
    project.user_state.manual_cpt_selections = new Map([
      [1, [10, 11]],
    ]) as unknown as IfcppProject["user_state"]["manual_cpt_selections"];

    const data = loadIfcppProjectData(project);

    assert.equal(data.cptSelectionSettingsByLoadPoint.get(1)?.maxDistanceM, 25);
    assert.deepEqual(data.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 290,
      pile_tip_level_mm: -18_000,
    });
    assert.deepEqual(data.manualCptIdsByLoadPoint.get(1), [10, 11]);
  });

  it("rejects non-IFCPP project data", () => {
    assert.throws(
      () => loadIfcppProjectData({ ...projectFixture(), schema: "IFC" as "IFCPP" }),
      /Expected IFCPP project, got IFC/,
    );
  });

  it("loads the sample IFCPP fixture", () => {
    const sampleProjectText = readFileSync(
      new URL("../../../../sample_project/sample_project.ifcpp", import.meta.url),
      "utf8",
    );
    const data = loadIfcppProjectData(sampleProjectText);

    assert.equal(data.name, "Sample Project");
    assert.equal(data.loadPoints.length, 328);
    assert.equal(data.cpts.length, 77);
    assert.equal(data.bearingCapacities.length, 2340);
  });

  it("emits monopoly distance when creating IFCPP project data", () => {
    const data = loadIfcppProjectData(projectFixture());
    const project = createIfcppProject(data);

    assert.equal(project.schema, "IFCPP");
    assert.equal(project.schema_version, 3);
    assert.equal(project.metadata.name, "Fixture Project");
    assert.deepEqual(project.settings.global_cpt_selection, {
      algorithm: "maximum-angle",
      max_distance_m: 18,
      monopoly_distance_m: 1,
      max_angle_degrees: 110,
    });
    assert.deepEqual(project.user_state.pile_plans[0].selected_piles["1"].pile, {
      pile_size_mm: 290,
      pile_tip_level_m_key: -18000,
    });
    assert.deepEqual(
      project.user_state.pile_plans[0].selected_piles["1"].external_references,
      [],
    );
    assert.equal(project.user_state.active_pile_plan_id, "pile-plan-1");
    assert.equal("selected_piles" in project.user_state, false);
    assert.deepEqual(project.settings.viewer_utilization, { minimum: 0, maximum: 1 });
    assert.equal(project.settings.optimization.max_utilization, 1);
  });

  it("round-trips project legend activation independently from active pile choices", () => {
    const loaded = loadIfcppProjectData(projectFixture());
    loaded.activePileSizes = [290];
    loaded.activePileTipLevels = [-18];
    loaded.selectedPileConfigurationsByLoadPoint.set(1, {
      pile_size_mm: 320,
      pile_tip_level_mm: -19_000,
    });

    const saved = createIfcppProject(loaded);
    const reloaded = loadIfcppProjectData(saved);

    assert.deepEqual(saved.settings.active_pile_sizes, [290]);
    assert.deepEqual(saved.settings.active_pile_tip_levels, [-18]);
    assert.deepEqual(reloaded.activePileSizes, [290]);
    assert.deepEqual(reloaded.activePileTipLevels, [-18]);
    assert.deepEqual(reloaded.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 320,
      pile_tip_level_mm: -19_000,
    });
  });

  it("creates a built-in legend when an older IFCPP file has no mapping", () => {
    const loaded = loadIfcppProjectData(projectFixture());

    assert.equal(loaded.pileLegend.encodingMode, "size-symbol");
    assert.deepEqual(loaded.pileLegend.pileSizes[0], {
      value: 290,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#4E79A7",
      symbolAutomatic: true,
      colorAutomatic: true,
    });
    assert.equal(loaded.pileLegend.colorScheme, "tableau-extended");
    assert.deepEqual(loaded.legendImportWarnings, []);
  });

  it("round-trips project legend appearance and encoding", () => {
    const loaded = loadIfcppProjectData(projectFixture());
    loaded.pileLegend = {
      ...loaded.pileLegend,
      encodingMode: "tip-symbol",
      colorScheme: "colorblind-friendly",
      pileSizes: loaded.pileLegend.pileSizes.map((item) => ({
        ...item,
        symbol: { baseShape: "rectangle-horizontal", fillPattern: "diagonal-half" },
        color: "#123456",
        symbolAutomatic: false,
        colorAutomatic: false,
      })),
    };

    const saved = createIfcppProject(loaded);
    const reloaded = loadIfcppProjectData(saved);

    assert.equal(saved.settings.pile_legend?.encoding_mode, "tip-symbol");
    assert.equal(saved.settings.pile_legend?.color_scheme, "colorblind-friendly");
    assert.equal(saved.settings.pile_legend?.pile_sizes[0].symbol_automatic, false);
    assert.equal(saved.settings.pile_legend?.pile_sizes[0].color_automatic, false);
    assert.deepEqual(reloaded.pileLegend, loaded.pileLegend);
  });

  it("defaults missing legend assignment metadata to automatic Tableau Extended", () => {
    const project = projectFixture();
    project.settings.pile_legend = {
      encoding_mode: "size-symbol",
      pile_sizes: [{
        value: 290,
        symbol: { base_shape: "circle", fill_pattern: "full" },
        color: "#123456",
      }],
      pile_tip_levels: [],
    };

    const loaded = loadIfcppProjectData(project);

    assert.equal(loaded.pileLegend.colorScheme, "tableau-extended");
    assert.equal(loaded.pileLegend.pileSizes[0].symbolAutomatic, true);
    assert.equal(loaded.pileLegend.pileSizes[0].colorAutomatic, true);
  });

  it("falls back only the malformed stored legend channel", () => {
    const project = projectFixture();
    project.settings.pile_legend = {
      encoding_mode: "size-symbol",
      pile_sizes: [{
        value: 290,
        symbol: { base_shape: "future-star", fill_pattern: "full" },
        color: "#123456",
      }],
      pile_tip_levels: [{
        value: -18,
        symbol: { base_shape: "square", fill_pattern: "top-half" },
        color: "#654321",
      }],
    };

    const loaded = loadIfcppProjectData(project);

    assert.deepEqual(loaded.legendImportWarnings, [
      { itemType: "size", value: 290, field: "symbol" },
    ]);
    assert.deepEqual(loaded.pileLegend.pileSizes[0], {
      value: 290,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#123456",
      symbolAutomatic: true,
      colorAutomatic: true,
    });
    assert.deepEqual(loaded.pileLegend.pileTipLevels[0], {
      value: -18,
      symbol: { baseShape: "square", fillPattern: "top-half" },
      color: "#654321",
      symbolAutomatic: true,
      colorAutomatic: true,
    });
  });

  it("preserves inactive plans while saving edits to the active plan", () => {
    const legacy = projectFixture();
    const loaded = loadIfcppProjectData({
      ...legacy,
      schema_version: 2,
      user_state: {
        pile_plans: [
          {
            id: "basis",
            name: "Basis",
            selected_piles: legacy.user_state.selected_piles,
            locked_load_point_ids: [1],
          },
          {
            id: "checkpoint",
            name: "Checkpoint",
            selected_piles: {
              "1": {
                pile: { pile_size_mm: 320, pile_tip_level_m_key: -18500 },
                external_references: [],
              },
            },
            locked_load_point_ids: [],
          },
        ],
        active_pile_plan_id: "basis",
        manual_cpt_selections: legacy.user_state.manual_cpt_selections,
      },
    } as unknown as IfcppProject);
    loaded.selectedPileConfigurationsByLoadPoint.set(1, {
      pile_size_mm: 350,
      pile_tip_level_mm: -20_000,
    });

    const saved = createIfcppProject(loaded);

    assert.equal(saved.user_state.pile_plans[0].selected_piles["1"].pile?.pile_size_mm, 350);
    assert.equal(saved.user_state.pile_plans[1].selected_piles["1"].pile?.pile_size_mm, 320);
    assert.deepEqual(saved.user_state.pile_plans[0].locked_load_point_ids, [1]);
  });

  it("preserves references for an unchanged pile and clears them after replacement", () => {
    const project = projectFixture();
    project.user_state.selected_piles!["1"].external_references = [{ entity: "IfcPile" }];
    const loaded = loadIfcppProjectData(project);

    const unchanged = createIfcppProject(loaded);
    assert.deepEqual(
      unchanged.user_state.pile_plans![0].selected_piles["1"].external_references,
      [{ entity: "IfcPile" }],
    );

    loaded.selectedPileConfigurationsByLoadPoint.set(1, {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_500,
    });
    const changed = createIfcppProject(loaded);
    assert.deepEqual(
      changed.user_state.pile_plans![0].selected_piles["1"].external_references,
      [],
    );
  });

  it("uses default pile cost settings when imported project has no pile costs", () => {
    const importedProject = {
      ...projectFixture(),
      settings: {
        ...projectFixture().settings,
        pile_costs: {
          schema_version: 1,
          pile_head_level_m: 0,
          items: [],
        },
      },
    };
    const defaults = projectFixture().settings.pile_costs;

    const project = applyDefaultPileCostSettings(importedProject, defaults);

    assert.deepEqual(project.settings.pile_costs, defaults);
  });
});
