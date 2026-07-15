import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getHighlightedGoverningCptId,
  getLoadPointIdsForLegendSelection,
  toggleLegendSelectionFilter,
  shouldHighlightGoverningCpt,
} from "./legendSelection.ts";
import type { PileConfigurationOption } from "../core/projectTypes.ts";

function option(size: number, tip: number): PileConfigurationOption {
  return {
    pile_size_mm: size,
    pile_tip_level_m: tip,
    isOption: true,
    governing_cpt_id: 61,
    governing_frd_kn: 700,
    utilization: 0.7,
    missing_cpt_ids: [],
  };
}

describe("legend selection", () => {
  it("combines size filters as a union and intersects them with tip filters", () => {
    const chosenOptions = new Map<number, PileConfigurationOption | null>([
      [1, option(290, -18)],
      [2, option(320, -18)],
      [3, option(350, -18)],
      [4, option(290, -19)],
    ]);
    const filters = {
      pileSizes: [290, 320],
      pileTipLevels: [-18],
    };

    assert.deepEqual(getLoadPointIdsForLegendSelection(chosenOptions, filters), [1, 2]);
  });

  it("toggles selected legend values and clears the selection when both groups are empty", () => {
    const withSize = toggleLegendSelectionFilter({ pileSizes: [], pileTipLevels: [] }, "size", 290);
    const withTip = toggleLegendSelectionFilter(withSize, "tip", -18);
    const withoutSize = toggleLegendSelectionFilter(withTip, "size", 290);
    const withoutTip = toggleLegendSelectionFilter(withoutSize, "tip", -18);

    assert.deepEqual(withSize, { pileSizes: [290], pileTipLevels: [] });
    assert.deepEqual(withTip, { pileSizes: [290], pileTipLevels: [-18] });
    assert.deepEqual(withoutSize, { pileSizes: [], pileTipLevels: [-18] });
    assert.deepEqual(withoutTip, { pileSizes: [], pileTipLevels: [] });
  });

  it("does not highlight a governing CPT that is not in the active CPT selection while editing", () => {
    assert.equal(shouldHighlightGoverningCpt(61, [61, 62]), true);
    assert.equal(shouldHighlightGoverningCpt(61, [62]), false);
  });

  it("finds the governing CPT for the shared selected pile configuration", () => {
    const highlighted = getHighlightedGoverningCptId({
      activeSelectedCptIds: [61, 62],
      pileOptionsByLoadPointId: new Map([[1, [option(290, -18)]]]),
      selectedLoadPointIds: [1],
      selectedPileOptionKeysByLoadPoint: new Map([[1, "290|-18"]]),
    });

    assert.equal(highlighted, 61);
  });

  it("does not mark a governing CPT when selected load points use different configurations", () => {
    const highlighted = getHighlightedGoverningCptId({
      activeSelectedCptIds: [61],
      pileOptionsByLoadPointId: new Map([
        [1, [option(290, -18)]],
        [2, [option(320, -18)]],
      ]),
      selectedLoadPointIds: [1, 2],
      selectedPileOptionKeysByLoadPoint: new Map([
        [1, "290|-18"],
        [2, "320|-18"],
      ]),
    });

    assert.equal(highlighted, null);
  });
});
