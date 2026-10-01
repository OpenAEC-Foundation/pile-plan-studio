import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commitCostInput, parseCostInput, costEditErrorKey } from "./costSettingsModel.ts";

describe("cost settings model", () => {
  it("distinguishes an existing pile size from invalid input", () => {
    assert.equal(costEditErrorKey(new Error("duplicate_pile_size")), "cost.duplicateSize");
    assert.equal(costEditErrorKey(new Error("invalid_cost")), "cost.invalidRow");
    assert.equal(costEditErrorKey(undefined), "cost.invalidRow");
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
