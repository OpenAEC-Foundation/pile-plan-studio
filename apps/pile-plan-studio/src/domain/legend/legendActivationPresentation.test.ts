import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createBuiltInLegend } from "../../viewer/legend.ts";
import {
  getConfigurationActivationPresentation,
  INACTIVE_LEGEND_COLOR,
} from "./legendActivationPresentation.ts";

const configuration = {
  configuration: { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
  pile_size_mm: 290,
  pile_tip_level_m: -18,
};
const baseLegend = createBuiltInLegend([
  { cpt_id: 1, pile_size_mm: 290, pile_tip_level_m: -18, pile_tip_level_mm: -18_000, frd_kn: 700 },
]);

for (const encodingMode of ["size-symbol", "tip-symbol"] as const) {
  describe(`${encodingMode} activation presentation`, () => {
    for (const [symbolActive, colorActive] of [
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ] as const) {
      it(`resolves symbol ${symbolActive} and color ${colorActive}`, () => {
        const sizeActive = encodingMode === "size-symbol" ? symbolActive : colorActive;
        const tipActive = encodingMode === "size-symbol" ? colorActive : symbolActive;
        const result = getConfigurationActivationPresentation(
          configuration,
          { ...baseLegend, encodingMode },
          {
            pileSizes: sizeActive ? [290] : [],
            pileTipLevelMms: tipActive ? [-18_000] : [],
          },
        );

        assert.equal(result.smallDot, !symbolActive);
        assert.equal(result.color === INACTIVE_LEGEND_COLOR, !colorActive);
        assert.equal(result.sizeActive, sizeActive);
        assert.equal(result.tipActive, tipActive);
        assert.equal(result.tipRegionColor, null);
      });
    }
  });
}

describe("dual-color activation presentation", () => {
  for (const sizeActive of [true, false]) {
    for (const tipActive of [true, false]) {
      it(`presents size and tip colors independently when size=${sizeActive}, tip=${tipActive}`, () => {
        const result = getConfigurationActivationPresentation(configuration, {
          ...baseLegend, encodingMode: "size-color-tip-region",
          pileSizes: [{ ...baseLegend.pileSizes[0], color: "#123456" }],
          pileTipLevels: [{ ...baseLegend.pileTipLevels[0], color: "#ABCDEF" }],
        }, { pileSizes: sizeActive ? [290] : [], pileTipLevelMms: tipActive ? [-18_000] : [] });
        assert.equal(result.color, sizeActive ? "#123456" : "#8C989F");
        assert.equal(result.tipRegionColor, tipActive ? "#ABCDEF" : "#8C989F");
        assert.equal(result.smallDot, false);
      });
    }
  }

  it("uses neutral colors for a configuration absent from the legend", () => {
    const result = getConfigurationActivationPresentation(configuration, {
      ...baseLegend, encodingMode: "size-color-tip-region", pileSizes: [], pileTipLevels: [],
    }, { pileSizes: [290], pileTipLevelMms: [-18_000] });
    assert.equal(result.color, "#8C989F");
    assert.equal(result.tipRegionColor, "#8C989F");
  });

  it("keeps the cost-table shape while only size activation controls its color", () => {
    const costs = {
      schema_version: 2,
      items: [{ pile_size_mm: 290, shape: "square" as const, cost_per_m3: 220 }],
    };
    const inactiveTip = getConfigurationActivationPresentation(
      configuration,
      { ...baseLegend, encodingMode: "size-color-tip-region" },
      { pileSizes: [290], pileTipLevelMms: [] },
      costs,
    );
    const inactiveSize = getConfigurationActivationPresentation(
      configuration,
      { ...baseLegend, encodingMode: "size-color-tip-region" },
      { pileSizes: [], pileTipLevelMms: [-18_000] },
      costs,
    );

    assert.deepEqual(inactiveTip.symbol, { baseShape: "square", fillPattern: "full" });
    assert.equal(inactiveTip.smallDot, false);
    assert.equal(inactiveTip.color, baseLegend.pileSizes[0].color);
    assert.deepEqual(inactiveSize.symbol, { baseShape: "square", fillPattern: "full" });
    assert.equal(inactiveSize.smallDot, false);
    assert.equal(inactiveSize.color, INACTIVE_LEGEND_COLOR);
  });
});
