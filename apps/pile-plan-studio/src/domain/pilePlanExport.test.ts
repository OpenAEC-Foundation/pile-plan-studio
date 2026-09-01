import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPilePlanExportInput } from "./pilePlanExport.ts";
import type { ProjectState } from "./projectState.ts";

describe("pile plan export input", () => {
  it("uses current pile choices and effective selected CPTs", () => {
    const state = {
      loadPoints: [{
        id: 7,
        name: "Load point 7",
        x_mm: 1000,
        y_mm: 2000,
        design_load_kn: 90,
      }],
      selectedPileConfigurationsByLoadPoint: new Map([[7, {
        pile_size_mm: 320,
        pile_tip_level_mm: -18_500,
      }]]),
      selectedCptsByLoadPointId: new Map([[
        7,
        [
          {
            label: "upper right",
            cpt: { id: 12, name: "CPT 12", x_mm: 0, y_mm: 0 },
            distance_mm: 1000,
          },
          {
            label: "lower left",
            cpt: { id: 3, name: "CPT 3", x_mm: 0, y_mm: 0 },
            distance_mm: 2000,
          },
        ],
      ]]),
    } as Pick<
      ProjectState,
      "loadPoints" | "selectedPileConfigurationsByLoadPoint" | "selectedCptsByLoadPointId"
    >;

    const input = buildPilePlanExportInput(state);

    assert.deepEqual(input.selectedPiles.get(7), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_500,
    });
    assert.deepEqual(input.selectedCpts.get(7), [12, 3]);
  });

  it("omits absent pile choices", () => {
    const state = {
      loadPoints: [],
      selectedPileConfigurationsByLoadPoint: new Map(),
      selectedCptsByLoadPointId: new Map(),
    } as Pick<
      ProjectState,
      "loadPoints" | "selectedPileConfigurationsByLoadPoint" | "selectedCptsByLoadPointId"
    >;

    assert.deepEqual(buildPilePlanExportInput(state).selectedPiles, new Map());
  });
});
