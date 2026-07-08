import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatNumber, formatOptionalNumber } from "./formatting.ts";

describe("formatting", () => {
  it("formats numbers with at most one decimal", () => {
    assert.equal(formatNumber(1234.56), "1,234.6");
    assert.equal(formatNumber(18), "18");
  });

  it("formats missing and non-finite optional numbers as dashes", () => {
    assert.equal(formatOptionalNumber(null), "-");
    assert.equal(formatOptionalNumber(undefined), "-");
    assert.equal(formatOptionalNumber(Number.NaN), "-");
    assert.equal(formatOptionalNumber(Number.POSITIVE_INFINITY), "-");
  });

  it("formats finite optional numbers with a suffix", () => {
    assert.equal(formatOptionalNumber(693, " kN"), "693 kN");
    assert.equal(formatOptionalNumber(0.114, "%", 100), "11.4%");
  });
});
