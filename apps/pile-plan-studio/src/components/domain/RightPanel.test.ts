import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React optimization panel", () => {
  it("provides a permanent settings tab with simple controls and run feedback", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");

    assert.match(panel, /label="Optimization"/);
    assert.match(optimization, /Greedy optimizer/);
    assert.match(optimization, /Maximum different sizes/);
    assert.match(optimization, /Maximum different tip levels/);
    assert.match(optimization, /Maximum different configurations/);
    assert.match(optimization, /Run Greedy Optimization/);
    assert.match(optimization, /optimizationSummary/);
    assert.match(optimization, /optimizationError/);
  });
});
