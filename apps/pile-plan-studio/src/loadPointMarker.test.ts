import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getLoadPointMarkerInvalidVisual } from "./loadPointMarker.ts";
import type { PileConfigurationOption } from "./projectTypes.ts";

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
  it("does not mark valid pile options as invalid", () => {
    assert.deepEqual(
      getLoadPointMarkerInvalidVisual(option({ isOption: true, utilization: 0.5 })),
      { className: "", style: "" },
    );
  });

  it("uses a stronger visual intensity for larger utilization overruns", () => {
    const slightOverrun = getLoadPointMarkerInvalidVisual(option({ isOption: false, utilization: 1.05 }));
    const largeOverrun = getLoadPointMarkerInvalidVisual(option({ isOption: false, utilization: 1.45 }));

    assert.equal(slightOverrun.className, " is-invalid");
    assert.equal(largeOverrun.className, " is-invalid");
    assert.match(slightOverrun.style, /--invalid-intensity: 0\.[0-9]+/);
    assert.match(largeOverrun.style, /--invalid-intensity: 0\.[0-9]+/);
    assert.ok(extractIntensity(largeOverrun.style) > extractIntensity(slightOverrun.style));
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

function extractIntensity(style: string): number {
  return Number(style.match(/--invalid-intensity: ([0-9.]+)/)?.[1] ?? 0);
}
