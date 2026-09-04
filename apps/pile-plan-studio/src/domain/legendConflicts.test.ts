import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import { createBuiltInLegend } from "../viewer/legend.ts";
import { findCoactiveLegendConflicts } from "./legendConflicts.ts";

function plan(id: string, activeTips: number[]): PilePlanData {
  return {
    id,
    name: id,
    activePileSizes: [290],
    activePileTipLevels: activeTips,
    selectedPileConfigurationsByLoadPoint: new Map(),
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
});
