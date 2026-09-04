import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  SpatialNeighborhood,
  TipLevelRegionTopology,
} from "../../core/spatialTopologyContract.ts";
import type { LoadPoint, PileConfigurationOption } from "../../core/projectTypes.ts";
import {
  createTipLevelRegionTopologyController,
  type TipLevelRegionTopologyControllerInput,
} from "./tipLevelRegionTopologyController.ts";

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

const loadPoint = (x = 0): LoadPoint => ({
  id: 1,
  name: "A",
  x_mm: x,
  y_mm: 0,
  design_load_kn: 500,
});

const option = (tip: number): PileConfigurationOption => ({
  configuration: { pile_size_mm: 300, pile_tip_level_mm: tip * 1000 },
  pile_size_mm: 300,
  pile_tip_level_m: tip,
  isOption: true,
  governing_cpt_id: 1,
  governing_frd_kn: 600,
  utilization: 0.8,
  missing_cpt_ids: [],
});

const neighborhood = (x = 0): SpatialNeighborhood => ({
  sites: [{ site_id: 1, load_point_ids: [1], x_mm: x, y_mm: 0 }],
  edges: [],
  faces: [],
});

const topology = (tip: number): TipLevelRegionTopology => ({
  groups: [{
    pile_tip_level_mm: tip * 1000,
    legend_value_m: tip,
    site_ids: [1],
    edges: [],
    faces: [],
  }],
});

function input(tip: number, x = 0): TipLevelRegionTopologyControllerInput {
  return {
    loadPoints: [loadPoint(x)],
    selectedPileConfigurationsByLoadPoint: new Map([[
      1,
      { pile_size_mm: 300, pile_tip_level_mm: tip * 1000 },
    ]]),
    pileOptionsByLoadPointId: new Map([[1, [option(tip)]]]),
  };
}

async function flushAsyncStage(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("tip-level region topology controller", () => {
  it("keeps completed topology visible and rejects older out-of-order results", async () => {
    const topologyRequests: Deferred<TipLevelRegionTopology>[] = [];
    const controller = createTipLevelRegionTopologyController({
      buildNeighborhood: async () => neighborhood(),
      buildTopology: async () => {
        const request = deferred<TipLevelRegionTopology>();
        topologyRequests.push(request);
        return request.promise;
      },
    });
    const emitted: Array<TipLevelRegionTopology | null> = [];
    controller.subscribe((value) => emitted.push(value));

    const initialUpdate = controller.update(input(-18));
    await flushAsyncStage();
    topologyRequests[0].resolve(topology(-18));
    await initialUpdate;

    const olderUpdate = controller.update(input(-19));
    await flushAsyncStage();
    assert.deepEqual(emitted, [topology(-18)]);

    const newerUpdate = controller.update(input(-20));
    await flushAsyncStage();
    topologyRequests[2].resolve(topology(-20));
    await newerUpdate;
    topologyRequests[1].resolve(topology(-19));
    await olderUpdate;

    assert.deepEqual(emitted, [topology(-18), topology(-20)]);
  });

  it("reuses a completed neighborhood until load-point coordinates change", async () => {
    const neighborhoodInputs: LoadPoint[][] = [];
    const topologyInputs: number[] = [];
    const controller = createTipLevelRegionTopologyController({
      buildNeighborhood: async (loadPoints) => {
        neighborhoodInputs.push(loadPoints);
        return neighborhood(loadPoints[0].x_mm);
      },
      buildTopology: async ({ selectedAssignments }) => {
        const tip = (selectedAssignments.get(1)?.pile_tip_level_mm ?? 0) / 1000;
        topologyInputs.push(tip);
        return topology(tip);
      },
    });

    await controller.update(input(-18));
    await controller.update(input(-19));
    await controller.update(input(-19, 25));

    assert.deepEqual(neighborhoodInputs.map(([point]) => point.x_mm), [0, 25]);
    assert.deepEqual(topologyInputs, [-18, -19, -19]);
  });

  it("disables output and prevents an in-flight graph from reaching grouping", async () => {
    const graph = deferred<SpatialNeighborhood>();
    let topologyCallCount = 0;
    const controller = createTipLevelRegionTopologyController({
      buildNeighborhood: async () => graph.promise,
      buildTopology: async () => {
        topologyCallCount += 1;
        return topology(-18);
      },
    });
    const emitted: Array<TipLevelRegionTopology | null> = [];
    controller.subscribe((value) => emitted.push(value));

    const update = controller.update(input(-18));
    controller.disable();
    graph.resolve(neighborhood());
    await update;

    assert.deepEqual(emitted, [null]);
    assert.equal(topologyCallCount, 0);
  });
});
