import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getUsedPileConfigurations,
  filterActivePileOptions,
  isPileConfigurationActive,
  pileConfigurationKey,
  shouldDisableActivePileConfigurationToggle,
  toggleActivePileConfiguration,
  toggleActiveNumber,
} from "./activePileConfigurations.ts";

describe("active pile configurations", () => {
  it("accepts only options whose size and tip are both active", () => {
    const active = { pileSizes: [290], pileTipLevels: [-18] };

    assert.equal(isPileConfigurationActive({ pile_size_mm: 290, pile_tip_level_m: -18 }, active), true);
    assert.equal(isPileConfigurationActive({ pile_size_mm: 320, pile_tip_level_m: -18 }, active), false);
    assert.equal(isPileConfigurationActive({ pile_size_mm: 290, pile_tip_level_m: -19 }, active), false);
  });

  it("filters pile options by the shared active configuration set", () => {
    const options = [
      { pile_size_mm: 290, pile_tip_level_m: -18 },
      { pile_size_mm: 320, pile_tip_level_m: -18 },
    ];

    assert.deepEqual(filterActivePileOptions(options, { pileSizes: [290], pileTipLevels: [-18] }), [options[0]]);
  });

  it("toggles numeric values and keeps them sorted", () => {
    assert.deepEqual(toggleActiveNumber([320], 290, true), [290, 320]);
    assert.deepEqual(toggleActiveNumber([-18], -19, true, true), [-18, -19]);
    assert.deepEqual(toggleActiveNumber([290, 320], 290, false), [320]);
  });

  it("allows toggling the final active size or tip off", () => {
    assert.deepEqual(toggleActivePileConfiguration({ pileSizes: [290], pileTipLevels: [-18] }, "size", 290), {
      pileSizes: [],
      pileTipLevels: [-18],
    });
    assert.deepEqual(toggleActivePileConfiguration({ pileSizes: [290], pileTipLevels: [-18] }, "tip", -18), {
      pileSizes: [290],
      pileTipLevels: [],
    });
  });

  it("does not disable the final active legend toggle", () => {
    assert.equal(shouldDisableActivePileConfigurationToggle({ pileSizes: [290], pileTipLevels: [-18] }, "size", 290), false);
    assert.equal(shouldDisableActivePileConfigurationToggle({ pileSizes: [290], pileTipLevels: [-18] }, "tip", -18), false);
  });

  it("builds the scaled Rust configuration key", () => {
    assert.deepEqual(pileConfigurationKey({ pile_size_mm: 320, pile_tip_level_m: -18.5 }), {
      pile_size_mm: 320,
      pile_tip_level_m_key: -18500,
    });
  });

  it("derives active sizes and tips from chosen pile options", () => {
    assert.deepEqual(
      getUsedPileConfigurations([
        { pile_size_mm: 320, pile_tip_level_m: -18 },
        { pile_size_mm: 290, pile_tip_level_m: -19 },
        null,
      ]),
      {
        pileSizes: [290, 320],
        pileTipLevels: [-18, -19],
      },
    );
  });
});
