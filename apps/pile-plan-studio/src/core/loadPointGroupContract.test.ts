import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  derivedLoadPointGroupsFromCore,
  groupAssignmentConflictsFromCore,
  loadPointGroupEditResultFromCore,
  loadPointGroupAssignmentResultFromCore,
  toApplyLoadPointGroupEditRequest,
  toBrowserGroupAssignmentAssessmentRequest,
  toBrowserLoadPointGroupAssignmentRequest,
  toDeriveLoadPointGroupsRequest,
  toDesktopGroupAssignmentAssessmentRequest,
  toDesktopLoadPointGroupAssignmentRequest,
  toPreviewLoadPointGroupEditRequest,
} from "./loadPointGroupContract.ts";
import type { LoadPoint } from "./projectTypes.ts";

const loadPoints: LoadPoint[] = [
  { id: 2, name: "P2", x_mm: 100, y_mm: 200, design_load_kn: 300 },
];

describe("load point group transport contract", () => {
  it("derives groups with project settings converted to the core distance unit", () => {
    assert.deepEqual(toDeriveLoadPointGroupsRequest(loadPoints, {
      automatic: false,
      maxEdgeDistanceM: 1.25,
      manualGroups: [{ loadPointIds: [3, 1] }, { loadPointIds: [2, 1] }],
      ungroupedGroups: [{ loadPointIds: [4, 2] }],
    }), {
      load_points: loadPoints,
      settings: {
        automatic: false,
        max_edge_distance_mm: 1_250,
        manual_groups: [
          { load_point_ids: [1, 2] },
          { load_point_ids: [1, 3] },
        ],
        ungrouped_groups: [{ load_point_ids: [2, 4] }],
      },
    });

    const source = readFileSync(new URL("./loadPointGroupContract.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /1200|1_200|1\.2/);
  });

  it("keeps numeric assignment maps for the browser runtime", () => {
    const currentAssignments = new Map([
      [2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
    ]);
    const request = toBrowserLoadPointGroupAssignmentRequest({
      selectedLoadPointIds: [2],
      groups: [{ load_point_ids: [1, 2] }],
      requestedConfiguration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
      currentAssignments,
      lockedLoadPointIds: [1],
    });

    assert.equal(request.current_assignments instanceof Map, true);
    assert.deepEqual(request.current_assignments.get(2), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_000,
    });
  });

  it("uses string-keyed assignment records for Tauri", () => {
    const request = toDesktopLoadPointGroupAssignmentRequest({
      selectedLoadPointIds: [2],
      groups: [{ load_point_ids: [1, 2] }],
      requestedConfiguration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
      currentAssignments: new Map([
        [2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }],
      ]),
      lockedLoadPointIds: [1],
    });

    assert.deepEqual(request.current_assignments, {
      "2": { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
    });
  });

  it("preserves an empty requested assignment for both runtimes", () => {
    const input = {
      selectedLoadPointIds: [2],
      groups: [{ load_point_ids: [1, 2] }],
      requestedConfiguration: null,
      currentAssignments: new Map<number, { pile_size_mm: number; pile_tip_level_mm: number }>(),
      lockedLoadPointIds: [],
    };

    assert.equal(toBrowserLoadPointGroupAssignmentRequest(input).requested_configuration, null);
    assert.equal(toDesktopLoadPointGroupAssignmentRequest(input).requested_configuration, null);
  });

  it("copies group provenance and shared topology at the contract boundary", () => {
    assert.deepEqual(derivedLoadPointGroupsFromCore({
      groups: [{ load_point_ids: [1, 2], origin: "manual" }],
      topology: {
        load_point_ids: [1, 2],
        edges: [{ from_load_point_id: 1, to_load_point_id: 2 }],
        faces: [],
      },
    }), {
      groups: [{ load_point_ids: [1, 2], origin: "manual" }],
      topology: {
        load_point_ids: [1, 2],
        edges: [{ from_load_point_id: 1, to_load_point_id: 2 }],
        faces: [],
      },
    });
  });

  it("serializes preview and apply edits with the same canonical payload", () => {
    const input = {
      loadPoints,
      settings: {
        automatic: true,
        maxEdgeDistanceM: 1.2,
        manualGroups: [{ loadPointIds: [2, 1] }],
        ungroupedGroups: [],
      },
      selectedLoadPointIds: [2, 1],
      action: "group" as const,
    };
    const expected = {
      load_points: loadPoints,
      settings: {
        automatic: true,
        max_edge_distance_mm: 1_200,
        manual_groups: [{ load_point_ids: [1, 2] }],
        ungrouped_groups: [],
      },
      selected_load_point_ids: [2, 1],
      action: "group",
    };

    assert.deepEqual(toPreviewLoadPointGroupEditRequest(input), expected);
    assert.deepEqual(toApplyLoadPointGroupEditRequest(input), expected);
    assert.deepEqual(loadPointGroupEditResultFromCore({
      status: "blocked",
      reason: "disconnected_selection",
      load_point_ids: [1, 3],
    }), {
      status: "blocked",
      reason: "disconnected_selection",
      load_point_ids: [1, 3],
    });
  });

  it("uses runtime-specific maps for group conflict assessment", () => {
    const input = {
      groups: [{ load_point_ids: [1, 2], origin: "automatic" as const }],
      assignments: new Map([[2, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }]]),
      lockedLoadPointIds: [2],
    };

    assert.equal(toBrowserGroupAssignmentAssessmentRequest(input).assignments instanceof Map, true);
    assert.deepEqual(toDesktopGroupAssignmentAssessmentRequest(input).assignments, {
      "2": { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
    });
    assert.deepEqual(groupAssignmentConflictsFromCore([{
      load_point_ids: [1, 2],
      kind: "partial_assignment",
      assignment_repair_blocked: false,
      unassignment_repair_blocked: true,
      blocking_locked_load_point_ids: [2],
    }]), [{
      load_point_ids: [1, 2],
      kind: "partial_assignment",
      assignment_repair_blocked: false,
      unassignment_repair_blocked: true,
      blocking_locked_load_point_ids: [2],
    }]);
  });

  it("copies assignment results at the contract boundary", () => {
    assert.deepEqual(
      loadPointGroupAssignmentResultFromCore({
        status: "blocked",
        involved_load_point_ids: [1, 2],
        blocking_locked_load_points: [{
          load_point_id: 1,
          assigned_configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
        }],
      }),
      {
        status: "blocked",
        involved_load_point_ids: [1, 2],
        blocking_locked_load_points: [{
          load_point_id: 1,
          assigned_configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
        }],
      },
    );
    assert.deepEqual(
      loadPointGroupAssignmentResultFromCore({
        status: "applied",
        changes: [{
          load_point_id: 2,
          configuration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
        }],
      }),
      {
        status: "applied",
        changes: [{
          load_point_id: 2,
          configuration: { pile_size_mm: 290, pile_tip_level_mm: -17_500 },
        }],
      },
    );
    assert.deepEqual(
      loadPointGroupAssignmentResultFromCore({
        status: "applied",
        changes: [{ load_point_id: 2, configuration: null }],
      }),
      {
        status: "applied",
        changes: [{ load_point_id: 2, configuration: null }],
      },
    );
  });

  it("routes all grouping operations to matching WASM and Tauri commands", () => {
    const source = readFileSync(new URL("./pilePlanCoreClient.ts", import.meta.url), "utf8");

    assert.match(source, /derive_load_point_groups\(/);
    assert.match(source, /"derive_load_point_groups"/);
    assert.match(source, /apply_load_point_group_assignment\(/);
    assert.match(source, /"apply_load_point_group_assignment"/);
    assert.match(source, /preview_load_point_group_edit\(/);
    assert.match(source, /"preview_load_point_group_edit"/);
    assert.match(source, /apply_load_point_group_edit\(/);
    assert.match(source, /"apply_load_point_group_edit"/);
    assert.match(source, /assess_load_point_group_assignments\(/);
    assert.match(source, /"assess_load_point_group_assignments"/);
  });
});
