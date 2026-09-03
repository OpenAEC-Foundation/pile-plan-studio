import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TechnicalAssignmentIssue } from "../core/technicalAssignmentContract.ts";
import { getTechnicalAssignmentNotice } from "./technicalAssignmentNotice.ts";

const issue: TechnicalAssignmentIssue = {
  load_point_id: 12,
  cause: "group_member_without_valid_option",
  status: "insufficient_capacity",
  group_load_point_ids: [14, 12, 12],
  blocking_load_point_ids: [14],
  missing_cpt_ids: [62],
  has_missing_capacity_data: true,
};

describe("technical assignment notice", () => {
  it("returns a normalized model for one selected affected location", () => {
    const model = getTechnicalAssignmentNotice({
      selectedLoadPointIds: [12],
      assessmentStatus: "ready",
      issuesByLoadPointId: new Map([[12, issue]]),
    });

    assert.deepEqual(model, {
      loadPointId: 12,
      cause: "group_member_without_valid_option",
      status: "insufficient_capacity",
      loadPointIds: [12, 14],
      blockingLoadPointIds: [14],
      hasMissingCapacityData: true,
    });
    assert.notEqual(model?.loadPointIds, issue.group_load_point_ids);
  });

  it("keeps the affected location separate from the full group", () => {
    const individualIssue: TechnicalAssignmentIssue = {
      ...issue,
      load_point_id: 14,
      cause: "no_valid_option",
      group_load_point_ids: [12, 14],
      blocking_load_point_ids: [14],
    };

    const model = getTechnicalAssignmentNotice({
      selectedLoadPointIds: [14],
      assessmentStatus: "ready",
      issuesByLoadPointId: new Map([[14, individualIssue]]),
    });

    assert.equal(model?.loadPointId, 14);
    assert.deepEqual(model?.loadPointIds, [12, 14]);
  });

  it("returns null outside a ready single affected selection", () => {
    const common = { issuesByLoadPointId: new Map([[12, issue]]) };
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [], assessmentStatus: "ready" }), null);
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [12, 14], assessmentStatus: "ready" }), null);
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [99], assessmentStatus: "ready" }), null);
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [12], assessmentStatus: "loading" }), null);
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [12], assessmentStatus: "unavailable" }), null);
    assert.equal(getTechnicalAssignmentNotice({ ...common, selectedLoadPointIds: [12], assessmentStatus: "error" }), null);
  });
});
