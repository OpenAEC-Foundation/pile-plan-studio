import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useTechnicalAssignment", () => {
  it("returns loading synchronously when the rendered input signature changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "useTechnicalAssignment.ts"), "utf8");

    assert.match(source, /buildTechnicalAssignmentSignature/);
    assert.match(source, /rendered\.inputSignature !== inputSignature/);
    assert.match(source, /return inputSignature === null \? INITIAL_SNAPSHOT : LOADING_SNAPSHOT/);
  });
});
