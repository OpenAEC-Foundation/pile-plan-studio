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
    assert.match(optimizationBlock, /new Map\(currentAssignmentsIdentity\)/);
    assert.doesNotMatch(optimizationBlock, /Math\.round/);
    assert.doesNotMatch(optimizationBlock, /const chosenOption/);
    assert.match(optimizationBlock, /limitScope: snapshot\.optimizationLimitScope/);
    assert.match(optimizationBlock, /groups: loadPointGroups\.groups/);
    assert.match(optimizationBlock, /pileHeadLevelM: snapshot\.pileHeadLevelM/);
    assert.match(optimizationBlock, /outcome\.status === "blocked"/);
    assert.match(optimizationBlock, /formatOptimizationDiagnostics/);
    assert.match(optimizationBlock, /activePilePlanId !== activePilePlanId/);
    assert.match(optimizationBlock, /selectedPileConfigurationsByLoadPoint !== currentAssignmentsIdentity/);
    assert.doesNotMatch(optimizationBlock, /baselineOptions/);
    assert.doesNotMatch(optimizationBlock, /activePileSizes:\s*applied/);
    assert.doesNotMatch(optimizationBlock, /activePileTipLevels:\s*applied/);
  });

  it("waits for the project-wide group partition before optimization", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const start = source.indexOf("const optimizationDisabled");
    const end = source.indexOf("const installOpenedProject", start);
    const disabledBlock = source.slice(start, end);

    assert.match(disabledBlock, /isOptimizationDisabled/);
    assert.match(disabledBlock, /groupsPending: loadPointGroups\.pending/);
    assert.match(disabledBlock, /groupsError: loadPointGroups\.error/);
    assert.match(disabledBlock, /groupCount: loadPointGroups\.groups\.length/);
  });

  it("clears transient run feedback after plan switches and manual pile changes", () => {
    const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
    const changeStart = source.indexOf("const handleProjectStateChange");
    const changeEnd = source.indexOf("const importPilePlan", changeStart);
    const changeBlock = source.slice(changeStart, changeEnd);
    const activateStart = source.indexOf("const activatePilePlan");
    const activateEnd = source.indexOf("const startLockEditing", activateStart);
    const activateBlock = source.slice(activateStart, activateEnd);

    assert.match(changeBlock, /selectedPileConfigurationsByLoadPoint\s*!==\s*projectState\.selectedPileConfigurationsByLoadPoint/);
    assert.match(changeBlock, /optimizationSummary:\s*null/);
    assert.match(changeBlock, /optimizationError:\s*null/);
    assert.match(activateBlock, /optimizationSummary:\s*null/);
    assert.match(activateBlock, /optimizationError:\s*null/);
  });
});
