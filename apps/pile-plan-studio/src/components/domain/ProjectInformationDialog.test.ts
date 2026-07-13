import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeProjectName } from "./projectInformationModel.ts";

describe("Project information", () => {
  it("stores a trimmed non-empty project name", () => {
    assert.equal(normalizeProjectName("  Alpha foundation  "), "Alpha foundation");
    assert.equal(normalizeProjectName("   "), null);
  });
});
