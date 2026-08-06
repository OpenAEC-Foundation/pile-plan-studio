import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "./projectState.ts";
import {
  captureProjectContent,
  normalizeProjectContentState,
  restoreProjectContent,
} from "./projectContent.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

describe("project content", () => {
  it("captures source references without derived or transient viewer state", () => {
    const state = normalizeProjectContentState(createInitialProjectState(
      sampleProjectText,
      { initializeDefaultPiles: false },
    ));

    const content = captureProjectContent(state);

    assert.equal(content.loadPoints, state.loadPoints);
    assert.equal(content.cpts, state.cpts);
    assert.equal(content.bearingCapacities, state.bearingCapacities);
    assert.equal(content.pilePlans, state.pilePlans);
    assert.equal("pileOptionsByLoadPointId" in content, false);
    assert.equal("selectedCptsByLoadPointId" in content, false);
    assert.equal("viewport" in content, false);
    assert.equal("activePilePlanId" in content, false);
  });

  it("normalizes active pile choices into the active plan without copying project inputs", () => {
    const state = createInitialProjectState(sampleProjectText, { initializeDefaultPiles: false });
    const selectedPileOptionKeysByLoadPoint = new Map([[1, "320|-18.5"]]);

    const normalized = normalizeProjectContentState({
      ...state,
      selectedPileOptionKeysByLoadPoint,
    });

    assert.notEqual(normalized.pilePlans, state.pilePlans);
    assert.equal(
      normalized.pilePlans.find((plan) => plan.id === normalized.activePilePlanId)
        ?.selectedPileOptionKeysByLoadPoint,
      selectedPileOptionKeysByLoadPoint,
    );
    assert.equal(normalized.loadPoints, state.loadPoints);
    assert.equal(normalized.cpts, state.cpts);
    assert.equal(normalized.bearingCapacities, state.bearingCapacities);
  });

  it("restores content while preserving valid navigation and transient state", () => {
    const original = normalizeProjectContentState(createInitialProjectState(
      sampleProjectText,
      { initializeDefaultPiles: false },
    ));
    const content = captureProjectContent(original);
    const changed = {
      ...original,
      name: "Changed",
      viewport: { scale: 3, offsetX: 80, offsetY: -20 },
      selectedLoadPointIds: [original.loadPoints[2].id],
      selectedLoadPointId: original.loadPoints[2].id,
    };

    const restored = restoreProjectContent(changed, content);

    assert.equal(restored.state.name, original.name);
    assert.equal(restored.state.viewport, changed.viewport);
    assert.equal(restored.state.selectedLoadPointIds, changed.selectedLoadPointIds);
    assert.equal(restored.state.activePilePlanId, changed.activePilePlanId);
    assert.equal(restored.analysisScope, "none");
  });

  it("falls back to an existing plan when restored content removes the active plan", () => {
    const state = normalizeProjectContentState(createInitialProjectState(
      sampleProjectText,
      { initializeDefaultPiles: false },
    ));
    const first = state.pilePlans[0];
    const second = {
      ...first,
      id: "second",
      name: "Second",
      selectedPileOptionKeysByLoadPoint: new Map([[1, "320|-18.5"]]),
    };
    const current = {
      ...state,
      pilePlans: [first, second],
      activePilePlanId: second.id,
      selectedPileOptionKeysByLoadPoint: second.selectedPileOptionKeysByLoadPoint,
    };
    const content = {
      ...captureProjectContent(current),
      pilePlans: [first],
    };

    const restored = restoreProjectContent(current, content, { fallbackPilePlanId: first.id });

    assert.equal(restored.state.activePilePlanId, first.id);
    assert.equal(
      restored.state.selectedPileOptionKeysByLoadPoint,
      first.selectedPileOptionKeysByLoadPoint,
    );
  });

  it("requests analysis only for load points whose CPT source selection changed", () => {
    const state = normalizeProjectContentState(createInitialProjectState(
      sampleProjectText,
      { initializeDefaultPiles: false },
    ));
    const loadPointId = state.loadPoints[0].id;
    const before = captureProjectContent(state);
    const after = {
      ...before,
      manualCptIdsByLoadPoint: new Map(before.manualCptIdsByLoadPoint).set(loadPointId, [1]),
    };

    const restored = restoreProjectContent(state, after);

    assert.deepEqual(restored.analysisScope, [loadPointId]);
  });

  it("requests full analysis when imported foundation advice changes", () => {
    const state = normalizeProjectContentState(createInitialProjectState(
      sampleProjectText,
      { initializeDefaultPiles: false },
    ));
    const before = captureProjectContent(state);
    const after = {
      ...before,
      bearingCapacities: before.bearingCapacities.slice(1),
    };

    assert.equal(restoreProjectContent(state, after).analysisScope, "all");
  });
});
