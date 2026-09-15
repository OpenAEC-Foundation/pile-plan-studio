import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGEND_ENCODING_MODES,
  chooseLegendEncodingMode,
} from "./legendEncodingControls.ts";

describe("legend encoding controls", () => {
  it("offers every encoding mode as a direct choice", () => {
    assert.deepEqual(LEGEND_ENCODING_MODES, [
      "size-symbol",
      "tip-symbol",
      "size-color-tip-region",
    ]);
  });

  it("closes the disclosure after choosing an encoding mode", () => {
    const disclosure = { open: true };

    const enableTipLevelRegions = chooseLegendEncodingMode({
      disclosure,
      currentMode: "size-symbol",
      nextMode: "tip-symbol",
      enableTipLevelRegions: false,
    });

    assert.equal(disclosure.open, false);
    assert.equal(enableTipLevelRegions, false);
  });

  it("enables tip-level regions when entering the dual-color mode", () => {
    const disclosure = { open: true };

    const enableTipLevelRegions = chooseLegendEncodingMode({
      disclosure,
      currentMode: "size-symbol",
      nextMode: "size-color-tip-region",
      enableTipLevelRegions: false,
    });

    assert.equal(disclosure.open, false);
    assert.equal(enableTipLevelRegions, true);
  });

  it("preserves an explicit region choice when reselecting the active dual-color mode", () => {
    const disclosure = { open: true };

    const enableTipLevelRegions = chooseLegendEncodingMode({
      disclosure,
      currentMode: "size-color-tip-region",
      nextMode: "size-color-tip-region",
      enableTipLevelRegions: false,
    });

    assert.equal(disclosure.open, false);
    assert.equal(enableTipLevelRegions, false);
  });
});
