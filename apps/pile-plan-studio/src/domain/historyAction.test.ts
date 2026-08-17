import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferHistoryAction } from "./historyAction.ts";
import type { ProjectContent } from "./projectContent.ts";
import type { PilePlanData } from "../core/projectFile.ts";

describe("history action inference", () => {
  it("counts pile changes and names the affected plan", () => {
    const before = content();
    const after = {
      ...before,
      pilePlans: [plan("plan-1", "Plan 1", [[1, "a"], [2, "b"]])],
    };

    assert.deepEqual(inferHistoryAction(before, after), {
      kind: "pile-change",
      count: 2,
      pilePlanName: "Plan 1",
    });
  });

  it("counts load points with changed manual CPT selections", () => {
    const before = content();
    const after = {
      ...before,
      manualCptIdsByLoadPoint: new Map([[1, [10]], [2, [11, 12]]]),
    };

    assert.deepEqual(inferHistoryAction(before, after), {
      kind: "cpt-selection",
      count: 2,
    });
  });

  it("recognizes CPT and cost settings", () => {
    const before = content();
    assert.deepEqual(inferHistoryAction(before, {
      ...before,
      globalCptSelectionSettings: { ...before.globalCptSelectionSettings, maxDistanceM: 30 },
    }), { kind: "cpt-settings" });
    assert.deepEqual(inferHistoryAction(before, {
      ...before,
      pileCostSettings: { ...before.pileCostSettings, pile_head_level_m: 1 },
    }), { kind: "cost-settings" });
  });

  it("recognizes a project legend appearance change", () => {
    const before = content();
    const after = {
      ...before,
      pileLegend: { ...before.pileLegend, encodingMode: "tip-symbol" as const },
    };

    assert.deepEqual(inferHistoryAction(before, after), { kind: "legend-settings" });
  });

  it("recognizes plan creation, deletion, renaming, and locking", () => {
    const before = content();
    const second = plan("plan-2", "Variant 2");
    assert.deepEqual(inferHistoryAction(before, {
      ...before,
      pilePlans: [...before.pilePlans, second],
    }), { kind: "pile-plan-created", pilePlanName: "Variant 2" });
    assert.deepEqual(inferHistoryAction({ ...before, pilePlans: [...before.pilePlans, second] }, before), {
      kind: "pile-plan-deleted",
      pilePlanName: "Variant 2",
    });
    assert.deepEqual(inferHistoryAction(before, {
      ...before,
      pilePlans: [{ ...before.pilePlans[0], name: "Renamed" }],
    }), { kind: "pile-plan-renamed", pilePlanName: "Renamed" });
    assert.deepEqual(inferHistoryAction(before, {
      ...before,
      pilePlans: [{ ...before.pilePlans[0], lockedLoadPointIds: [1, 2, 3] }],
    }), { kind: "locks", count: 3, pilePlanName: "Plan 1" });
  });

  it("prioritizes a source import over settings retained by that import", () => {
    const before = content();
    const after = {
      ...before,
      loadPoints: [{ id: 1, name: "1", x_mm: 0, y_mm: 0, design_load_kn: 10 }],
      pileCostSettings: { ...before.pileCostSettings, pile_head_level_m: 1 },
    };

    assert.deepEqual(inferHistoryAction(before, after), { kind: "project-import" });
  });
});

function content(): ProjectContent {
  return {
    name: "Project",
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
    pileLegend: {
      encodingMode: "size-symbol",
      pileSizes: [],
      pileTipLevels: [],
    },
    pilePlans: [plan("plan-1", "Plan 1")],
    manualCptIdsByLoadPoint: new Map(),
  };
}

function plan(
  id: string,
  name: string,
  choices: Array<[number, string]> = [],
): PilePlanData {
  return {
    id,
    name,
    selectedPileOptionKeysByLoadPoint: new Map(choices),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds: [],
  };
}
