import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getUseColumnLabel } from "./pileOptionColumns.ts";

describe("pile option columns", () => {
  it("shows Use for a single selected load point", () => {
    assert.equal(getUseColumnLabel(1), "Use");
  });

  it("shows Use (Avg) for multiple selected load points", () => {
    assert.equal(getUseColumnLabel(2), "Use (Avg)");
  });
});
