import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  loadPointGroupAssignmentResultFromCore,
  loadPointGroupsFromCore,
  toBrowserLoadPointGroupAssignmentRequest,
  toDeriveLoadPointGroupsRequest,
  toDesktopLoadPointGroupAssignmentRequest,
} from "./loadPointGroupContract.ts";
import type { LoadPoint } from "./projectTypes.ts";

const loadPoints: LoadPoint[] = [
  { id: 2, name: "P2", x_mm: 100, y_mm: 200, design_load_kn: 300 },
];

describe("load point group transport contract", () => {
  it("derives groups from load points without duplicating the distance rule", () => {
    assert.deepEqual(toDeriveLoadPointGroupsRequest(loadPoints), {
      load_points: loadPoints,
    });

    const source = readFileSync(new URL("./loadPointGroupContract.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /1200|1_200/);
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

  it("copies group and assignment results at the contract boundary", () => {
    assert.deepEqual(loadPointGroupsFromCore([{ load_point_ids: [1, 2] }]), [
      { load_point_ids: [1, 2] },
    ]);
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
  });

  it("routes both operations to matching WASM and Tauri commands", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");

    assert.match(source, /derive_load_point_groups\(/);
    assert.match(source, /"derive_load_point_groups"/);
    assert.match(source, /apply_load_point_group_assignment\(/);
    assert.match(source, /"apply_load_point_group_assignment"/);
  });
});
