import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mergeDefaultPileChoices } from "./defaultPileChoices.ts";

describe("mergeDefaultPileChoices", () => {
  it("fills missing defaults without replacing retained choices", () => {
    const retained = new Map([[1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }]]);
    const defaults = new Map([
      [1, { pile_size_mm: 320, pile_tip_level_mm: -20_000 }],
      [2, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
    ]);

    const merged = mergeDefaultPileChoices(retained, defaults);

    assert.deepEqual([...merged], [
      [1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
      [2, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
    ]);
    assert.deepEqual([...retained], [[1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }]]);
    assert.deepEqual([...defaults], [
      [1, { pile_size_mm: 320, pile_tip_level_mm: -20_000 }],
      [2, { pile_size_mm: 290, pile_tip_level_mm: -17_500 }],
    ]);
  });
});
