import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import { createBuiltInLegend } from "../viewer/legend.ts";
import { findCoactiveLegendConflicts, getLegendValuePlanUsage } from "./legendConflicts.ts";

function plan(
  id: string,
  activeTips: number[],
  assignments: Array<[number, number]> = [],
): PilePlanData {
  return {
    id,
    name: id,
    activePileSizes: [290],
    activePileTipLevels: activeTips,
    selectedPileConfigurationsByLoadPoint: new Map(assignments.map(([loadPointId, tipLevelMm]) => [
      loadPointId,
      { pile_size_mm: 290, pile_tip_level_mm: tipLevelMm },
    ])),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds: [],
    optimizationUnassignedByLoadPoint: new Map(),
  };
}

describe("co-active legend conflicts", () => {
  it("warns only when duplicate colors are active together in a plan", () => {
    const legend = createBuiltInLegend([
      { cpt_id: 1, pile_tip_level_m: -18, pile_size_mm: 290, frd_kn: 700 },
      { cpt_id: 1, pile_tip_level_m: -19, pile_size_mm: 290, frd_kn: 700 },
    ]);
    legend.pileTipLevels[1].color = legend.pileTipLevels[0].color.toLowerCase();

    assert.deepEqual(findCoactiveLegendConflicts(legend, [
      plan("a", [-18]),
      plan("b", [-19]),
    ]), []);
    assert.deepEqual(findCoactiveLegendConflicts(legend, [
      plan("a", [-18]),
      plan("b", [-18, -19]),
    ]), [{ property: "color", values: [-18, -19], pilePlanIds: ["b"] }]);
  });

  it("separates outside-scope activation from actual location assignments", () => {
    const usage = getLegendValuePlanUsage({
      plans: [
        plan("current", [-18], [[1, -18_000], [2, -18_000]]),
        plan("in-scope", [-18], [[3, -18_000]]),
        plan("active-outside", [-18]),
        plan("assigned-outside", [], [[4, -18_000]]),
        plan("irrelevant", [-19], [[5, -19_000]]),
      ],
      currentPlanId: "current",
      scopePlanIds: new Set(["current", "in-scope"]),
      kind: "tip",
      value: -18,
    });

    assert.deepEqual(usage, {
      current: { planId: "current", planName: "current", active: true, assignmentCount: 2 },
      inScope: [
        { planId: "in-scope", planName: "in-scope", active: true, assignmentCount: 1 },
      ],
      outsideScope: [
        { planId: "active-outside", planName: "active-outside", active: true, assignmentCount: 0 },
        { planId: "assigned-outside", planName: "assigned-outside", active: false, assignmentCount: 1 },
      ],
      activeOutsideScopeCount: 1,
    });
  });
});
