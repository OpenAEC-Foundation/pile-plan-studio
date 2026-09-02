import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getOptimizationConflictDetails } from "./optimizationConflict.ts";

describe("optimization group conflict details", () => {
  it("identifies group members without a valid pile option", () => {
    const details = getOptimizationConflictDetails({
      loadPointId: 1,
      reason: "group_member_without_valid_option",
      groups: [{ load_point_ids: [1, 2, 3] }],
      optionsByLoadPointId: new Map([
        [1, [{ isOption: true }]],
        [2, [{ isOption: false }]],
        [3, []],
      ]),
    });

    assert.deepEqual(details, {
      kind: "group_member_without_valid_option",
      relatedLoadPointIds: [2, 3],
      countsWithinOptimizationLimits: false,
    });
  });

  it("does not treat group conflicts as optimizer-limit outcomes", () => {
    const commonInput = {
      loadPointId: 1,
      groups: [{ load_point_ids: [1, 2] }],
      optionsByLoadPointId: new Map<number, Array<{ isOption: boolean }>>(),
    };

    assert.equal(getOptimizationConflictDetails({
      ...commonInput,
      reason: "group_member_without_valid_option",
    })?.countsWithinOptimizationLimits, false);
    assert.equal(getOptimizationConflictDetails({
      ...commonInput,
      reason: "no_common_group_configuration",
    })?.countsWithinOptimizationLimits, false);
    assert.equal(getOptimizationConflictDetails({
      ...commonInput,
      reason: "configuration_limits",
    })?.countsWithinOptimizationLimits, true);
  });
});
