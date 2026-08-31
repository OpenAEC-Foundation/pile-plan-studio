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
    assert.match(optimizationBlock, /applyOptimizationResult/);
    assert.match(optimizationBlock, /replaceOptimizationOutcomesForTargets/);
    assert.match(optimizationBlock, /targetLoadPointIds/);
    assert.match(optimizationBlock, /lockedLoadPointIds/);
    assert.match(optimizationBlock, /currentAssignments/);
    assert.match(optimizationBlock, /pile_tip_level_m_key: Math\.round\(pileTipLevelM \* 1000\)/);
    assert.doesNotMatch(optimizationBlock, /const chosenOption/);
    assert.match(optimizationBlock, /limitScope: snapshot\.optimizationLimitScope/);
    assert.doesNotMatch(optimizationBlock, /baselineOptions/);
    assert.doesNotMatch(optimizationBlock, /activePileSizes:\s*applied/);
    assert.doesNotMatch(optimizationBlock, /activePileTipLevels:\s*applied/);
  });

  it("clears transient run feedback after plan switches and manual pile changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const changeStart = source.indexOf("const handleProjectStateChange");
    const changeEnd = source.indexOf("const importPilePlan", changeStart);
    const changeBlock = source.slice(changeStart, changeEnd);
    const activateStart = source.indexOf("const activatePilePlan");
    const activateEnd = source.indexOf("const startLockEditing", activateStart);
    const activateBlock = source.slice(activateStart, activateEnd);

    assert.match(changeBlock, /selectedPileOptionKeysByLoadPoint\s*!==\s*projectState\.selectedPileOptionKeysByLoadPoint/);
    assert.match(changeBlock, /optimizationSummary:\s*null/);
    assert.match(changeBlock, /optimizationError:\s*null/);
    assert.match(activateBlock, /optimizationSummary:\s*null/);
    assert.match(activateBlock, /optimizationError:\s*null/);
  });
});
