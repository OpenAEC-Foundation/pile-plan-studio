import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ProjectDocumentReadError } from "../../core/projectDocumentContract.ts";
import {
  describeProjectOpenError,
  getLoadPointLockSignature,
  importRoleForSource,
} from "./appSessionSupport.ts";
import * as appSessionSupport from "./appSessionSupport.ts";

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

  it("records the explicit history action for every load-point group edit", () => {
    const historyAction = (
      appSessionSupport as typeof appSessionSupport & {
        getLoadPointGroupEditHistoryAction?: (action: string) => { kind: string };
      }
    ).getLoadPointGroupEditHistoryAction;

    assert.deepEqual(historyAction?.("group"), { kind: "group-created" });
    assert.deepEqual(historyAction?.("ungroup"), { kind: "group-removed" });
    assert.deepEqual(historyAction?.("reset_overrides"), { kind: "group-overrides-reset" });
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
