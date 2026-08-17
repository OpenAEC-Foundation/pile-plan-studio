import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
} from "./loadPointMarker.ts";
import type { PileConfigurationOption } from "../core/projectTypes.ts";

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
  it("keeps unresolved and failed calculations neutral", () => {
    assert.equal(getUnselectedLoadPointMarkerState(undefined, true, false), "pending");
    assert.equal(getUnselectedLoadPointMarkerState(undefined, false, true), "pending");
  });

  it("uses Missing only when every option lacks CPT capacities", () => {
    const missingOption = option({ isOption: false, utilization: null, missingCptIds: [64] });
    const invalidOption = option({ isOption: false, utilization: 1.2 });

    assert.equal(getUnselectedLoadPointMarkerState([missingOption], false, false), "missing");
    assert.equal(
      getUnselectedLoadPointMarkerState([missingOption, invalidOption], false, false),
      "invalid",
    );
  });

  it("uses optimizer status only after missing and invalid engineering states", () => {
    const validOption = option({ isOption: true, utilization: 0.7 });
    const missingOption = option({ isOption: false, utilization: null, missingCptIds: [64] });
    const invalidOption = option({ isOption: false, utilization: 1.2 });

    assert.equal(
      getUnselectedLoadPointMarkerState(
        [validOption],
        false,
        false,
        "configuration_limits",
      ),
      "optimizer-unassigned",
    );
    assert.equal(
      getUnselectedLoadPointMarkerState(
        [missingOption],
        false,
        false,
        "configuration_limits",
      ),
      "missing",
    );
    assert.equal(
      getUnselectedLoadPointMarkerState(
        [invalidOption],
        false,
        false,
        "configuration_limits",
      ),
      "invalid",
    );
  });
});

function extractIntensity(style: string): number {
  return Number(style.match(/--utilization-intensity: ([0-9.]+)/)?.[1] ?? 0);
}
