import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeProjectCosts } from "./projectCostSummary.ts";

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
});
