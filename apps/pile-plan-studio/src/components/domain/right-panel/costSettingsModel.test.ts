import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PileCostSettings } from "../.././core/projectTypes.ts";
import { commitCostInput, parseCostInput, updatePileCostItem } from "./costSettingsModel.ts";

const settings: PileCostSettings = {
  schema_version: 1,
  items: [
    { pile_size_mm: 290, shape: "round", cost_per_m3: 210 },
    { pile_size_mm: 320, shape: "square", cost_per_m3: 230 },
  ],
};

describe("cost settings model", () => {
  it("updates shape and non-negative cost for one pile size", () => {
    const next = updatePileCostItem(settings, 290, { shape: "square", cost_per_m3: -10 });

    assert.deepEqual(next.items[0], {
      pile_size_mm: 290,
      shape: "square",
      cost_per_m3: 0,
    });
    assert.deepEqual(next.items[1], settings.items[1]);
    assert.notEqual(next.items, settings.items);
  });

  it("ignores non-finite numeric values", () => {
    assert.equal(
      updatePileCostItem(settings, 290, { cost_per_m3: Number.POSITIVE_INFINITY }),
      settings,
    );
  });

  it("keeps an empty cost field as an editing state instead of converting it to zero", () => {
    assert.equal(parseCostInput(""), null);
    assert.equal(parseCostInput("   "), null);
    assert.equal(parseCostInput("245"), 245);
  });

  it("commits the complete draft and treats an empty draft as zero", () => {
    assert.equal(commitCostInput("245"), 245);
    assert.equal(commitCostInput(""), 0);
    assert.equal(commitCostInput("   "), 0);
  });
});
