import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyLoadPointGroupAssignmentCore,
  deriveLoadPointGroupsCore,
  exportPilePlanCsvCore,
  exportPilePlanXlsxCore,
  greedyOptimizeCore,
  previewPilePlanImportCore,
} from "./pilePlanCoreClient.ts";

describe("pile-plan core client", () => {
  it("owns grouping, optimization, import, and export commands", () => {
    assert.equal([
      applyLoadPointGroupAssignmentCore,
      deriveLoadPointGroupsCore,
      exportPilePlanCsvCore,
      exportPilePlanXlsxCore,
      greedyOptimizeCore,
      previewPilePlanImportCore,
    ].every((command) => typeof command === "function"), true);
  });
});
