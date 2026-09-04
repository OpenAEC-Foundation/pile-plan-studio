import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectContent } from "./projectContent.ts";
import {
  createProjectHistory,
  recordProjectChange,
  redoProjectChange,
  undoProjectChange,
} from "./projectHistory.ts";
import type { HistoryAction } from "./historyAction.ts";

const action: HistoryAction = { kind: "project-name" };

describe("project history", () => {
  it("undoes and redoes one structurally shared content change", () => {
    const before = content("Before");
    const after = { ...before, name: "After" };
    const recorded = recordProjectChange(createProjectHistory(), before, after, action);

    const undone = undoProjectChange(recorded);
    assert.equal(undone?.content, before);
    assert.equal(undone?.entry.action, action);
    assert.equal(undone?.history.past.length, 0);
    assert.equal(undone?.history.future.length, 1);

    const redone = redoProjectChange(undone!.history);
    assert.equal(redone?.content, after);
    assert.equal(redone?.history.past.length, 1);
    assert.equal(redone?.history.future.length, 0);
  });

  it("does not record a content no-op", () => {
    const current = content("Same");
    const history = createProjectHistory();

    assert.equal(recordProjectChange(history, current, current, action), history);
  });

  it("clears redo when a new change follows undo", () => {
    const first = content("First");
    const second = { ...first, name: "Second" };
    const third = { ...first, name: "Third" };
    const history = recordProjectChange(createProjectHistory(), first, second, action);
    const undone = undoProjectChange(history)!;

    const branched = recordProjectChange(undone.history, first, third, action);

    assert.equal(branched.future.length, 0);
    assert.equal(branched.past.length, 1);
    assert.equal(branched.past[0].after, third);
  });

  it("retains only the newest fifty completed actions", () => {
    let history = createProjectHistory();
    let before = content("0");
    for (let index = 1; index <= 55; index += 1) {
      const after = { ...before, name: String(index) };
      history = recordProjectChange(history, before, after, action);
      before = after;
    }

    assert.equal(history.past.length, 50);
    assert.equal(history.past[0].before.name, "5");
    assert.equal(history.past[49].after.name, "55");
  });
});

function content(name: string): ProjectContent {
  return {
    name,
    loadPoints: [],
    cpts: [],
    bearingCapacities: [],
    globalCptSelectionSettings: {
      algorithm: "quadrants",
      maxDistanceM: 25,
      monopolyDistanceM: 1,
      maxAngleDegrees: 120,
    },
    cptSelectionSettingsByLoadPoint: new Map(),
    pileCostSettings: { schema_version: 1, pile_head_level_m: 0, items: [] },
    optimizationSettings: {
      max_pile_sizes: 1,
      max_pile_tip_levels: 1,
      max_pile_configurations: 1,
      max_utilization: 1,
      enabled_pile_sizes: [],
      enabled_pile_tip_levels: [],
    },
    viewerUtilizationSettings: { minimum: 0, maximum: 1 },
    activePileSizes: [],
    activePileTipLevels: [],
    pilePlans: [{
      id: "plan-1",
      name: "Plan 1",
      selectedPileConfigurationsByLoadPoint: new Map(),
      externalReferencesByLoadPoint: new Map(),
      lockedLoadPointIds: [],
      optimizationUnassignedByLoadPoint: new Map(),
    }],
    manualCptIdsByLoadPoint: new Map(),
  };
}
