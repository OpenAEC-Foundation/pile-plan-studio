import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  toBrowserDefaultPileSelectionRequest,
  toDesktopDefaultPileSelectionRequest,
  type DefaultPileSelectionContractInput,
} from "./defaultPileSelectionContract.ts";

const input: DefaultPileSelectionContractInput = {
  groups: [{ load_point_ids: [7, 8] }],
  optionsByLoadPointId: new Map([[7, [{
    configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    pile_size_mm: 320,
    pile_tip_level_m: -18.5,
    isOption: true,
    governing_cpt_id: 61,
    governing_frd_kn: 700,
    utilization: 0.72,
    missing_cpt_ids: [],
  }]]]),
  pileHeadLevelM: -3.5,
  costSettings: { schema_version: 1, items: [] },
};

describe("default pile selection transport contract", () => {
  it("preserves groups and numeric keys for WASM", () => {
    const request = toBrowserDefaultPileSelectionRequest(input);

    assert.deepEqual(request.groups, [{ load_point_ids: [7, 8] }]);
    assert.notEqual(request.groups, input.groups);
    assert.equal(request.options_by_load_point instanceof Map, true);
    assert.equal(request.options_by_load_point.get(7)?.[0].is_option, true);
  });

  it("preserves groups and string keys for Tauri", () => {
    const request = toDesktopDefaultPileSelectionRequest(input);

    assert.deepEqual(request.groups, [{ load_point_ids: [7, 8] }]);
    assert.equal(request.options_by_load_point["7"][0].is_option, true);
  });
});
