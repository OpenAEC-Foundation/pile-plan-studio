import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assignLegendColors,
  assignLegendSymbols,
  createBuiltInLegend,
  getConfigurationStyle,
  reconcileProjectLegend,
  resetLegendAppearance,
} from "./legend.ts";
import type { BearingCapacity, LegendItems } from "../core/projectTypes.ts";

const CAPACITIES: BearingCapacity[] = [
  { cpt_id: 1, pile_tip_level_m: -18, pile_size_mm: 290, frd_kn: 700 },
  { cpt_id: 1, pile_tip_level_m: -19, pile_size_mm: 320, frd_kn: 800 },
];

describe("project legend model", () => {
  it("creates deterministic full mappings for both visual channels", () => {
    const legend = createBuiltInLegend(CAPACITIES);

    assert.equal(legend.encodingMode, "size-symbol");
    assert.deepEqual(legend.pileSizes[0], {
      value: 290,
      symbol: { baseShape: "circle", fillPattern: "full" },
      color: "#4E79A7",
    });
    assert.deepEqual(legend.pileTipLevels.map(({ value }) => value), [-18, -19]);
    assert.ok(legend.pileTipLevels.every((item) => item.symbol && item.color));
  });

  it("reverses both visual channels without losing mappings", () => {
    const legend = createBuiltInLegend(CAPACITIES);
    assert.deepEqual(getConfigurationStyle({ pile_size_mm: 290, pile_tip_level_m: -18 }, legend), {
      symbol: legend.pileSizes[0].symbol,
      color: legend.pileTipLevels[0].color,
    });

    const reversed: LegendItems = { ...legend, encodingMode: "tip-symbol" };
    assert.deepEqual(getConfigurationStyle({ pile_size_mm: 290, pile_tip_level_m: -18 }, reversed), {
      symbol: legend.pileTipLevels[0].symbol,
      color: legend.pileSizes[0].color,
    });
  });

  it("retains absent mappings and appends only new source values", () => {
    const stored = createBuiltInLegend(CAPACITIES);
    stored.pileSizes[1] = { ...stored.pileSizes[1], color: "#123456" };
    const current = [
      { cpt_id: 1, pile_tip_level_m: -18, pile_size_mm: 320, frd_kn: 700 },
      { cpt_id: 1, pile_tip_level_m: -20, pile_size_mm: 350, frd_kn: 700 },
    ];

    const result = reconcileProjectLegend(stored, current);

    assert.equal(result.legend.pileSizes.find(({ value }) => value === 320)?.color, "#123456");
    assert.ok(result.legend.pileSizes.some(({ value }) => value === 290));
    assert.ok(result.legend.pileSizes.some(({ value }) => value === 350));
    assert.deepEqual(result.warnings, []);
  });

  it("falls back only malformed channels and identifies the affected value", () => {
    const stored = structuredClone(createBuiltInLegend(CAPACITIES)) as unknown as {
      encodingMode: string;
      pileSizes: Array<{ value: number; symbol: { baseShape: string; fillPattern: string }; color: string }>;
      pileTipLevels: Array<{ value: number; symbol: { baseShape: string; fillPattern: string }; color: string }>;
    };
    stored.pileSizes[0].symbol.baseShape = "future-star";
    stored.pileSizes[1].color = "not-a-color";

    const result = reconcileProjectLegend(stored, CAPACITIES);

    assert.deepEqual(result.warnings, [
      { itemType: "size", value: 290, field: "symbol" },
      { itemType: "size", value: 320, field: "color" },
    ]);
    assert.deepEqual(result.legend.pileSizes[0].symbol, { baseShape: "circle", fillPattern: "full" });
    assert.equal(result.legend.pileSizes[1].color, "#F28E2B");
  });

  it("assigns symbols only to scoped values and refuses more than 54", () => {
    const legend = createBuiltInLegend(CAPACITIES);
    const assigned = assignLegendSymbols(legend, "pileSizes", [320]);
    assert.equal(assigned.ok, true);
    if (assigned.ok) {
      assert.deepEqual(assigned.legend.pileSizes.find(({ value }) => value === 320)?.symbol,
        { baseShape: "circle", fillPattern: "full" });
    }

    const exhausted = assignLegendSymbols(legend, "pileSizes", Array.from({ length: 55 }, (_, index) => index));
    assert.deepEqual(exhausted, { ok: false, reason: "catalog-exhausted", limit: 54 });
  });

  it("assigns colors independently and resets appearance without activation state", () => {
    const legend = createBuiltInLegend(CAPACITIES);
    const recolored = assignLegendColors(legend, "pileTipLevels", [-19], "colorblind-friendly");
    assert.equal(recolored.pileTipLevels.find(({ value }) => value === -19)?.color, "#0072B2");
    assert.equal(recolored.pileTipLevels.find(({ value }) => value === -18)?.color, legend.pileTipLevels[0].color);

    const reset = resetLegendAppearance({ ...recolored, encodingMode: "tip-symbol" }, CAPACITIES);
    assert.deepEqual(reset, createBuiltInLegend(CAPACITIES));
  });
});
