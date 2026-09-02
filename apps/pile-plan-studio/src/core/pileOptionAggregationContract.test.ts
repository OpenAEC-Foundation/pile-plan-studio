import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  aggregatedPileConfigurationsFromCore,
  toBrowserAggregatePileOptionsRequest,
  toDesktopAggregatePileOptionsRequest,
} from "./pileOptionAggregationContract.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

const option: PileConfigurationOption = {
  configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
  pile_size_mm: 320,
  pile_tip_level_m: -18.5004,
  isOption: true,
  governing_cpt_id: 61,
  governing_frd_kn: 700,
  utilization: 0.72,
  missing_cpt_ids: [],
};

describe("pile option aggregation transport contract", () => {
  it("maps authoritative core facts without recalculating them", () => {
    const result = aggregatedPileConfigurationsFromCore([{
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
      pile_tip_level_m: -18.5,
      status: "missing",
      missing_load_point_ids: [2, 7],
      invalid_load_point_ids: [3],
      maximum_utilization: 0.91,
      critical_load_point_id: 2,
      critical_governing_cpt_id: 62,
      critical_governing_frd_kn: 680,
    }]);

    assert.deepEqual(result[0], {
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
      pile_tip_level_m: -18.5,
      status: "missing",
      missing_load_point_ids: [2, 7],
      invalid_load_point_ids: [3],
      maximum_utilization: 0.91,
      critical_load_point_id: 2,
      critical_governing_cpt_id: 62,
      critical_governing_frd_kn: 680,
    });
  });

  it("normalizes optional facts omitted by WASM to null", () => {
    const [result] = aggregatedPileConfigurationsFromCore([{
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -20_000 },
      pile_tip_level_m: -20,
      status: "missing",
      missing_load_point_ids: [2],
      invalid_load_point_ids: [],
    }]);

    assert.equal(result.maximum_utilization, null);
    assert.equal(result.critical_load_point_id, null);
    assert.equal(result.critical_governing_cpt_id, null);
    assert.equal(result.critical_governing_frd_kn, null);
  });

  it("uses numeric map keys for WASM and core option field names", () => {
    const request = toBrowserAggregatePileOptionsRequest(new Map([[7, [option]]]));

    assert.equal(request.options_by_load_point instanceof Map, true);
    assert.equal(request.options_by_load_point.get(7)?.[0].is_option, true);
  });

  it("uses string record keys for Tauri", () => {
    const request = toDesktopAggregatePileOptionsRequest(new Map([[7, [option]]]));

    assert.equal(request.options_by_load_point["7"][0].is_option, true);
  });

  it("routes browser and desktop aggregation through their transport adapters", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");

    assert.match(source, /export async function aggregatePileOptionsCore/);
    assert.match(source, /aggregate_pile_options\(\s*toBrowserAggregatePileOptionsRequest/);
    assert.match(source, /invoke<CoreAggregatedPileConfiguration\[]>\("aggregate_pile_options"/);
    assert.match(source, /toDesktopAggregatePileOptionsRequest/);
  });
});
