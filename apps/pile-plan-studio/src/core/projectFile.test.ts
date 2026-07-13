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
  it("loads app data from an IFCPP project", () => {
    const data = loadIfcppProjectData(projectFixture());

    assert.equal(data.name, "Fixture Project");
    assert.equal(data.loadPoints[0].design_load_kn, 300);
    assert.deepEqual(data.globalCptSelectionSettings, {
      algorithm: "maximum-angle",
      maxDistanceM: 18,
      maxAngleDegrees: 110,
    });
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

  it("creates IFCPP project data from the current viewer state", () => {
    const data = loadIfcppProjectData(projectFixture());
    const project = createIfcppProject(data);

    assert.equal(project.schema, "IFCPP");
    assert.equal(project.metadata.name, "Fixture Project");
    assert.deepEqual(project.settings.global_cpt_selection, {
      algorithm: "maximum-angle",
      max_distance_m: 18,
      max_angle_degrees: 110,
    });
    assert.deepEqual(project.user_state.selected_piles["1"].pile, {
      pile_size_mm: 290,
      pile_tip_level_m_key: -18000,
    });
    assert.deepEqual(project.user_state.selected_piles["1"].external_references, []);
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
