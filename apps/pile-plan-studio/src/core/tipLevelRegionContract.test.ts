import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  toTipLevelRegionAssignments,
  toBrowserTipLevelRegionTopologyRequest,
  toDesktopTipLevelRegionTopologyRequest,
  type LoadPointTopology,
} from "./tipLevelRegionContract.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

const loadPointTopology: LoadPointTopology = {
  load_point_ids: [7],
  edges: [],
  faces: [],
};

const option: PileConfigurationOption = {
  configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
  pile_size_mm: 320,
  pile_tip_level_m: -18.0004,
  isOption: true,
  governing_cpt_id: 3,
  governing_frd_kn: 500,
  utilization: 0.5,
  missing_cpt_ids: [],
  technicalStatus: "valid",
};

describe("tip-level region transport contract", () => {
  it("copies canonical assignments without normalizing PPN identity", () => {
    assert.deepEqual(
      toTipLevelRegionAssignments(new Map([[
        7,
        { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
      ]])),
      new Map([[7, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }]]),
    );
  });

  it("builds numeric-keyed WASM maps with core option fields", () => {
    const result = toBrowserTipLevelRegionTopologyRequest({
      loadPointTopology,
      selectedAssignments: new Map([[7, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }]]),
      optionsByLoadPoint: new Map([[7, [option]]]),
    });

    assert.equal(result.selected_assignments instanceof Map, true);
    assert.deepEqual(result.selected_assignments.get(7), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_000,
    });
    assert.deepEqual(result.options_by_load_point.get(7)?.[0], {
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
      pile_size_mm: 320,
      pile_tip_level_m: -18.0004,
      is_option: true,
      governing_cpt_id: 3,
      governing_frd_kn: 500,
      utilization: 0.5,
      missing_cpt_ids: [],
      technical_status: "valid",
    });
  });

  it("builds string-keyed Tauri records without changing raw PPN values", () => {
    const result = toDesktopTipLevelRegionTopologyRequest({
      loadPointTopology,
      selectedAssignments: new Map([[7, { pile_size_mm: 320, pile_tip_level_mm: -18_000 }]]),
      optionsByLoadPoint: new Map([[7, [option]]]),
    });

    assert.deepEqual(result.selected_assignments, {
      "7": { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
    });
    assert.equal(result.options_by_load_point["7"][0].pile_tip_level_m, -18.0004);
    assert.equal(result.options_by_load_point["7"][0].is_option, true);
    assert.equal(result.options_by_load_point["7"][0].technical_status, "valid");
  });
});
