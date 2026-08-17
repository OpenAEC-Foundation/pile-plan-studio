import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialProjectState, transitionCptSettingsScope } from "./projectState.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

describe("createInitialProjectState", () => {
  it("loads the sample project and selects the first load point", () => {
    const state = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: true });

    assert.ok(state.loadPoints.length > 0);
    assert.ok(state.cpts.length > 0);
    assert.equal(state.selectedLoadPointIds.length, 1);
    assert.equal(state.selectedLoadPointIds[0], state.loadPoints[0].id);
    assert.equal(state.selectedLoadPointId, state.loadPoints[0].id);
    assert.equal(state.selectedCptId, null);
    assert.equal(state.rightPanelMode, "load-point");
    assert.equal(state.cptSettingsScope, "selected");
    assert.equal(state.analysisError, null);
    assert.equal(state.defaultPileSelectionPending, true);
    assert.equal(state.symbolScalePercent, 100);
    assert.equal(state.foregroundLayer, "load-points");
    assert.equal(state.optimizationCreatesPilePlan, true);
  });

  it("loads viewer preferences from the IFCPP project", () => {
    const project = JSON.parse(sampleProjectText);
    project.schema_version = 3;
    project.settings.viewer = {
      symbol_scale_percent: 145,
      foreground_layer: "cpts",
      show_grid: false,
    };
    const state = createInitialProjectState(project, { initializeDefaultPiles: false });

    assert.equal(state.symbolScalePercent, 145);
    assert.equal(state.foregroundLayer, "cpts");
    assert.equal(state.showGrid, false);
    assert.equal(state.showTipLevelRegions, false);

    project.settings.viewer.show_tip_level_regions = true;
    const visibleState = createInitialProjectState(project, { initializeDefaultPiles: false });
    assert.equal(visibleState.showTipLevelRegions, true);
  });

  it("preserves stored IFCPP choices without scheduling default selection", () => {
    const project = JSON.parse(sampleProjectText);
    project.user_state.pile_plans[0].selected_piles = {
      "1": { pile: { pile_size_mm: 290, pile_tip_level_m_key: -18000 } },
    };

    const state = createInitialProjectState(project, { initializeDefaultPiles: false });

    assert.equal(state.defaultPileSelectionPending, false);
    assert.equal(state.selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
  });

  it("uses a localized base-plan name for a newly imported project", () => {
    const state = createInitialProjectState(sampleProjectText, {
      initializeDefaultPiles: true,
      defaultPilePlanName: "Basisplan",
    });

    assert.equal(state.pilePlans[0].name, "Basisplan");
  });

  it("exposes assignments from the active version-two pile plan", () => {
    const project = JSON.parse(sampleProjectText);
    const selectedPiles = {
      "1": { pile: { pile_size_mm: 320, pile_tip_level_m_key: -18500 } },
    };
    project.schema_version = 2;
    project.user_state = {
      pile_plans: [
        {
          id: "inactive",
          name: "Inactive",
          selected_piles: {},
          locked_load_point_ids: [],
        },
        {
          id: "active",
          name: "Active",
          selected_piles: selectedPiles,
          locked_load_point_ids: [1],
        },
      ],
      active_pile_plan_id: "active",
      manual_cpt_selections: project.user_state.manual_cpt_selections,
    };

    const state = createInitialProjectState(project, { initializeDefaultPiles: false });

    assert.equal(state.activePilePlanId, "active");
    assert.equal(state.pilePlans.length, 2);
    assert.equal(state.selectedPileOptionKeysByLoadPoint.get(1), "320|-18.5");
  });

  it("summarizes imported project sources for the project explorer", () => {
    const state = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: true });

    assert.deepEqual(
      state.inputSources.map((source) => source.kind),
      ["load_points", "cpts", "bearing_capacities"],
    );
    assert.deepEqual(
      state.inputSources.map((source) => source.status),
      ["snapshot-only", "snapshot-only", "snapshot-only"],
    );
    assert.equal(state.inputSources[0].itemCount, state.loadPoints.length);
    assert.equal(state.inputSources[1].itemCount, state.cpts.length);
    assert.equal(state.inputSources[2].itemCount, state.bearingCapacities.length);
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
