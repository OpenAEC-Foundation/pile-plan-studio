import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commitCostInput, parseCostInput } from "./costSettingsModel.ts";

describe("cost settings model", () => {
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
