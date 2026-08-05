import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commitNumberDraft } from "./numberInputModel.ts";

describe("number input drafts", () => {
  it("allows a concrete value to be cleared before applying its fallback", () => {
    assert.equal(commitNumberDraft("", 25, { emptyValue: 0, min: 0 }), 0);
  });

  it("leaves an untouched mixed value unchanged", () => {
    assert.equal(commitNumberDraft("", null, { emptyValue: 0, min: 0 }), null);
  });

  it("clamps entered values only when they are committed", () => {
    assert.equal(commitNumberDraft("-4", 25, { emptyValue: 0, min: 0 }), 0);
    assert.equal(commitNumberDraft("500", 120, { emptyValue: 1, min: 1, max: 360 }), 360);
  });

  it("restores the current value when the draft is invalid", () => {
    assert.equal(commitNumberDraft("not-a-number", 25, { emptyValue: 0, min: 0 }), 25);
  });
});
