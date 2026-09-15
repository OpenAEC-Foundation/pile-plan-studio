import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filterActivePileOptions,
  pileConfigurationKey,
  toggleActiveNumber,
} from "./activePileConfigurations.ts";

describe("active pile configurations", () => {
  it("filters pile options by the shared active configuration set", () => {
    const options = [
      { configuration: { pile_size_mm: 290, pile_tip_level_mm: -18_000 }, pile_size_mm: 290, pile_tip_level_m: -18 },
      { configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 }, pile_size_mm: 320, pile_tip_level_m: -18 },
    ];

    assert.deepEqual(filterActivePileOptions(options, { pileSizes: [290], pileTipLevelMms: [-18_000] }), [options[0]]);
  });

  it("uses canonical millimetres despite harmless metre noise and separates adjacent millimetres", () => {
    const options = [
      { configuration: { pile_size_mm: 290, pile_tip_level_mm: -18_525 }, pile_size_mm: 290, pile_tip_level_m: -18.524999999999999 },
      { configuration: { pile_size_mm: 290, pile_tip_level_mm: -18_526 }, pile_size_mm: 290, pile_tip_level_m: -18.526 },
    ];

    assert.deepEqual(filterActivePileOptions(options, {
      pileSizes: [290],
      pileTipLevelMms: [-18_525],
    }), [options[0]]);
  });

  it("keeps only the inactive current assignment beside active options", () => {
    const options = [
      { configuration: { pile_size_mm: 290, pile_tip_level_mm: -18_000 }, pile_size_mm: 290, pile_tip_level_m: -18 },
      { configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_000 }, pile_size_mm: 320, pile_tip_level_m: -18 },
      { configuration: { pile_size_mm: 350, pile_tip_level_mm: -19_000 }, pile_size_mm: 350, pile_tip_level_m: -19 },
    ];

    assert.deepEqual(
      filterActivePileOptions(
        options,
        { pileSizes: [290], pileTipLevelMms: [-18_000] },
        { pile_size_mm: 350, pile_tip_level_mm: -19_000 },
      ),
      [options[0], options[2]],
    );
  });

  it("toggles numeric values and keeps them sorted", () => {
    assert.deepEqual(toggleActiveNumber([320], 290, true), [290, 320]);
    assert.deepEqual(toggleActiveNumber([-18], -19, true, true), [-18, -19]);
    assert.deepEqual(toggleActiveNumber([290, 320], 290, false), [320]);
  });

  it("copies the canonical Rust configuration key", () => {
    assert.deepEqual(pileConfigurationKey({
      configuration: { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
    }), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18500,
    });
  });

});
