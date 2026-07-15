import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getCptLabelScale } from "./cptLabel.ts";

describe("CPT label sizing", () => {
  it("keeps two-digit labels readable and shrinks longer labels continuously", () => {
    assert.equal(getCptLabelScale("25"), 0.34);
    assert.ok(getCptLabelScale("125") < getCptLabelScale("25"));
    assert.ok(getCptLabelScale("1125") < getCptLabelScale("125"));
    assert.ok(getCptLabelScale("123456") >= 0.18);
  });
});
