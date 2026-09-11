import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { IfcppProject } from "../core/projectFile.ts";
import {
  canonicalProjectForTest,
  projectTipLevelKeysForTest,
} from "../core/projectTestSupport.ts";
import { createInitialProjectState, transitionCptSettingsScope } from "./projectState.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

function canonicalProject(): IfcppProject {
  const project = canonicalProjectForTest(sampleProjectText);
  project.settings.global_cpt_selection.monopoly_distance_m ??= 1;
  project.settings.load_point_grouping = {
    automatic: true,
    max_edge_distance_mm: 1_200,
  };
  project.settings.viewer_utilization ??= { minimum: 0, maximum: 1 };
  project.settings.viewer = {
    symbol_scale_percent: 145,
    foreground_layer: "cpts",
    show_grid: false,
    show_tip_level_regions: true,
  };
  project.import_log ??= [];
  return project;
}

function createTestProjectState(
  project: IfcppProject,
  options: Parameters<typeof createInitialProjectState>[1],
) {
  return createInitialProjectState(project, options, projectTipLevelKeysForTest(project));
}

describe("createInitialProjectState", () => {
  it("hydrates project content and initializes transient interface state separately", () => {
    const state = createTestProjectState(canonicalProject(), {
      initializeDefaultPiles: true,
    });

    assert.ok(state.loadPoints.length > 0);
    assert.ok(state.cpts.length > 0);
    assert.deepEqual(state.selectedLoadPointIds, [state.loadPoints[0].id]);
    assert.equal(state.selectedLoadPointId, state.loadPoints[0].id);
    assert.equal(state.selectedCptId, null);
    assert.equal(state.rightPanelMode, "load-point");
    assert.deepEqual(state.viewport, { scale: 1, offsetX: 0, offsetY: 0 });
    assert.equal(state.defaultPileSelectionPending, true);
    assert.equal(state.symbolScalePercent, 145);
    assert.equal(state.foregroundLayer, "cpts");
    assert.equal(state.showGrid, false);
    assert.equal(state.showTipLevelRegions, true);
  });

  it("uses an explicitly supplied localized label for a newly created base plan", () => {
    const state = createTestProjectState(canonicalProject(), {
      initializeDefaultPiles: true,
      defaultPilePlanName: "Basisplan",
    });

    assert.equal(state.pilePlans[0].name, "Basisplan");
  });

  it("exposes assignments and locks from the canonical active plan", () => {
    const project = canonicalProject();
    const first = project.user_state.pile_plans![0];
    project.user_state.pile_plans = [
      { ...first, id: "inactive", name: "Inactive", selected_piles: {} },
      {
        ...first,
        id: "active",
        name: "Active",
        selected_piles: {
          "1": { pile: { pile_size_mm: 320, pile_tip_level_m_key: -18_500 } },
        },
        locked_load_point_ids: [1],
      },
    ];
    project.user_state.active_pile_plan_id = "active";
    const keys = projectTipLevelKeysForTest(project);
    const state = createInitialProjectState(
      project,
      { initializeDefaultPiles: false },
      keys,
    );

    assert.equal(state.activePilePlanId, "active");
    assert.equal(state.pilePlans.length, 2);
    assert.deepEqual(state.selectedPileConfigurationsByLoadPoint.get(1), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_500,
    });
    assert.deepEqual(state.pilePlans[1].lockedLoadPointIds, [1]);
  });

  it("summarizes canonical source snapshots for the project explorer", () => {
    const state = createTestProjectState(canonicalProject(), {
      initializeDefaultPiles: false,
    });

    assert.deepEqual(
      state.inputSources.map(({ kind, status }) => ({ kind, status })),
      [
        { kind: "load_points", status: "snapshot-only" },
        { kind: "cpts", status: "snapshot-only" },
        { kind: "bearing_capacities", status: "snapshot-only" },
      ],
    );
  });
});

describe("transitionCptSettingsScope", () => {
  it("forces all scope when the selection is empty", () => {
    assert.equal(transitionCptSettingsScope("selected", [1], []), "all");
  });

  it("defaults to selected scope when a selection is created", () => {
    assert.equal(transitionCptSettingsScope("all", [], [1, 2]), "selected");
  });

  it("preserves an explicit scope when replacing a non-empty selection", () => {
    assert.equal(transitionCptSettingsScope("all", [1], [2, 3]), "all");
    assert.equal(transitionCptSettingsScope("selected", [1], [2, 3]), "selected");
  });
});
