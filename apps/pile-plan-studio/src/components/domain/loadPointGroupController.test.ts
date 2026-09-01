import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { LoadPoint } from "../../core/projectTypes.ts";
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

describe("load point group controller", () => {
  it("publishes pending and completed snapshots", async () => {
    const response = deferred<LoadPointGroup[]>();
    const controller = createLoadPointGroupController(() => response.promise);
    const snapshots: Array<{ groups: LoadPointGroup[]; pending: boolean }> = [];
    controller.subscribe(({ groups, pending }) => snapshots.push({ groups, pending }));

    const update = controller.update([point(1, 0), point(2, 500)]);
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

    await controller.update([point(2, 500), point(1, 0)]);
    await controller.update([point(1, 0), point(2, 500)]);
    await controller.update([point(1, 0, 900), point(2, 500, 800)]);
    await controller.update([point(1, 0), point(2, 501)]);

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].map(({ x_mm }) => x_mm), [0, 501]);
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

    const older = controller.update([point(1, 0)]);
    const newer = controller.update([point(1, 25)]);
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

    await controller.update([point(1, 0)]);
    const changedUpdate = controller.update([point(1, 25)]);
    await controller.update([point(1, 0)]);
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

    await controller.update([point(1, 0)]);

    assert.deepEqual(snapshots.at(-1), {
      groups: [],
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

    const update = controller.update([point(1, 0)]);
    controller.dispose();
    response.resolve([{ load_point_ids: [1] }]);
    await update;
    await controller.update([point(1, 5)]);

    assert.equal(callCount, 1);
    assert.equal(snapshots.length, 2);
  });
});
