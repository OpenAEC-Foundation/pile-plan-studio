import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  greedyOptimizationOutcomeFromCore,
  toBrowserGreedyOptimizationRequest,
  toDesktopGreedyOptimizationRequest,
  type GreedyOptimizationContractInput,
} from "./greedyOptimizationContract.ts";

const input: GreedyOptimizationContractInput = {
  groups: [{ load_point_ids: [7, 8] }],
  optionsByLoadPoint: new Map([[7, [{
    configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    pile_size_mm: 320,
    pile_tip_level_m: -18.5,
    isOption: true,
    governing_cpt_id: 61,
    governing_frd_kn: 700,
    utilization: 0.72,
    missing_cpt_ids: [],
    technicalStatus: "valid",
  }]]]),
  targetLoadPointIds: [7],
  lockedLoadPointIds: [8],
  currentAssignments: new Map([[8, {
    pile_size_mm: 320,
    pile_tip_level_mm: -18_500,
  }]]),
  limitScope: "whole-plan",
  pileHeadLevelM: null,
  costSettings: { schema_version: 1, items: [] },
  candidateConfigurations: [
    { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
    { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
  ],
  settings: {
    max_pile_sizes: 2,
    max_pile_tip_levels: 3,
    max_pile_configurations: 4,
    max_utilization: 1,
    candidate_source: "active_legend",
  },
};

describe("greedy optimization transport contract", () => {
  it("uses numeric map keys for WASM and preserves nullable input", () => {
    const request = toBrowserGreedyOptimizationRequest(input);

    assert.equal(request.options_by_load_point instanceof Map, true);
    assert.equal(request.options_by_load_point.get(7)?.[0].is_option, true);
    assert.equal(request.current_assignments instanceof Map, true);
    assert.equal(request.current_assignments.get(8)?.pile_tip_level_mm, -18_500);
    assert.equal(request.pile_head_level_m, null);
    assert.deepEqual(request.groups, [{ load_point_ids: [7, 8] }]);
    assert.notEqual(request.groups, input.groups);
    assert.notEqual(request.groups[0].load_point_ids, input.groups[0].load_point_ids);
    assert.deepEqual(request.candidate_configurations, input.candidateConfigurations);
    assert.notEqual(request.candidate_configurations, input.candidateConfigurations);
    assert.equal("enabled_pile_sizes" in request.settings, false);
  });

  it("uses string record keys for Tauri with the same semantic payload", () => {
    const request = toDesktopGreedyOptimizationRequest(input);

    assert.equal(request.options_by_load_point["7"][0].is_option, true);
    assert.equal(request.current_assignments["8"].pile_tip_level_mm, -18_500);
    assert.equal(request.pile_head_level_m, null);
    assert.deepEqual(request.groups, [{ load_point_ids: [7, 8] }]);
    assert.deepEqual(request.candidate_configurations, input.candidateConfigurations);
    assert.notEqual(request.candidate_configurations, input.candidateConfigurations);
  });

  it("deeply normalizes a completed outcome", () => {
    const source = {
      status: "completed" as const,
      result: {
        assignments: [{
          load_point_id: 7,
          configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
          pile_size_mm: 320,
          pile_tip_level_m: -18.5,
          is_option: true,
          cost: 123,
        }],
        unassigned: [{ load_point_id: 9, reason: "configuration_limits" as const }],
        technical_unassigned_load_point_ids: [11, 12],
        unassigned_group_count: 1,
        selected_configurations: [{ pile_size_mm: 320, pile_tip_level_mm: -18_500 }],
        pile_size_count: 1,
        pile_tip_level_count: 1,
        configuration_count: 1,
      },
    };

    const result = greedyOptimizationOutcomeFromCore(source);

    assert.deepEqual(result, source);
    assert.notEqual(result, source);
    assert.equal(result.status, "completed");
    if (result.status === "completed") {
      assert.notEqual(result.result.assignments, source.result.assignments);
      assert.notEqual(result.result.assignments[0].configuration, source.result.assignments[0].configuration);
      assert.notEqual(result.result.selected_configurations, source.result.selected_configurations);
      assert.notEqual(
        result.result.technical_unassigned_load_point_ids,
        source.result.technical_unassigned_load_point_ids,
      );
    }
  });

  it("deeply normalizes blocked diagnostics, including the group partition kind", () => {
    const source = {
      status: "blocked" as const,
      diagnostics: [{
        kind: "invalid_group_partition" as const,
        load_point_ids: [7, 8],
        configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
      }],
    };

    const result = greedyOptimizationOutcomeFromCore(source);

    assert.deepEqual(result, source);
    assert.notEqual(result, source);
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.notEqual(result.diagnostics, source.diagnostics);
      assert.notEqual(result.diagnostics[0].load_point_ids, source.diagnostics[0].load_point_ids);
      assert.notEqual(result.diagnostics[0].configuration, source.diagnostics[0].configuration);
    }
  });
});
