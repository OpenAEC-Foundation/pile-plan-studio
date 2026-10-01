import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./app/session/AppSession.tsx", import.meta.url), "utf8");
const technicalHook = readFileSync(new URL("./app/derived-state/useProjectTechnicalAssignment.ts", import.meta.url), "utf8");
const technicalPreparation = readFileSync(new URL("./app/derived-state/projectTechnicalAssignment.ts", import.meta.url), "utf8");
const assignmentHook = readFileSync(new URL("./app/project/usePileAssignment.ts", import.meta.url), "utf8");
const assignmentController = readFileSync(new URL("./app/project/pileAssignmentController.ts", import.meta.url), "utf8");

describe("App load point group integration", () => {
  it("uses the derived runtime partition and delegates assignment decisions to Rust", () => {
    assert.match(source, /useLoadPointGroups\(\s*projectState\.loadPoints,\s*projectState\.loadPointGroupingSettings,?\s*\)/);
    assert.match(source, /useProjectTechnicalAssignment\(projectState, loadPointGroups\)/);
    assert.match(technicalHook, /getEffectivePileOptionsByLoadPointId\(state\)/);
    assert.match(technicalHook, /useTechnicalAssignment\(input\)/);
    assert.match(technicalPreparation, /preview\?\.status === "analyzing"/);
    assert.match(source, /usePileAssignment\(\{/);
    assert.match(source, /currentGroups: \(\) => loadPointGroupsRef\.current/);
    assert.match(source, /groupsReady: \(\) => hasCompletedLoadPointGroups/);
    assert.match(assignmentHook, /evaluate: applyLoadPointGroupAssignmentCore/);
    assert.doesNotMatch(source, /distance.*1200|1200.*distance/i);
  });

  it("rejects stale responses before changing the active plan", () => {
    assert.match(assignmentController, /requestId === generation/);
    assert.match(assignmentController, /state\.activePilePlanId === captured\.activePilePlanId/);
    assert.match(assignmentController, /state\.selectedPileConfigurationsByLoadPoint === captured\.selectedPileConfigurationsByLoadPoint/);
    assert.match(assignmentController, /if \(!isCurrent\(dependencies\.currentState\(\)\)\) return/);
  });

  it("commits every applied change once and reports blocked locks as an error notice", () => {
    assert.match(assignmentController, /if \(result\.status === "blocked"\)/);
    assert.match(
      source,
      /showActionNotice\(\s*t\("loadPointGroups\.assignmentBlocked"[\s\S]*?"error"/,
    );
    assert.match(source, /commit: \(update\) => commitProjectState\(update\)/);
    assert.match(assignmentController, /for \(const change of result\.changes\)/);
    assert.match(assignmentController, /synchronizeActivePilePlan\(/);
  });

  it("removes group assignments returned as empty changes", () => {
    assert.match(assignmentController, /requestedConfiguration: PileConfigurationKey \| null/);
    assert.match(assignmentController, /if \(change\.configuration\) \{/);
    assert.match(assignmentController, /nextAssignments\.delete\(change\.load_point_id\)/);
  });

  it("rejects a response when groups or locks changed during the request", () => {
    assert.match(assignmentController, /dependencies\.currentGroups\(\) === capturedGroups/);
    assert.match(assignmentController, /getLoadPointLockSignature\(state\.pilePlans, captured\.activePilePlanId\) === capturedLockSignature/);
    assert.match(assignmentController, /if \(!isCurrent\(current\)\) return current/);
  });

  it("invalidates assignment requests for replacement projects and plan switches", () => {
    assert.match(source, /invalidatePileAssignmentRequests/);
    assert.match(source, /replaceProjectState/);
    assert.match(source, /projectState\.activePilePlanId/);
  });

  it("provides the blocked-assignment message in both interface languages", () => {
    const english = JSON.parse(readFileSync(
      new URL("./i18n/locales/en/common.json", import.meta.url),
      "utf8",
    ));
    const dutch = JSON.parse(readFileSync(
      new URL("./i18n/locales/nl/common.json", import.meta.url),
      "utf8",
    ));

    assert.match(english.loadPointGroups.assignmentBlocked, /\{\{names\}\}/);
    assert.match(dutch.loadPointGroups.assignmentBlocked, /\{\{names\}\}/);
  });
});
