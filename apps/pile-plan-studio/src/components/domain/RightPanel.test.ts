import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React optimization panel", () => {
  it("provides a closable task panel outside the permanent context tabs", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
    const optimization = readFileSync(resolve(import.meta.dirname, "OptimizationPanel.tsx"), "utf8");

    assert.doesNotMatch(panel, /PanelTab label="Optimization"/);
    assert.match(panel, /taskPanel === "optimization"/);
    assert.match(panel, /onCloseTaskPanel/);
    assert.match(optimization, /aria-label="Close optimization settings"/);
    assert.match(optimization, /Greedy optimizer/);
    assert.match(optimization, /Maximum different sizes/);
    assert.match(optimization, /Maximum different tip levels/);
    assert.match(optimization, /Maximum different configurations/);
    assert.match(optimization, /Run Greedy Optimization/);
    assert.match(optimization, /optimizationSummary/);
    assert.match(optimization, /optimizationError/);
  });
});
