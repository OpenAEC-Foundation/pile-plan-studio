import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pile cost recalculation", () => {
  const source = readFileSync(resolve(import.meta.dirname, "app/derived-state/usePileOptionCosts.ts"), "utf8");

  it("recalculates costs when the project pile head level changes", () => {
    assert.match(
      source,
      /\[pileCostSettings, pileHeadLevelM, pileOptionsByLoadPointId, setProjectState\]/,
    );
  });
});
