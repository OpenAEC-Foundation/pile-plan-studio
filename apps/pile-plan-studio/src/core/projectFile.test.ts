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
        items: [{ pile_size_mm: 290, shape: "square", cost_per_m3_eur: 220 }],
      },
      optimization: {
        max_pile_sizes: 1,
        max_pile_tip_levels: 1,
        max_pile_configurations: 1,
        enabled_pile_sizes: [290],
        enabled_pile_tip_levels: [-18],
        baseline_pile_sizes: [],
        baseline_pile_tip_levels: [],
        baseline_pile_configurations: [],
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
    assert.equal(data.selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
    assert.deepEqual(data.manualCptIdsByLoadPoint.get(1), [10, 11]);
    assert.deepEqual(data.viewerUtilizationSettings, { minimum: 0, maximum: 1 });
    assert.equal(data.optimizationSettings.max_utilization, 1);
    assert.equal(data.activePilePlanId, "pile-plan-1");
    assert.equal(data.pilePlans.length, 1);
    assert.equal(data.pilePlans[0].name, "Pile plan 1");
    assert.deepEqual(data.pilePlans[0].lockedLoadPointIds, []);
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
    assert.equal(data.selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
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
    assert.equal(data.selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
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
    assert.equal(project.schema_version, 2);
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
    loaded.selectedPileOptionKeysByLoadPoint.set(1, "350|-20");

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

    loaded.selectedPileOptionKeysByLoadPoint.set(1, "320|-18.5");
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
