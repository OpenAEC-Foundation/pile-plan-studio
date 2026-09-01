import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pileConfigurationToken,
  samePileConfiguration,
} from "./pileConfigurationKey.ts";

describe("canonical pile configuration keys", () => {
  it("tokens already-canonical integer fields without metre conversion", () => {
    assert.equal(
      pileConfigurationToken({ pile_size_mm: 320, pile_tip_level_mm: -18_500 }),
      "320|-18500",
    );
  });

  it("compares structured configurations by both canonical fields", () => {
    assert.equal(
      samePileConfiguration(
        { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
        { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
      ),
      true,
    );
    assert.equal(
      samePileConfiguration(
        { pile_size_mm: 320, pile_tip_level_mm: -18_500 },
        { pile_size_mm: 350, pile_tip_level_mm: -18_500 },
      ),
      false,
    );
  });
});
