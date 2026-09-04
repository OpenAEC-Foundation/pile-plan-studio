import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createBuiltInLegend } from "../viewer/legend.ts";
import {
  getConfigurationActivationPresentation,
  INACTIVE_LEGEND_COLOR,
} from "./legendActivationPresentation.ts";

const configuration = { pile_size_mm: 290, pile_tip_level_m: -18 };
const baseLegend = createBuiltInLegend([
  { cpt_id: 1, ...configuration, frd_kn: 700 },
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
            pileTipLevels: tipActive ? [-18] : [],
          },
        );

        assert.equal(result.smallDot, !symbolActive);
        assert.equal(result.color === INACTIVE_LEGEND_COLOR, !colorActive);
        assert.equal(result.sizeActive, sizeActive);
        assert.equal(result.tipActive, tipActive);
      });
    }
  });
}
