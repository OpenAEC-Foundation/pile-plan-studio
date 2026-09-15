import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  aggregatePileOptionsCore,
  assessTechnicalAssignmentCore,
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
  calculatePileCostCore,
  calculatePileOptionAnalysisCore,
  chooseDefaultPileOptionsCore,
} from "./analysisCoreClient.ts";

describe("analysis core client", () => {
  it("owns the analysis-facing commands", () => {
    assert.equal([
      aggregatePileOptionsCore,
      assessTechnicalAssignmentCore,
      buildLoadPointTopologyCore,
      buildTipLevelRegionTopologyCore,
      calculatePileCostCore,
      calculatePileOptionAnalysisCore,
      chooseDefaultPileOptionsCore,
    ].every((command) => typeof command === "function"), true);
  });
});
