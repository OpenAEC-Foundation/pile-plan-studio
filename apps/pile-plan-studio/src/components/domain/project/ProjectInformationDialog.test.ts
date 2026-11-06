import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePileHeadLevel, normalizeProjectName } from "./projectInformationModel.ts";

describe("Project information", () => {
  it("stores a trimmed non-empty project name", () => {
    assert.equal(normalizeProjectName("  Alpha foundation  "), "Alpha foundation");
    assert.equal(normalizeProjectName("   "), null);
  });

  it("accepts decimal comma or point pile head levels", () => {
    assert.equal(normalizePileHeadLevel("-1,25"), -1.25);
    assert.equal(normalizePileHeadLevel("2.5"), 2.5);
    assert.equal(normalizePileHeadLevel(""), null);
    assert.equal(normalizePileHeadLevel("not a level"), null);
  });

});
