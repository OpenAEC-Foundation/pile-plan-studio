import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ProjectDocumentReadError } from "../../core/projectDocumentContract.ts";
import {
  describeProjectOpenError,
  getLoadPointLockSignature,
  importRoleForSource,
} from "./appSessionSupport.ts";

describe("app session support", () => {
  it("maps every source kind to its import role", () => {
    assert.equal(importRoleForSource("load_points"), "load-points");
    assert.equal(importRoleForSource("bearing_capacities"), "bearing-capacities");
    assert.equal(importRoleForSource("cpts"), "cpts");
  });

  it("creates a stable sorted signature for active-plan locks", () => {
    assert.equal(getLoadPointLockSignature([
      {
        id: "plan-1",
        name: "Plan",
        selectedPileConfigurationsByLoadPoint: new Map(),
        activePileSizesMm: [],
        activePileTipLevelsMm: [],
        lockedLoadPointIds: [9, 2, 5],
        optimizationUnassignedByLoadPoint: new Map(),
      },
    ], "plan-1"), "2,5,9");
  });

  it("translates structured open errors and preserves ordinary errors", () => {
    const translate = (key: string) => key;
    assert.equal(describeProjectOpenError(new Error("boom"), translate), "boom");
    assert.equal(
      describeProjectOpenError(new ProjectDocumentReadError({ code: "invalid-json" }), translate),
      "projectDocument.errors.invalid-json",
    );
  });
});
