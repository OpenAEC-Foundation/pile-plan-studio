import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyLoadPointGroupAssignmentCore,
  applyLoadPointGroupEditCore,
  assessLoadPointGroupAssignmentsCore,
  deriveLoadPointGroupsCore,
  exportPilePlanCsvCore,
  exportPilePlanXlsxCore,
  previewPilePlanImportCore,
  previewLoadPointGroupEditCore,
} from "./pilePlanCoreClient.ts";

describe("pile-plan core client", () => {
  it("owns grouping, optimization, import, and export commands", () => {
    assert.equal([
      applyLoadPointGroupAssignmentCore,
      applyLoadPointGroupEditCore,
      assessLoadPointGroupAssignmentsCore,
      deriveLoadPointGroupsCore,
      exportPilePlanCsvCore,
      exportPilePlanXlsxCore,
      previewPilePlanImportCore,
      previewLoadPointGroupEditCore,
    ].every((command) => typeof command === "function"), true);
  });
});
