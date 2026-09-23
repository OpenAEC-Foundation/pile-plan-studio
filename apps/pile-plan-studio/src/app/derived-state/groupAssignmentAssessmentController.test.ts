import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  GroupAssignmentAssessmentInput,
  GroupAssignmentConflict,
} from "../../core/loadPointGroupContract.ts";
import { createGroupAssignmentAssessmentController } from "./groupAssignmentAssessmentController.ts";

function input(size = 320, lockedLoadPointIds: number[] = []): GroupAssignmentAssessmentInput {
  return {
    groups: [{ load_point_ids: [1, 2], origin: "automatic" }],
    assignments: new Map([[1, { pile_size_mm: size, pile_tip_level_mm: -18_000 }]]),
    lockedLoadPointIds,
  };
}

function conflict(blockers: number[] = []): GroupAssignmentConflict {
  return {
    load_point_ids: [1, 2],
    kind: "partial_assignment",
    assignment_repair_blocked: false,
    unassignment_repair_blocked: blockers.length > 0,
    blocking_locked_load_point_ids: blockers,
  };
}

describe("group assignment assessment controller", () => {
  it("reassesses assignments and locks while retaining the previous conflicts", async () => {
    let resolveNext!: (value: GroupAssignmentConflict[]) => void;
    let callCount = 0;
    const controller = createGroupAssignmentAssessmentController(async () => {
      callCount += 1;
      if (callCount === 1) return [conflict()];
      return new Promise((resolve) => { resolveNext = resolve; });
    });
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    await controller.update(input());
    const pending = controller.update(input(320, [1]));

    assert.deepEqual(snapshots.at(-1), {
      conflicts: [conflict()],
      conflictsByLoadPointId: new Map([[1, conflict()], [2, conflict()]]),
      pending: true,
      error: null,
    });
    resolveNext([conflict([1])]);
    await pending;
    assert.deepEqual(
      (snapshots.at(-1) as { conflicts: GroupAssignmentConflict[] }).conflicts,
      [conflict([1])],
    );
  });

  it("ignores stale responses and reuses an identical signature", async () => {
    const resolvers: Array<(value: GroupAssignmentConflict[]) => void> = [];
    let calls = 0;
    const controller = createGroupAssignmentAssessmentController(() => {
      calls += 1;
      return new Promise((resolve) => resolvers.push(resolve));
    });

    const older = controller.update(input(290));
    const newer = controller.update(input(320));
    resolvers[1]([]);
    await newer;
    resolvers[0]([conflict()]);
    await older;
    await controller.update(input(320));

    let latest: unknown;
    controller.subscribe((snapshot) => { latest = snapshot; })();
    assert.equal(calls, 2);
    assert.deepEqual(latest, {
      conflicts: [],
      conflictsByLoadPointId: new Map(),
      pending: false,
      error: null,
    });
  });

  it("clears transient assessment when no completed groups are available", async () => {
    const controller = createGroupAssignmentAssessmentController(async () => [conflict()]);
    await controller.update(input());
    await controller.update(null);

    let latest: unknown;
    controller.subscribe((snapshot) => { latest = snapshot; })();
    assert.deepEqual(latest, {
      conflicts: [],
      conflictsByLoadPointId: new Map(),
      pending: false,
      error: null,
    });
  });
});
