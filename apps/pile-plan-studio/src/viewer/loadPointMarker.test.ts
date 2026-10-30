import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getLoadPointMarkerInvalidVisual,
  getOptimizerUnresolvedMarkerStyle,
  getUnselectedLoadPointMarkerState,
  usesNeutralUnassignedMarker,
} from "./loadPointMarker.ts";
import type { PileConfigurationOption } from "../core/projectTypes.ts";
import type { TechnicalAssignmentIssueStatus } from "../core/technicalAssignmentContract.ts";

function option(input: {
  isOption: boolean;
  utilization: number | null;
  missingCptIds?: number[];
}): PileConfigurationOption {
  return {
    pile_size_mm: 290,
    pile_tip_level_m: -17.5,
    isOption: input.isOption,
    governing_cpt_id: 2,
    governing_frd_kn: input.utilization === null ? null : 320 / input.utilization,
    utilization: input.utilization,
    missing_cpt_ids: input.missingCptIds ?? [],
  };
}

describe("load point marker invalid visual", () => {
  it("shows missing and failing tension in compression display and compression warnings in tension display", () => {
    const facts=(status: "valid"|"missing_capacity_data"|"insufficient_capacity"|"not_assessed",utilization:number|null=.5)=>({status,demand_kn:100,utilization,governing_cpt_id:null,governing_frd_kn:null,missing_cpt_ids:[]});
    const pressure=option({isOption:true,utilization:.5});
    assert.equal(getLoadPointMarkerInvalidVisual({...pressure,compression:facts("valid"),tension:facts("missing_capacity_data",null)}).className," is-missing");
    assert.equal(getLoadPointMarkerInvalidVisual({...pressure,compression:facts("valid"),tension:facts("insufficient_capacity",1.2)}).className," is-above-range");
    assert.equal(getLoadPointMarkerInvalidVisual({...pressure,displayDirectionStatus:"not_assessed",compression:facts("insufficient_capacity",1.2),tension:facts("not_assessed",null)}).className," is-above-range");
    assert.equal(getLoadPointMarkerInvalidVisual({...pressure,compression:facts("valid"),tension:facts("not_assessed",null)}).className,"");
  });
  it("marks known zero load below the preferred minimum but leaves unimported demand neutral", () => {
    const range={minimum:0.05,maximum:1};
    const zero={...option({isOption:true,utilization:0}),displayDirectionStatus:"no_load" as const};
    assert.equal(getLoadPointMarkerInvalidVisual(zero,range).className," is-below-range");
    assert.deepEqual(getLoadPointMarkerInvalidVisual({...zero,displayDirectionStatus:"not_assessed"},range),{className:"",style:""});
    assert.deepEqual(getLoadPointMarkerInvalidVisual(zero,{minimum:0,maximum:1}),{className:"",style:""});
  });
  it("does not mark valid pile options as invalid", () => {
    assert.deepEqual(
      getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 0.5 })),
      { className: "", style: "" },
    );
  });

  it("uses a stronger visual intensity for larger utilization overruns", () => {
    const range = { minimum: 0.2, maximum: 0.8 };
    const slightOverrun = getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 0.85 }), range);
    const largeOverrun = getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 1 }), range);

    assert.equal(slightOverrun.className, " is-above-range");
    assert.equal(largeOverrun.className, " is-above-range");
    assert.match(slightOverrun.style, /--utilization-intensity: 0\.[0-9]+/);
    assert.match(largeOverrun.style, /--utilization-intensity: 0\.[0-9]+/);
    assert.ok(extractIntensity(largeOverrun.style) > extractIntensity(slightOverrun.style));
  });

  it("marks utilization below the preferred range increasingly green", () => {
    const range = { minimum: 0.4, maximum: 0.9 };
    const slight = getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 0.35 }), range);
    const large = getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 0.1 }), range);

    assert.equal(slight.className, " is-below-range");
    assert.equal(large.className, " is-below-range");
    assert.ok(extractIntensity(large.style) > extractIntensity(slight.style));
  });

  it("marks selected options with missing CPT capacities yellow", () => {
    assert.deepEqual(
      getLoadPointMarkerInvalidVisual(option({
        isOption: false,
        utilization: null,
        missingCptIds: [64],
      })),
      { className: " is-missing", style: "" },
    );
  });
});

describe("unselected load point marker state", () => {
  it("keeps unresolved, unavailable, and failed assessments neutral", () => {
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "loading" }), "pending");
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "unavailable" }), "unavailable");
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "error" }), "analysis-error");
  });

  it("uses the shared technical group status for both group members", () => {
    const missing: TechnicalAssignmentIssueStatus = "missing_capacity_data";
    const insufficient: TechnicalAssignmentIssueStatus = "insufficient_capacity";
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "ready", technicalIssueStatus: missing }), "missing-capacity-data");
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "ready", technicalIssueStatus: insufficient }), "insufficient-capacity");
  });

  it("uses optimizer status only after missing and invalid engineering states", () => {
    assert.equal(
      getUnselectedLoadPointMarkerState({ analysisStatus: "ready", optimizationUnassignedReason: "configuration_limits" }),
      "optimizer-unassigned",
    );
    assert.equal(
      getUnselectedLoadPointMarkerState({ analysisStatus: "ready", technicalIssueStatus: "missing_capacity_data", optimizationUnassignedReason: "configuration_limits" }),
      "missing-capacity-data",
    );
    assert.equal(
      getUnselectedLoadPointMarkerState({ analysisStatus: "ready", technicalIssueStatus: "insufficient_capacity", optimizationUnassignedReason: "configuration_limits" }),
      "insufficient-capacity",
    );
    assert.equal(getUnselectedLoadPointMarkerState({ analysisStatus: "ready" }), "unassigned");
  });

  it("uses a neutral dot for every unassigned state except an optimizer limit", () => {
    const neutralStates = [
      "pending",
      "analysis-error",
      "unavailable",
      "missing-capacity-data",
      "insufficient-capacity",
      "unassigned",
    ] as const;

    for (const state of neutralStates) {
      assert.equal(usesNeutralUnassignedMarker(state), true, state);
    }
    assert.equal(usesNeutralUnassignedMarker("optimizer-unassigned"), false);
  });
});

describe("optimizer unresolved marker placement", () => {
  it("removes map anchoring when the marker is rendered in a hover preview", () => {
    assert.deepEqual(getOptimizerUnresolvedMarkerStyle("inline"), {
      position: "static",
      transform: "none",
    });
  });
});

function extractIntensity(style: string): number {
  return Number(style.match(/--utilization-intensity: ([0-9.]+)/)?.[1] ?? 0);
}
