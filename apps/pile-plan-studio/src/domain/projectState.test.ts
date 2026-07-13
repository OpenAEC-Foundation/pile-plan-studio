import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "./projectState.ts";

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
    assert.equal(state.analysisError, null);
    assert.equal(state.defaultPileSelectionPending, true);
  });

  it("preserves stored IFCPP choices without scheduling default selection", () => {
    const project = JSON.parse(sampleProjectText);
    project.user_state.selected_piles = {
      "1": { pile: { pile_size_mm: 290, pile_tip_level_m_key: -18000 } },
    };

    const state = createInitialProjectState(project, { initializeDefaultPiles: false });

    assert.equal(state.defaultPileSelectionPending, false);
    assert.equal(state.selectedPileOptionKeysByLoadPoint.get(1), "290|-18");
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
