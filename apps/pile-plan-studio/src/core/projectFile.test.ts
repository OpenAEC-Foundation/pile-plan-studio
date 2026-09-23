import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getImportSummary,
  hydrateProjectState,
  type IfcppProject,
} from "./projectFile.ts";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "./projectTestSupport.ts";

function canonicalProjectFixture(): IfcppProject {
  const project = canonicalProjectForTest(
    readFileSync("../../sample_project/sample_project.ifcpp", "utf8"),
  );
  project.settings.global_cpt_selection.monopoly_distance_m ??= 1;
  for (const settings of Object.values(project.settings.cpt_selection_by_load_point)) {
    settings.monopoly_distance_m ??= 1;
  }
  project.settings.load_point_grouping = {
    automatic: false,
    max_edge_distance_mm: 2_750,
    manual_groups: [{ load_point_ids: [1, 2] }],
    ungrouped_groups: [{ load_point_ids: [3] }],
  };
  project.settings.viewer_utilization = { minimum: 0.15, maximum: 0.9 };
  project.settings.viewer = {
    symbol_scale_percent: 135,
    foreground_layer: "cpts",
    show_grid: false,
    show_tip_level_regions: true,
    show_load_point_groups: true,
  };
  project.import_log ??= [];
  return project;
}

describe("canonical project hydration", () => {
  it("maps canonical fields and exact millimetre identities into runtime containers", () => {
    const project = canonicalProjectFixture();
    const keys = projectTipLevelKeysForTest(project);

    const loaded = hydrateProjectState(project, keys);

    assert.equal(loaded.name, project.metadata.name);
    assert.equal(loaded.bearingCapacities[0].pile_tip_level_mm, keys.bearingCapacities[0]);
    assert.deepEqual(loaded.pilePlans[0].activePileTipLevelMms, keys.pilePlans[0].active);
    assert.deepEqual(loaded.loadPointGroupingSettings, {
      automatic: false,
      maxEdgeDistanceM: 2.75,
      manualGroups: [{ loadPointIds: [1, 2] }],
      ungroupedGroups: [{ loadPointIds: [3] }],
    });
    assert.deepEqual(loaded.viewerUtilizationSettings, { minimum: 0.15, maximum: 0.9 });
    assert.equal(loaded.symbolScalePercent, 135);
    assert.equal(loaded.foregroundLayer, "cpts");
    assert.equal(loaded.showGrid, false);
    assert.equal(loaded.showTipLevelRegions, true);
    assert.equal(loaded.showLoadPointGroups, true);
    assert.ok(loaded.cptSelectionSettingsByLoadPoint instanceof Map);
    assert.ok(loaded.manualCptIdsByLoadPoint instanceof Map);
  });

  it("clones project content before exposing it to mutable React state", () => {
    const project = canonicalProjectFixture();
    const loaded = hydrateProjectState(project, projectTipLevelKeysForTest(project));

    assert.notEqual(loaded.metadata, project.metadata);
    assert.notEqual(loaded.units, project.units);
    assert.notEqual(loaded.loadPoints, project.inputs.load_points);
    assert.notEqual(loaded.cpts, project.inputs.cpts);
    assert.notEqual(loaded.bearingCapacities, project.inputs.bearing_capacities);
    assert.notEqual(loaded.pilePlans, project.user_state.pile_plans);
    assert.notEqual(
      loaded.loadPointGroupingSettings.manualGroups[0].loadPointIds,
      project.settings.load_point_grouping?.manual_groups?.[0].load_point_ids,
    );
    loaded.loadPointGroupingSettings.manualGroups[0].loadPointIds.push(99);
    assert.deepEqual(project.settings.load_point_grouping?.manual_groups?.[0].load_point_ids, [1, 2]);
    loaded.loadPoints[0].name = "Runtime edit";
    assert.notEqual(project.inputs.load_points[0].name, "Runtime edit");
  });

  it("rejects a mismatched canonical identity sidecar", () => {
    const project = canonicalProjectFixture();
    const keys = projectTipLevelKeysForTest(project);

    assert.throws(
      () => hydrateProjectState(project, { ...keys, bearingCapacities: [] }),
      /key contract does not match bearing capacities/,
    );
  });

  it("retains source counts and warnings for interface summaries", () => {
    const project = canonicalProjectFixture();
    project.import_log = [{
      source_file: "capacities.csv",
      warnings: ["Ignored two rows"],
    }];

    assert.deepEqual(getImportSummary(project), {
      loadPointCount: project.inputs.load_points.length,
      cptCount: project.inputs.cpts.length,
      bearingCapacityCount: project.inputs.bearing_capacities.length,
      warnings: ["Ignored two rows"],
    });
  });
});
