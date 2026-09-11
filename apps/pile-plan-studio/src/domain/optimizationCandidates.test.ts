import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deduplicateAndSortPileConfigurationKeys,
  resolveOptimizationCandidates,
} from "./optimizationCandidates.ts";

const catalog = [
  { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
  { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
  { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
  { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
];

describe("optimization candidate resolution", () => {
  it("returns a canonical deduplicated catalog for all available candidates", () => {
    assert.deepEqual(deduplicateAndSortPileConfigurationKeys(catalog), [
      { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
      { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
      { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
    ]);
  });

  it("resolves active legend to exact catalog keys without creating combinations", () => {
    assert.deepEqual(resolveOptimizationCandidates(catalog, "active_legend", {
      pileSizes: [290, 320],
      pileTipLevelMms: [-18_000, -19_000],
    }), [
      { pile_size_mm: 290, pile_tip_level_mm: -18_000 },
      { pile_size_mm: 320, pile_tip_level_mm: -18_000 },
      { pile_size_mm: 320, pile_tip_level_mm: -19_000 },
    ]);

    assert.deepEqual(resolveOptimizationCandidates(catalog, "active_legend", {
      pileSizes: [290],
      pileTipLevelMms: [-19_000],
    }), []);
  });
});
