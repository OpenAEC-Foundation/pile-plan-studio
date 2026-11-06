import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initSync, build_tip_level_region_topology } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";

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
  it("sends only candidates for assigned configurations instead of every pile option", () => {
    const unrelated = Array.from({length: 78}, (_, index) => ({
      ...option, configuration: {pile_size_mm: 400, pile_tip_level_mm: -20_000 - index},
      pile_size_mm: 400, pile_tip_level_m: -20 - index / 1000,
    }));
    const options = [option, ...unrelated];
    const input = {loadPointTopology,
      selectedAssignments: new Map([[7, option.configuration]]),
      optionsByLoadPoint: new Map([[7, options], [8, unrelated]]),
    };
    for (const request of [toBrowserTipLevelRegionTopologyRequest(input), toDesktopTipLevelRegionTopologyRequest(input)]) {
      const rows = request.options_by_load_point instanceof Map
        ? [...request.options_by_load_point.values()] : Object.values(request.options_by_load_point);
      assert.equal(rows.flat().length, 1);
    }
    assert.equal(options.length, 79, "request preparation must not mutate source options");
  });

  it("retains Rust topology decisions for invalid, missing and duplicate assigned candidates", () => {
    initSync({module: readFileSync(new URL("./wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url))});
    const invalid = {...option, isOption: false, technicalStatus: "insufficient_capacity" as const};
    const other = {...option, configuration: {pile_size_mm: 400, pile_tip_level_mm: -19_000}, pile_size_mm: 400, pile_tip_level_m: -19};
    const options = new Map([[7, [invalid, other, option]], [8, [option]], [9, [invalid]], [10, [other]]]);
    const input = {loadPointTopology: {load_point_ids: [7,8,9,10], edges: [{from_load_point_id:7,to_load_point_id:8}],faces:[]},
      selectedAssignments: new Map([7,8,9,10].map(id=>[id, option.configuration])), optionsByLoadPoint: options};
    const full = {load_point_topology: input.loadPointTopology, selected_assignments: input.selectedAssignments,
      options_by_load_point: new Map([...options].map(([id, rows])=>[id,rows.map(({isOption,technicalStatus,...row})=>({...row,is_option:isOption,technical_status:technicalStatus}))]))};
    const expected = build_tip_level_region_topology(full);
    assert.deepEqual(build_tip_level_region_topology(toBrowserTipLevelRegionTopologyRequest(input)), expected);
    assert.deepEqual(build_tip_level_region_topology({...toDesktopTipLevelRegionTopologyRequest(input),
      selected_assignments: input.selectedAssignments,
      options_by_load_point: new Map(Object.entries(toDesktopTipLevelRegionTopologyRequest(input).options_by_load_point).map(([id,rows])=>[Number(id),rows])),
    }), expected);
  });

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
