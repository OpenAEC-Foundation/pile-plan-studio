import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidPileTipLevelError,
  assertValidIfcppProjectOutcome,
  validatedProjectFromCore,
  validatedIfcppProjectOutcomeFromCore,
} from "./pileTipLevelContract.ts";

describe("pile tip level runtime contract", () => {
  it("maps a valid normalized project and its ordered millimetre keys", () => {
    const outcome = validatedIfcppProjectOutcomeFromCore({
      status: "valid",
      project: { schema: "IFCPP", schema_version: 4 },
      keys: {
        bearing_capacities: [-18_250],
        pile_plans: [{ id: "pile-plan-1", active: [-18_000, -18_250] }],
        legend: [-18_250],
      },
    });

    assert.equal(outcome.status, "valid");
    if (outcome.status !== "valid") return;
    assert.equal(outcome.project.schema_version, 4);
    assert.deepEqual(outcome.keys, {
      bearingCapacities: [-18_250],
      pilePlans: [{ id: "pile-plan-1", active: [-18_000, -18_250] }],
      legend: [-18_250],
    });
  });

  it("maps every structured violation and throws the typed error", () => {
    const outcome = validatedIfcppProjectOutcomeFromCore({
      status: "invalid",
      errors: [{
        value: "-18.5004",
        reason: "submillimetre",
        context: {
          kind: "bearing-capacity",
          index: 0,
          cpt_id: 61,
          pile_size_mm: 290,
        },
      }],
    });

    assert.deepEqual(outcome, {
      status: "invalid",
      errors: [{
        value: "-18.5004",
        reason: "submillimetre",
        context: {
          kind: "bearing-capacity",
          index: 0,
          cptId: 61,
          pileSizeMm: 290,
        },
      }],
    });
    assert.throws(
      () => assertValidIfcppProjectOutcome(outcome),
      InvalidPileTipLevelError,
    );
  });

  it("maps validated import and refresh results through the same key contract", () => {
    const outcome = validatedProjectFromCore({
      project: { schema: "IFCPP", schema_version: 4 },
      keys: {
        bearing_capacities: [-18_250],
        pile_plans: [{ id: "pile-plan-1", active: [-18_250] }],
        legend: [],
      },
    });

    assert.equal(outcome.status, "valid");
    assert.deepEqual(outcome.keys.bearingCapacities, [-18_250]);
    assert.deepEqual(outcome.keys.pilePlans[0].active, [-18_250]);
  });
});
