import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregatePileOptionsForLoadPoints } from "./pileOptionAggregation.ts";
import type { PileConfigurationOption } from "../core/projectTypes.ts";

function option(input: {
  pileSizeMm: number;
  pileTipLevelM: number;
  isOption: boolean;
  governingCptId?: number | null;
  governingFrdKn?: number | null;
  utilization?: number | null;
}): PileConfigurationOption {
  return {
    pile_size_mm: input.pileSizeMm,
    pile_tip_level_m: input.pileTipLevelM,
    isOption: input.isOption,
    governing_cpt_id: input.governingCptId ?? (input.isOption ? 1 : null),
    governing_frd_kn: input.governingFrdKn ?? (input.isOption ? 700 : null),
    utilization: input.utilization ?? (input.isOption ? 0.7 : null),
    missing_cpt_ids: [],
  };
}

describe("pile option aggregation", () => {
  it("keeps an option OK only when every selected load point allows it", () => {
    const options = aggregatePileOptionsForLoadPoints([
      [
        option({ pileSizeMm: 320, pileTipLevelM: -18, isOption: true }),
        option({ pileSizeMm: 350, pileTipLevelM: -19, isOption: true }),
      ],
      [
        option({ pileSizeMm: 320, pileTipLevelM: -18, isOption: true }),
        option({ pileSizeMm: 350, pileTipLevelM: -19, isOption: false }),
      ],
    ]);

    assert.deepEqual(
      options.map((item) => [item.pile_size_mm, item.pile_tip_level_m, item.isOption]),
      [
        [320, -18, true],
        [350, -19, false],
      ],
    );
  });

  it("marks an option as missing when it is missing from one selected load point", () => {
    const options = aggregatePileOptionsForLoadPoints([
      [
        option({ pileSizeMm: 320, pileTipLevelM: -18, isOption: true }),
        option({ pileSizeMm: 350, pileTipLevelM: -19, isOption: true }),
      ],
      [option({ pileSizeMm: 320, pileTipLevelM: -18, isOption: true })],
    ]);

    assert.deepEqual(
      options.map((item) => [item.pile_size_mm, item.pile_tip_level_m, item.isOption, item.missing_cpt_ids.length]),
      [
        [320, -18, true, 0],
        [350, -19, false, 1],
      ],
    );
  });

  it("uses the lowest FRD as governing CPT and averages utilization", () => {
    const [aggregatedOption] = aggregatePileOptionsForLoadPoints([
      [
        option({
          pileSizeMm: 320,
          pileTipLevelM: -18,
          isOption: true,
          governingCptId: 61,
          governingFrdKn: 900,
          utilization: 0.5,
        }),
      ],
      [
        option({
          pileSizeMm: 320,
          pileTipLevelM: -18,
          isOption: true,
          governingCptId: 64,
          governingFrdKn: 700,
          utilization: 0.7,
        }),
      ],
    ]);

    assert.equal(aggregatedOption.governing_cpt_id, 64);
    assert.equal(aggregatedOption.governing_frd_kn, 700);
    assert.equal(aggregatedOption.utilization, 0.6);
  });
});
