import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  technicalAssignmentAssessmentFromCore,
  toBrowserTechnicalAssignmentRequest,
  toDesktopTechnicalAssignmentRequest,
} from "./technicalAssignmentContract.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

const missingOption: PileConfigurationOption = {
  configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
  pile_size_mm: 320,
  pile_tip_level_m: -18.5,
  isOption: false,
  governing_cpt_id: 61,
  governing_frd_kn: 700,
  utilization: 1.2,
  missing_cpt_ids: [62],
  technicalStatus: "missing_capacity_data",
};

describe("technical assignment transport contract", () => {
  it("uses numeric browser keys and string desktop keys with Rust option fields", () => {
    const input = {
      groups: [{ load_point_ids: [1, 2] }],
      optionsByLoadPoint: new Map([[2, [missingOption]]]),
    };

    const browser = toBrowserTechnicalAssignmentRequest(input);
    const desktop = toDesktopTechnicalAssignmentRequest(input);

    assert.equal(browser.options_by_load_point instanceof Map, true);
    assert.equal(browser.options_by_load_point.get(2)?.[0].technical_status, "missing_capacity_data");
    assert.equal(desktop.options_by_load_point["2"][0].technical_status, "missing_capacity_data");
    assert.notEqual(browser.groups[0].load_point_ids, input.groups[0].load_point_ids);
  });

  it("deeply normalizes deterministic issue arrays", () => {
    const source = {
      availability: "available" as const,
      issues: [{
        load_point_id: 1,
        cause: "group_member_without_valid_option" as const,
        status: "missing_capacity_data" as const,
        group_load_point_ids: [2, 1],
        blocking_load_point_ids: [2],
        missing_cpt_ids: [62, 61, 62],
        has_missing_capacity_data: false,
      }],
    };

    const result = technicalAssignmentAssessmentFromCore(source);

    assert.deepEqual(result.issues[0], {
      ...source.issues[0],
      group_load_point_ids: [1, 2],
      blocking_load_point_ids: [2],
      missing_cpt_ids: [61, 62],
    });
    assert.notEqual(result.issues, source.issues);
    assert.notEqual(result.issues[0].group_load_point_ids, source.issues[0].group_load_point_ids);
  });

  it("routes browser and desktop assessment through their adapters", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");

    assert.match(source, /export async function assessTechnicalAssignmentCore/);
    assert.match(source, /assess_technical_assignment\(\s*toBrowserTechnicalAssignmentRequest/);
    assert.match(source, /invoke<.*>\("assess_technical_assignment"/s);
    assert.match(source, /toDesktopTechnicalAssignmentRequest/);
  });
});
