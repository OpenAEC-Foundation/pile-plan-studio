import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { DerivedLoadPointGroups } from "../../core/loadPointGroupContract.ts";
import type { LoadPoint, LoadPointGroupingSettings } from "../../core/projectTypes.ts";
import { createLoadPointGroupController } from "./loadPointGroupController.ts";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function point(id: number, xMm: number, designLoadKn = 100): LoadPoint {
  return {
    id,
    name: `P${id}`,
    x_mm: xMm,
    y_mm: 0,
    design_load_kn: designLoadKn,
  };
}

const automaticGrouping: LoadPointGroupingSettings = {
  automatic: true,
  maxEdgeDistanceM: 1.2,
  manualGroups: [],
  ungroupedGroups: [],
};

function grouping(groups: LoadPointGroup[]): DerivedLoadPointGroups {
  return {
    groups,
    topology: { load_point_ids: [], edges: [], faces: [] },
  };
}

  it("keeps the last completed groups and topology while a newer request is pending", async () => {
    const next = deferred<DerivedLoadPointGroups>();
    let callCount = 0;
    const controller = createLoadPointGroupController(async () => (
      callCount++ === 0
        ? grouping([{ load_point_ids: [1, 2], origin: "automatic" }])
        : next.promise
    ));
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    await controller.update([point(1, 0), point(2, 500)], automaticGrouping);
    const pending = controller.update(
      [point(1, 0), point(2, 500)],
      { ...automaticGrouping, maxEdgeDistanceM: 2.5 },
    );

    assert.deepEqual(snapshots.at(-1), {
      groups: [{ load_point_ids: [1, 2], origin: "automatic" }],
      topology: { load_point_ids: [], edges: [], faces: [] },
      pending: true,
      error: null,
    });
    next.resolve(grouping([{ load_point_ids: [1, 2], origin: "manual" }]));
    await pending;
    assert.deepEqual((snapshots.at(-1) as { groups: LoadPointGroup[] }).groups, [
      { load_point_ids: [1, 2], origin: "manual" },
    ]);
  });

