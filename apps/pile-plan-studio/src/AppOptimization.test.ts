import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyOptimizationResult } from "./components/domain/optimizationPanelModel.ts";

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
    assert.match(optimizationBlock, /resolveOptimizationCandidates/);
    assert.match(optimizationBlock, /candidateConfigurations/);
    assert.match(optimizationBlock, /candidateConfigurations,\s*\n\s*\}\)/);
    assert.match(optimizationBlock, /resolvedCandidateConfigurations: candidateConfigurations/);
    assert.match(optimizationBlock, /optimizationCandidateToken\(currentCandidates\) !== candidateSnapshotToken/);
    assert.match(optimizationBlock, /currentSnapshot\.optimizationSettings\.candidate_source !== candidateSource/);
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

  it("clears grouped technical failures without persisting them as optimizer outcomes", () => {
    const applied = applyOptimizationResult({
      previousChoices: new Map([
        [1, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
        [2, { pile_size_mm: 290, pile_tip_level_mm: -18_000 }],
        [3, { pile_size_mm: 320, pile_tip_level_mm: -19_000 }],
        [4, { pile_size_mm: 320, pile_tip_level_mm: -19_000 }],
        [5, { pile_size_mm: 350, pile_tip_level_mm: -20_000 }],
      ]),
      result: {
        assignments: [],
        unassigned: [{ load_point_id: 5, reason: "configuration_limits" }],
        technical_unassigned_load_point_ids: [1, 2, 3, 4],
        unassigned_group_count: 1,
        selected_configurations: [],
        pile_size_count: 0,
        pile_tip_level_count: 0,
        configuration_count: 0,
      },
    });

    assert.deepEqual(applied.choices, new Map());
    assert.deepEqual(applied.optimizationUnassignedByLoadPoint, new Map([
      [5, "configuration_limits"],
    ]));
    assert.deepEqual(applied.summary, {
      assignedCount: 0,
      changedCount: 5,
      technicalUnassignedCount: 4,
      optimizerUnassignedCount: 1,
    });
    assert.equal("unresolvedGroupCount" in applied.summary, false);
  });
});
