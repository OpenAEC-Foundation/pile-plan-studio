import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getConfigurationStyle, getLegendItems } from "./legend.ts";
import type { BearingCapacity } from "../core/projectTypes.ts";

describe("pile symbol legend", () => {
  it("builds legend items from bearing capacity configurations", () => {
    const manySizes: BearingCapacity[] = [290, 320, 350, 380, 400, 450, 500, 550, 600, 650]
      .map((pileSize) => ({
        cpt_id: 1,
        pile_tip_level_m: -18,
        pile_size_mm: pileSize,
        frd_kn: 700,
      }));

    assert.deepEqual(getLegendItems(manySizes), {
      pileSizes: [
        { value: 290, shape: "circle" },
        { value: 320, shape: "square" },
        { value: 350, shape: "diamond" },
        { value: 380, shape: "triangle-up" },
        { value: 400, shape: "triangle-down" },
        { value: 450, shape: "triangle-left" },
        { value: 500, shape: "triangle-right" },
        { value: 550, shape: "pentagon" },
        { value: 600, shape: "star" },
        { value: 650, shape: "thin-diamond" },
      ],
      pileTipLevels: [{ value: -18, color: "#4e79a7" }],
    });
  });

  it("returns a stable style for a pile configuration", () => {
    const legend = getLegendItems([
      { cpt_id: 11, pile_tip_level_m: -18, pile_size_mm: 320, frd_kn: 700 },
    ]);

    assert.deepEqual(getConfigurationStyle({ pile_size_mm: 320, pile_tip_level_m: -18 }, legend), {
      shape: "circle",
      color: "#4e79a7",
    });
  });

  it("assigns unique colors when there are more than ten tip levels", () => {
    const manyTipLevels: BearingCapacity[] = Array.from({ length: 14 }, (_, index) => ({
      cpt_id: 1,
      pile_tip_level_m: -17 - index * 0.25,
      pile_size_mm: 320,
      frd_kn: 700,
    }));

    const colors = getLegendItems(manyTipLevels).pileTipLevels.map((item) => item.color);

    assert.equal(new Set(colors).size, colors.length);
  });
});
