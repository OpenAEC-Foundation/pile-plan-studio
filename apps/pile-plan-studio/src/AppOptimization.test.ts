import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("App optimization integration", () => {
  it("applies optimized pile choices without replacing project legend settings", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const start = source.indexOf("const runGreedyOptimization");
    const end = source.indexOf("const optimizationDisabled", start);
    const optimizationBlock = source.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(optimizationBlock, /applyOptimizationChoices/);
    assert.match(optimizationBlock, /targetLoadPointIds/);
    assert.match(optimizationBlock, /lockedLoadPointIds/);
    assert.match(optimizationBlock, /currentAssignments/);
    assert.match(optimizationBlock, /limitScope: snapshot\.optimizationLimitScope/);
    assert.doesNotMatch(optimizationBlock, /baselineOptions/);
    assert.doesNotMatch(optimizationBlock, /activePileSizes:\s*applied/);
    assert.doesNotMatch(optimizationBlock, /activePileTipLevels:\s*applied/);
  });
});
