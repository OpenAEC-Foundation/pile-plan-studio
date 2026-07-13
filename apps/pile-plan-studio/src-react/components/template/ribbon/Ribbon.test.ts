import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Optimize ribbon", () => {
  it("connects settings and run commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenOptimizationSettings/);
    assert.match(source, /onRunOptimization/);
    assert.match(source, /optimizationDisabled/);
    assert.match(source, /label=\{t\("optimize\.run"\)\} disabled=\{optimizationDisabled\} onClick=\{onRunOptimization\}/);
  });
});
