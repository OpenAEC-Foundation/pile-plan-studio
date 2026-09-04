import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AggregatedPileConfiguration } from "../../core/pileOptionAggregationContract.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import {
  createPileOptionAggregationController,
  type PileOptionAggregationControllerInput,
} from "./pileOptionAggregationController.ts";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function option(tipLevelMm: number, utilization = 0.8): PileConfigurationOption {
  return {
    configuration: { pile_size_mm: 320, pile_tip_level_mm: tipLevelMm },
    pile_size_mm: 320,
    pile_tip_level_m: tipLevelMm / 1000,
    isOption: true,
    governing_cpt_id: 61,
    governing_frd_kn: 700,
    utilization,
    missing_cpt_ids: [],
  };
}

function aggregate(tipLevelMm: number): AggregatedPileConfiguration {
  return {
    configuration: { pile_size_mm: 320, pile_tip_level_mm: tipLevelMm },
    pile_tip_level_m: tipLevelMm / 1000,
    status: "valid",
    missing_load_point_ids: [],
    invalid_load_point_ids: [],
    maximum_utilization: 0.8,
    critical_load_point_id: 1,
    critical_governing_cpt_id: 61,
    critical_governing_frd_kn: 700,
  };
}

function input(ids: number[], tipLevelMm = -18_000): PileOptionAggregationControllerInput {
  return {
    selectedLoadPointIds: ids,
    pileOptionsByLoadPointId: new Map(ids.map((id) => [id, [option(tipLevelMm)]])),
  };
}

describe("pile option aggregation controller", () => {
  it("does not aggregate zero or one selected load point", async () => {
    let calls = 0;
    const controller = createPileOptionAggregationController(async () => {
      calls += 1;
      return [];
    });

    await controller.update(input([]));
    await controller.update(input([1]));

    assert.equal(calls, 0);
    assert.equal(controller.getState().status, "idle");
  });

  it("rejects an older result after the selected IDs change", async () => {
    const requests: Deferred<AggregatedPileConfiguration[]>[] = [];
    const controller = createPileOptionAggregationController(() => {
      const request = deferred<AggregatedPileConfiguration[]>();
      requests.push(request);
      return request.promise;
    });
    const readyTips: number[] = [];
    controller.subscribe((state) => {
      if (state.status === "ready") readyTips.push(state.result[0].configuration.pile_tip_level_mm);
    });

    const first = controller.update(input([1, 2], -18_000));
    const second = controller.update(input([2, 3], -19_000));
    requests[1].resolve([aggregate(-19_000)]);
    await second;
    requests[0].resolve([aggregate(-18_000)]);
    await first;

    assert.deepEqual(readyTips, [-19_000]);
  });

  it("reuses a completed result for the same selected analysis facts", async () => {
    let calls = 0;
    let readyNotifications = 0;
    const controller = createPileOptionAggregationController(async () => {
      calls += 1;
      return [aggregate(-18_000)];
    });
    controller.subscribe((state) => {
      if (state.status === "ready") readyNotifications += 1;
    });

    await controller.update(input([2, 1]));
    await controller.update(input([1, 2]));

    assert.equal(calls, 1);
    assert.equal(readyNotifications, 1);
    assert.equal(controller.getState().status, "ready");
  });

  it("invalidates the cache when an engineering fact changes", async () => {
    let calls = 0;
    const controller = createPileOptionAggregationController(async () => {
      calls += 1;
      return [aggregate(-18_000)];
    });
    const first = input([1, 2]);
    const changed = input([1, 2]);
    changed.pileOptionsByLoadPointId.get(2)![0] = option(-18_000, 0.9);

    await controller.update(first);
    await controller.update(changed);

    assert.equal(calls, 2);
  });
});

describe("aggregated pile options hook", () => {
  it("owns one controller and clears it on unmount", () => {
    const source = readFileSync(new URL("./useAggregatedPileOptions.ts", import.meta.url), "utf8");

    assert.match(source, /createPileOptionAggregationController\(aggregatePileOptionsCore\)/);
    assert.match(source, /controller\.subscribe\(setState\)/);
    assert.match(source, /controller\.clear\(\)/);
  });
});