describe("load point group controller", () => {
  it("clears a completed grouping when a replacement project has different load-point IDs", async () => {
    const replacement = deferred<DerivedLoadPointGroups>();
    let callCount = 0;
    const controller = createLoadPointGroupController(async () => (
      callCount++ === 0
        ? grouping([{ load_point_ids: [1, 2], origin: "automatic" }])
        : replacement.promise
    ));
    const snapshots: Array<{
      groups: LoadPointGroup[];
      topology: DerivedLoadPointGroups["topology"] | null;
      pending: boolean;
    }> = [];
    controller.subscribe(({ groups, topology, pending }) => {
      snapshots.push({ groups, topology, pending });
    });

    await controller.update([point(1, 0), point(2, 500)], automaticGrouping);
    const pending = controller.update([point(10, 0), point(11, 500)], automaticGrouping);

    assert.deepEqual(snapshots.at(-1), {
      groups: [],
      topology: null,
      pending: true,
    });
    replacement.resolve(grouping([{ load_point_ids: [10, 11], origin: "automatic" }]));
    await pending;
  });

  it("publishes pending and completed snapshots", async () => {
    const response = deferred<LoadPointGroup[]>();
    const controller = createLoadPointGroupController(() => response.promise);
    const snapshots: Array<{ groups: LoadPointGroup[]; pending: boolean }> = [];
    controller.subscribe(({ groups, pending }) => snapshots.push({ groups, pending }));

    const update = controller.update([point(1, 0), point(2, 500)], automaticGrouping);
    response.resolve([{ load_point_ids: [1, 2] }]);
    await update;

    assert.deepEqual(snapshots, [
      { groups: [], pending: false },
      { groups: [], pending: true },
      { groups: [{ load_point_ids: [1, 2] }], pending: false },
    ]);
  });

  it("reuses identical geometry and ignores design-load changes", async () => {
    const requests: LoadPoint[][] = [];
    const controller = createLoadPointGroupController(async (loadPoints) => {
      requests.push(loadPoints);
      return [{ load_point_ids: loadPoints.map(({ id }) => id).sort() }];
    });

    await controller.update([point(2, 500), point(1, 0)], automaticGrouping);
    await controller.update([point(1, 0), point(2, 500)], automaticGrouping);
    await controller.update([point(1, 0, 900), point(2, 500, 800)], automaticGrouping);
    await controller.update([point(1, 0), point(2, 501)], automaticGrouping);

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].map(({ x_mm }) => x_mm), [0, 501]);
  });

  it("recomputes groups when automatic grouping settings change", async () => {
    const settingsRequests: LoadPointGroupingSettings[] = [];
    const controller = createLoadPointGroupController(async (_loadPoints, settings) => {
      settingsRequests.push(settings);
      return [{ load_point_ids: [1] }];
    });

    await controller.update([point(1, 0)], automaticGrouping);
    await controller.update([point(1, 0)], { ...automaticGrouping, maxEdgeDistanceM: 2.5 });
    await controller.update([point(1, 0)], { ...automaticGrouping, automatic: false });

    assert.deepEqual(settingsRequests, [
      automaticGrouping,
      { ...automaticGrouping, maxEdgeDistanceM: 2.5 },
      { ...automaticGrouping, automatic: false },
    ]);
  });

  it("ignores an older response after geometry changes", async () => {
    const responses = [deferred<LoadPointGroup[]>(), deferred<LoadPointGroup[]>()];
    let requestIndex = 0;
    const controller = createLoadPointGroupController(
      () => responses[requestIndex++].promise,
    );
    const completed: LoadPointGroup[][] = [];
    controller.subscribe((snapshot) => {
      if (!snapshot.pending && snapshot.groups.length > 0) completed.push(snapshot.groups);
    });

    const older = controller.update([point(1, 0)], automaticGrouping);
    const newer = controller.update([point(1, 25)], automaticGrouping);
    responses[1].resolve([{ load_point_ids: [20] }]);
    await newer;
    responses[0].resolve([{ load_point_ids: [10] }]);
    await older;

    assert.deepEqual(completed, [[{ load_point_ids: [20] }]]);
  });

  it("restores a cached geometry and invalidates a different in-flight request", async () => {
    const changedGeometry = deferred<LoadPointGroup[]>();
    let callCount = 0;
    const controller = createLoadPointGroupController(async () => {
      callCount += 1;
      return callCount === 1
        ? [{ load_point_ids: [1] }]
        : changedGeometry.promise;
    });
    const completed: LoadPointGroup[][] = [];
    controller.subscribe((snapshot) => {
      if (!snapshot.pending && snapshot.groups.length > 0) completed.push(snapshot.groups);
    });

    await controller.update([point(1, 0)], automaticGrouping);
    const changedUpdate = controller.update([point(1, 25)], automaticGrouping);
    await controller.update([point(1, 0)], automaticGrouping);
    changedGeometry.resolve([{ load_point_ids: [25] }]);
    await changedUpdate;

    assert.equal(callCount, 2);
    assert.deepEqual(completed, [
      [{ load_point_ids: [1] }],
      [{ load_point_ids: [1] }],
    ]);
  });

  it("publishes errors only for the current request", async () => {
    const error = new Error("grouping failed");
    const controller = createLoadPointGroupController(async () => {
      throw error;
    });
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    await controller.update([point(1, 0)], automaticGrouping);

    assert.deepEqual(snapshots.at(-1), {
      groups: [],
      topology: null,
      pending: false,
      error,
    });
  });

  it("disposal prevents in-flight and future publication", async () => {
    const response = deferred<LoadPointGroup[]>();
    let callCount = 0;
    const controller = createLoadPointGroupController(() => {
      callCount += 1;
      return response.promise;
    });
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    const update = controller.update([point(1, 0)], automaticGrouping);
    controller.dispose();
    response.resolve([{ load_point_ids: [1] }]);
    await update;
    await controller.update([point(1, 5)], automaticGrouping);

    assert.equal(callCount, 1);
    assert.equal(snapshots.length, 2);
  });
});
