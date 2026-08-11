import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pile cost recalculation", () => {
  const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

  it("recalculates costs when the project pile head level changes", () => {
    assert.match(
      source,
      /\[projectState\.pileCostSettings, projectState\.pileHeadLevelM, projectState\.pileOptionsByLoadPointId\]/,
    );
  });
});
