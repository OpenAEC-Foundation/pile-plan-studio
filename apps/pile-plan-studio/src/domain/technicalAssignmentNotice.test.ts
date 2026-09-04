import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TechnicalAssignmentIssue } from "../core/technicalAssignmentContract.ts";
import {
  getAnalysisFailureNotice,
  getMultiSelectionAssignmentSummary,
  getNeutralUnassignedNotice,
  getOptimizerUnassignedNotices,
  getTechnicalAssignmentNotice,
} from "./technicalAssignmentNotice.ts";

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
  it("exposes one detailed notice for an analysis failure", () => {
    assert.deepEqual(getAnalysisFailureNotice({
      assessmentStatus: "error",
      error: new Error("Failed to fetch"),
    }), { detail: "Failed to fetch" });
    assert.equal(getAnalysisFailureNotice({
      assessmentStatus: "ready",
      error: new Error("stale"),
    }), null);
  });

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

describe("multi-selection assignment summary", () => {
  it("counts each selected unassigned location once by its primary reason", () => {
    const missingIssue: TechnicalAssignmentIssue = {
      ...issue,
      load_point_id: 6,
      status: "missing_capacity_data",
    };
    const insufficientIssue: TechnicalAssignmentIssue = {
      ...issue,
      load_point_id: 7,
      status: "insufficient_capacity",
    };

    assert.deepEqual(getMultiSelectionAssignmentSummary({
      selectedLoadPointIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10],
      assignedLoadPointIds: new Set([1, 2, 3, 4, 5, 10]),
      assessmentStatus: "ready",
      issuesByLoadPointId: new Map([
        [6, missingIssue],
        [7, insufficientIssue],
        [10, insufficientIssue],
      ]),
      optimizerReasonsByLoadPointId: new Map([
        [7, "configuration_limits"],
        [8, "optimization_constraints"],
      ]),
    }), {
      selectedCount: 10,
      unassignedCount: 4,
      categories: [
        { kind: "missing_capacity_data", count: 1 },
        { kind: "insufficient_capacity", count: 1 },
        { kind: "optimization_constraints", count: 1 },
        { kind: "unassigned", count: 1 },
      ],
    });
  });

  it("summarizes pending analysis but stays hidden for one selection or no missing assignments", () => {
    const common = {
      issuesByLoadPointId: new Map<number, TechnicalAssignmentIssue>(),
      optimizerReasonsByLoadPointId: new Map<number, "configuration_limits">(),
    };
    assert.deepEqual(getMultiSelectionAssignmentSummary({
      ...common,
      selectedLoadPointIds: [12, 14, 16],
      assignedLoadPointIds: new Set([12]),
      assessmentStatus: "loading",
    }), {
      selectedCount: 3,
      unassignedCount: 2,
      categories: [{ kind: "pending", count: 2 }],
    });
    assert.equal(getMultiSelectionAssignmentSummary({
      ...common,
      selectedLoadPointIds: [12],
      assignedLoadPointIds: new Set(),
      assessmentStatus: "ready",
    }), null);
    assert.equal(getMultiSelectionAssignmentSummary({
      ...common,
      selectedLoadPointIds: [12, 14],
      assignedLoadPointIds: new Set([12, 14]),
      assessmentStatus: "ready",
    }), null);
  });
});

describe("neutral unassigned notice", () => {
  it("describes a technically assignable location after its assignment is cleared", () => {
    assert.deepEqual(getNeutralUnassignedNotice({
      selectedLoadPointIds: [12],
      assignedLoadPointIds: new Set(),
      assessmentStatus: "ready",
      technicalIssueLoadPointIds: new Set(),
      optimizerUnassignedLoadPointIds: new Set(),
    }), { kind: "unassigned", loadPointIds: [12] });
  });

  it("describes pending and failed analysis with the same neutral marker family", () => {
    const common = {
      selectedLoadPointIds: [12],
      assignedLoadPointIds: new Set<number>(),
      technicalIssueLoadPointIds: new Set<number>(),
      optimizerUnassignedLoadPointIds: new Set<number>(),
    };
    assert.deepEqual(getNeutralUnassignedNotice({ ...common, assessmentStatus: "loading" }), {
      kind: "pending",
      loadPointIds: [12],
    });
    assert.deepEqual(getNeutralUnassignedNotice({ ...common, assessmentStatus: "error" }), {
      kind: "analysis-error",
      loadPointIds: [12],
    });
  });

  it("leaves technical and optimizer-specific causes to their dedicated notices", () => {
    const common = {
      selectedLoadPointIds: [12],
      assignedLoadPointIds: new Set<number>(),
      assessmentStatus: "ready" as const,
    };
    assert.equal(getNeutralUnassignedNotice({
      ...common,
      technicalIssueLoadPointIds: new Set([12]),
      optimizerUnassignedLoadPointIds: new Set(),
    }), null);
    assert.equal(getNeutralUnassignedNotice({
      ...common,
      technicalIssueLoadPointIds: new Set(),
      optimizerUnassignedLoadPointIds: new Set([12]),
    }), null);
  });
});

describe("optimizer unassigned notice", () => {
  it("groups selected unassigned locations by their optimizer reason", () => {
    assert.deepEqual(getOptimizerUnassignedNotices({
      selectedLoadPointIds: [14, 12, 15, 12, 16],
      assignedLoadPointIds: new Set([16]),
      assessmentStatus: "ready",
      reasonsByLoadPointId: new Map([
        [12, "optimization_constraints"],
        [14, "configuration_limits"],
        [15, "optimization_constraints"],
        [16, "configuration_limits"],
      ]),
    }), [
      { reason: "optimization_constraints", loadPointIds: [12, 15] },
      { reason: "configuration_limits", loadPointIds: [14] },
    ]);
  });

  it("does not replace pending analysis or describe locations without an optimizer reason", () => {
    const common = {
      selectedLoadPointIds: [12, 14],
      assignedLoadPointIds: new Set<number>(),
      reasonsByLoadPointId: new Map([[12, "configuration_limits" as const]]),
    };

    assert.deepEqual(getOptimizerUnassignedNotices({ ...common, assessmentStatus: "loading" }), []);
    assert.deepEqual(getOptimizerUnassignedNotices({
      ...common,
      selectedLoadPointIds: [14],
      assessmentStatus: "ready",
    }), []);
  });
});
