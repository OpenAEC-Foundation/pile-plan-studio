import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TechnicalAssignmentAssessment } from "../../core/technicalAssignmentContract.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import {
  buildTechnicalAssignmentSignature,
  createTechnicalAssignmentController,
} from "./technicalAssignmentController.ts";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function option(status: PileConfigurationOption["technicalStatus"]): PileConfigurationOption {
  return {
    configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
    pile_size_mm: 320,
    pile_tip_level_m: -18,
    isOption: status === "valid",
    governing_cpt_id: status === "missing_capacity_data" ? null : 10,
    governing_frd_kn: status === "missing_capacity_data" ? null : 1_000,
    utilization: status === "missing_capacity_data" ? null : 0.8,
    missing_cpt_ids: status === "missing_capacity_data" ? [3] : [],
    technicalStatus: status,
  };
}

const AVAILABLE: TechnicalAssignmentAssessment = { availability: "available", issues: [] };

describe("technical assignment controller", () => {
  it("publishes loading and an indexed ready assessment", async () => {
    const response = deferred<TechnicalAssignmentAssessment>();
    const controller = createTechnicalAssignmentController(() => response.promise);
    const states: string[] = [];
    controller.subscribe((snapshot) => states.push(snapshot.status));

    const update = controller.update({
      groups: [{ load_point_ids: [1] }],
      optionsByLoadPoint: new Map([[1, [option("missing_capacity_data")]]]),
    });
    response.resolve({
      availability: "available",
      issues: [{
        load_point_id: 1,
        cause: "no_valid_option",
        status: "missing_capacity_data",
        group_load_point_ids: [1],
        blocking_load_point_ids: [1],
        missing_cpt_ids: [3],
        has_missing_capacity_data: false,
      }],
    });
    await update;

    assert.deepEqual(states, ["idle", "loading", "ready"]);
    assert.equal(controller.getState().issuesByLoadPointId.get(1)?.cause, "no_valid_option");
  });

  it("publishes unavailable separately from errors", async () => {
    const controller = createTechnicalAssignmentController(async () => ({
      availability: "no_pile_configurations",
      issues: [],
    }));
    await controller.update({ groups: [{ load_point_ids: [1] }], optionsByLoadPoint: new Map([[1, []]]) });
    assert.equal(controller.getState().status, "unavailable");

    const error = new Error("assessment failed");
    const failing = createTechnicalAssignmentController(async () => { throw error; });
    await failing.update({ groups: [], optionsByLoadPoint: new Map() });
    assert.deepEqual(failing.getState(), {
      status: "error",
      assessment: null,
      issuesByLoadPointId: new Map(),
      error,
    });
  });

  it("reuses a completed signature and ignores stale responses", async () => {
    const responses = [deferred<TechnicalAssignmentAssessment>(), deferred<TechnicalAssignmentAssessment>()];
    let calls = 0;
    const controller = createTechnicalAssignmentController(() => responses[calls++].promise);
    const firstInput = { groups: [{ load_point_ids: [1] }], optionsByLoadPoint: new Map([[1, [option("valid")]]]) };
    const secondInput = { groups: [{ load_point_ids: [1] }], optionsByLoadPoint: new Map([[1, [option("insufficient_capacity")]]]) };

    const older = controller.update(firstInput);
    const newer = controller.update(secondInput);
    responses[1].resolve(AVAILABLE);
    await newer;
    responses[0].resolve({ availability: "no_pile_configurations", issues: [] });
    await older;
    await controller.update(secondInput);

    assert.equal(calls, 2);
    assert.equal(controller.getState().status, "ready");
  });

  it("builds an order-independent signature containing technical facts", () => {
    const valid = option("valid");
    const missing = option("missing_capacity_data");
    const first = buildTechnicalAssignmentSignature({
      groups: [{ load_point_ids: [2, 1] }],
      optionsByLoadPoint: new Map([[2, [missing]], [1, [valid]]]),
    });
    const reordered = buildTechnicalAssignmentSignature({
      groups: [{ load_point_ids: [1, 2] }],
      optionsByLoadPoint: new Map([[1, [valid]], [2, [missing]]]),
    });
    assert.equal(first, reordered);
    assert.notEqual(first, buildTechnicalAssignmentSignature({
      groups: [{ load_point_ids: [1, 2] }],
      optionsByLoadPoint: new Map([[1, [valid]], [2, [option("insufficient_capacity")]]]),
    }));
  });

  it("does not publish after disposal", async () => {
    const response = deferred<TechnicalAssignmentAssessment>();
    const controller = createTechnicalAssignmentController(() => response.promise);
    const states: string[] = [];
    controller.subscribe((snapshot) => states.push(snapshot.status));
    const update = controller.update({ groups: [], optionsByLoadPoint: new Map() });
    controller.dispose();
    response.resolve(AVAILABLE);
    await update;
    assert.deepEqual(states, ["idle", "loading"]);
  });
});
