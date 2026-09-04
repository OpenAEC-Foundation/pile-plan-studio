import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PilePlanData } from "../core/projectFile.ts";
import { summarizePilePlanCosts, summarizeProjectCosts } from "./projectCostSummary.ts";

describe("project cost summary", () => {
  it("sums known pile costs", () => {
    assert.deepEqual(summarizeProjectCosts([1000, 2500, 500]), {
      missingCount: 0,
      totalCost: 4000,
    });
  });

  it("counts missing pile costs without adding them to the total", () => {
    assert.deepEqual(summarizeProjectCosts([1000, null, undefined, 500]), {
      missingCount: 2,
      totalCost: 1500,
    });
  });

  it("summarizes every plan and ignores load points without an assignment", () => {
    const plans: PilePlanData[] = [
      {
        id: "pile-plan-1",
        name: "Basisplan",
        selectedPileConfigurationsByLoadPoint: new Map([
          [1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
          [2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
        ]),
        externalReferencesByLoadPoint: new Map(),
        lockedLoadPointIds: [],
        optimizationUnassignedByLoadPoint: new Map(),
      },
      {
        id: "pile-plan-2",
        name: "Variant 1",
        selectedPileConfigurationsByLoadPoint: new Map([
          [3, { pile_size_mm: 350, pile_tip_level_mm: -19_000 }],
        ]),
        externalReferencesByLoadPoint: new Map(),
        lockedLoadPointIds: [],
        optimizationUnassignedByLoadPoint: new Map(),
      },
    ];

    assert.deepEqual(summarizePilePlanCosts(plans, new Map([
      ["290|-18000", 100],
      ["350|-19000", 250],
    ])), new Map([
      ["pile-plan-1", { missingCount: 1, totalCost: 100 }],
      ["pile-plan-2", { missingCount: 0, totalCost: 250 }],
    ]));
  });
});
