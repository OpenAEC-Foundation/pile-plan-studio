import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "./projectState.ts";
import {
  createManagedProjectState,
  projectHistoryReducer,
} from "./projectHistoryReducer.ts";
import { createPilePlan, switchPilePlan } from "./pilePlanManagement.ts";

const sampleProjectText = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");

describe("project history reducer", () => {
  it("records committed content but not runtime-only viewer changes", () => {
    let managed = createManagedProjectState(state());
    managed = projectHistoryReducer(managed, {
      type: "runtime",
      update: (current) => ({
        ...current,
        viewport: { scale: 2, offsetX: 10, offsetY: 20 },
      }),
    });
    assert.equal(managed.history.past.length, 0);

    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({ ...current, name: "Renamed" }),
    });

    assert.equal(managed.history.past.length, 1);
    assert.equal(managed.history.past[0].action.kind, "project-name");
  });

  it("undoes content while preserving the current transient viewport", () => {
    let managed = createManagedProjectState(state());
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({ ...current, name: "Renamed" }),
    });
    const viewport = { scale: 3, offsetX: 40, offsetY: -20 };
    managed = projectHistoryReducer(managed, {
      type: "runtime",
      update: (current) => ({ ...current, viewport }),
    });

    managed = projectHistoryReducer(managed, { type: "undo" });

    assert.equal(managed.present.name, "Sample Project");
    assert.equal(managed.present.viewport, viewport);
    assert.equal(managed.lastResult?.direction, "undo");
    assert.equal(managed.history.future.length, 1);
  });

  it("keeps the viewed plan when undo changes another existing plan", () => {
    const initial = state();
    const firstId = initial.activePilePlanId;
    const withSecond = createPilePlan({
      ...initial,
      choices: new Map(),
      kind: "variant",
      language: "en",
    });
    const firstActive = switchPilePlan({ ...initial, ...withSecond, targetPilePlanId: firstId });
    let managed = createManagedProjectState({ ...initial, ...firstActive });
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({
        ...current,
        selectedPileOptionKeysByLoadPoint: new Map([[1, "320|-18.5"]]),
      }),
    });
    const secondId = managed.present.pilePlans.find((plan) => plan.id !== firstId)!.id;
    managed = projectHistoryReducer(managed, {
      type: "runtime",
      update: (current) => ({
        ...current,
        ...switchPilePlan({ ...current, targetPilePlanId: secondId }),
      }),
    });

    managed = projectHistoryReducer(managed, { type: "undo" });

    assert.equal(managed.present.activePilePlanId, secondId);
    assert.equal(
      managed.present.pilePlans.find((plan) => plan.id === firstId)
        ?.selectedPileOptionKeysByLoadPoint.has(1),
      false,
    );
  });

  it("switches to a valid previous plan when undo removes the active created plan", () => {
    const initial = state();
    let managed = createManagedProjectState(initial);
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({
        ...current,
        ...createPilePlan({
          ...current,
          choices: new Map([[1, "320|-18.5"]]),
          kind: "variant",
          language: "en",
        }),
      }),
    });
    const createdId = managed.present.activePilePlanId;
    assert.notEqual(createdId, initial.activePilePlanId);

    managed = projectHistoryReducer(managed, { type: "undo" });
    assert.equal(managed.present.activePilePlanId, initial.activePilePlanId);

    managed = projectHistoryReducer(managed, { type: "redo" });
    assert.equal(managed.present.activePilePlanId, createdId);
  });

  it("invalidates analysis only for restored manual CPT selections", () => {
    const initial = state();
    const loadPointId = initial.loadPoints[0].id;
    let managed = createManagedProjectState(initial);
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({
        ...current,
        manualCptIdsByLoadPoint: new Map([[loadPointId, [1]]]),
      }),
    });
    const revision = managed.present.analysisRequest.revision;

    managed = projectHistoryReducer(managed, { type: "undo" });

    assert.equal(managed.present.analysisRequest.revision, revision + 1);
    assert.deepEqual(managed.present.analysisRequest.loadPointIds, [loadPointId]);
    assert.equal(managed.present.pileOptionsByLoadPointId.has(loadPointId), false);
    assert.equal(managed.present.selectedCptsByLoadPointId.has(loadPointId), false);
  });

  it("clears both stacks when another project replaces the current project", () => {
    let managed = createManagedProjectState(state());
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({ ...current, name: "Renamed" }),
    });

    managed = projectHistoryReducer(managed, {
      type: "replace",
      state: { ...state(), name: "Replacement" },
    });

    assert.equal(managed.present.name, "Replacement");
    assert.equal(managed.history.past.length, 0);
    assert.equal(managed.history.future.length, 0);
    assert.equal(managed.lastResult, null);
  });

  it("amends an asynchronous continuation into the latest history entry", () => {
    let managed = createManagedProjectState(state());
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({ ...current, name: "Imported" }),
      action: { kind: "project-import" },
    });
    const choices = new Map([[1, "320|-18.5"]]);

    managed = projectHistoryReducer(managed, {
      type: "amend",
      update: (current) => ({ ...current, selectedPileOptionKeysByLoadPoint: choices }),
    });

    assert.equal(managed.history.past.length, 1);
    assert.equal(managed.history.past[0].action.kind, "project-import");
    assert.equal(
      managed.history.past[0].after.pilePlans[0].selectedPileOptionKeysByLoadPoint,
      choices,
    );
    managed = projectHistoryReducer(managed, { type: "undo" });
    managed = projectHistoryReducer(managed, { type: "redo" });
    assert.equal(managed.present.selectedPileOptionKeysByLoadPoint, choices);
  });
});

function state() {
  return createInitialProjectState(sampleProjectText, { initializeDefaultPiles: false });
}
