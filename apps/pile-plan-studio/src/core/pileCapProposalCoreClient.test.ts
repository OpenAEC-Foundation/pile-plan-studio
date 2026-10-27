import assert from "node:assert/strict";
import { test } from "node:test";
import { pileCapProposalResultFromCore } from "./pileCapProposalCoreClient.ts";
import type { PileCapProposalResult } from "./pileCapProposalTypes.ts";
test("normalizes flattened WASM option maps and native objects identically", () => {
  const option = {
    configuration: { pile_size_mm: 320, pile_tip_level_mm: -18500 },
    pile_size_mm: 320,
    pile_tip_level_m: -18.5,
    is_option: true,
    technical_status: "valid",
    governing_cpt_id: 11,
    governing_frd_kn: 600,
    utilization: 2 / 3,
    missing_cpt_ids: [],
    cost_per_pile: 780,
    total_cost: 2340,
  };
  const result = (value: unknown) =>
    ({
      plans: [
        {
          plan_id: "p",
          proposals: [],
          previews: [
            {
              proposal: {
                load_point_ids: [1, 2],
                pile_count: 3,
                quarter_turns: 0,
              },
              options: [value],
            },
          ],
        },
      ],
    }) as unknown as PileCapProposalResult;
  const native = pileCapProposalResultFromCore(result(option));
  const wasm = pileCapProposalResultFromCore(
    result(new Map(Object.entries(option))),
  );
  assert.deepEqual(wasm, native);
  assert.equal(
    wasm.plans[0].previews[0].options[0].configuration.pile_size_mm,
    320,
  );
  assert.equal(wasm.plans[0].previews[0].options[0].isOption, true);
  assert.equal(wasm.plans[0].previews[0].proposal.configuration, null);
});
