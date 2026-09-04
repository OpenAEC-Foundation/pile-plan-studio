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
  it("undoes one grouped pile assignment atomically without changing another plan", () => {
    const initial = state();
    const [firstLoadPoint, secondLoadPoint] = initial.loadPoints;
    const original = { pile_size_mm: 290, pile_tip_level_mm: -17_500 };
    const grouped = { pile_size_mm: 320, pile_tip_level_mm: -18_000 };
    const secondary = {
      ...initial.pilePlans[0],
      id: "secondary-plan",
      name: "Secondary",
      selectedPileConfigurationsByLoadPoint: new Map([
        [firstLoadPoint.id, { pile_size_mm: 350, pile_tip_level_mm: -19_000 }],
      ]),
    };
    initial.selectedPileConfigurationsByLoadPoint = new Map([
      [firstLoadPoint.id, original],
      [secondLoadPoint.id, original],
    ]);
    initial.pilePlans = [
      {
        ...initial.pilePlans[0],
        selectedPileConfigurationsByLoadPoint: new Map(initial.selectedPileConfigurationsByLoadPoint),
      },
      secondary,
    ];
    let managed = createManagedProjectState(initial);

    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => {
        const choices = new Map(current.selectedPileConfigurationsByLoadPoint);
        choices.set(firstLoadPoint.id, grouped);
        choices.set(secondLoadPoint.id, grouped);
        return {
          ...current,
          selectedPileConfigurationsByLoadPoint: choices,
          pilePlans: current.pilePlans.map((plan) => plan.id === current.activePilePlanId
            ? { ...plan, selectedPileConfigurationsByLoadPoint: new Map(choices) }
            : plan),
        };
      },
    });
    managed = projectHistoryReducer(managed, { type: "undo" });

    assert.deepEqual(
      managed.present.selectedPileConfigurationsByLoadPoint.get(firstLoadPoint.id),
      original,
    );
    assert.deepEqual(
      managed.present.selectedPileConfigurationsByLoadPoint.get(secondLoadPoint.id),
      original,
    );
    assert.deepEqual(
      managed.present.pilePlans.find(({ id }) => id === secondary.id)
        ?.selectedPileConfigurationsByLoadPoint,
      secondary.selectedPileConfigurationsByLoadPoint,
    );
  });

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
      activation: { pileSizes: [], pileTipLevels: [] },
      kind: "variant",
      language: "en",
    });
    const firstActive = switchPilePlan({ ...initial, ...withSecond, targetPilePlanId: firstId });
    let managed = createManagedProjectState({ ...initial, ...firstActive });
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({
        ...current,
        selectedPileConfigurationsByLoadPoint: new Map([[1, {
          pile_size_mm: 320,
          pile_tip_level_mm: -18_500,
        }]]),
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
        ?.selectedPileConfigurationsByLoadPoint.has(1),
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
          activation: { pileSizes: [320], pileTipLevels: [-18.5] },
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

  it("undoes and redoes activation for the active pile plan", () => {
    const initial = state();
    const activeId = initial.activePilePlanId;
    let managed = createManagedProjectState(initial);
    managed = projectHistoryReducer(managed, {
      type: "commit",
      update: (current) => ({
        ...current,
        pilePlans: current.pilePlans.map((plan) => plan.id === activeId
          ? { ...plan, activePileSizes: [290], activePileTipLevels: [-18] }
          : plan),
      }),
    });

    managed = projectHistoryReducer(managed, { type: "undo" });
    assert.notDeepEqual(
      managed.present.pilePlans.find(({ id }) => id === activeId)?.activePileSizes,
      [290],
    );

    managed = projectHistoryReducer(managed, { type: "redo" });
    assert.deepEqual(
      managed.present.pilePlans.find(({ id }) => id === activeId)?.activePileSizes,
      [290],
    );
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
    const choices = new Map([[1, {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_500,
    }]]);

    managed = projectHistoryReducer(managed, {
      type: "amend",
      update: (current) => ({ ...current, selectedPileConfigurationsByLoadPoint: choices }),
    });

    assert.equal(managed.history.past.length, 1);
    assert.equal(managed.history.past[0].action.kind, "project-import");
    assert.equal(
      managed.history.past[0].after.pilePlans[0].selectedPileConfigurationsByLoadPoint,
      choices,
    );
    managed = projectHistoryReducer(managed, { type: "undo" });
    managed = projectHistoryReducer(managed, { type: "redo" });
    assert.equal(managed.present.selectedPileConfigurationsByLoadPoint, choices);
  });
});

function state() {
  return createInitialProjectState(sampleProjectText, { initializeDefaultPiles: false });
}
