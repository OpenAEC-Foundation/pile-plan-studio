import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("App load point group integration", () => {
  it("uses the derived runtime partition and delegates assignment decisions to Rust", () => {
    assert.match(source, /useLoadPointGroups\(projectState\.loadPoints\)/);
    assert.match(source, /getEffectivePileOptionsByLoadPointId\(projectState\)/);
    assert.match(source, /currentPreview\?\.status === "analyzing"/);
    assert.match(source, /applyLoadPointGroupAssignmentCore\(\{/);
    assert.doesNotMatch(source, /distance.*1200|1200.*distance/i);
  });

  it("rejects stale responses before changing the active plan", () => {
    assert.match(source, /pileAssignmentRequestIdRef\.current \+= 1/);
    assert.match(source, /capturedActivePilePlanId = projectState\.activePilePlanId/);
    assert.match(source, /capturedAssignments = projectState\.selectedPileConfigurationsByLoadPoint/);
    assert.match(source, /requestId !== pileAssignmentRequestIdRef\.current/);
    assert.match(source, /latest\.activePilePlanId !== capturedActivePilePlanId/);
    assert.match(source, /latest\.selectedPileConfigurationsByLoadPoint !== capturedAssignments/);
  });

  it("commits every applied change once and reports blocked locks as an error notice", () => {
    assert.match(source, /if \(result\.status === "blocked"\)/);
    assert.match(
      source,
      /showActionNotice\(\s*t\("loadPointGroups\.assignmentBlocked"[\s\S]*?"error"/,
    );
    assert.match(source, /commitProjectState\(\(current\) => \{/);
    assert.match(source, /for \(const change of result\.changes\)/);
    assert.match(source, /synchronizeActivePilePlan\(/);
  });

  it("removes group assignments returned as empty changes", () => {
    assert.match(source, /requestedConfiguration: PileConfigurationKey \| null/);
    assert.match(source, /if \(change\.configuration\) \{/);
    assert.match(source, /nextAssignments\.delete\(change\.load_point_id\)/);
  });

  it("rejects a response when groups or locks changed during the request", () => {
    assert.match(source, /capturedGroups = loadPointGroups\.groups/);
    assert.match(source, /loadPointGroupsRef\.current !== capturedGroups/);
    assert.match(source, /capturedLockedLoadPointSignature/);
    assert.match(source, /getLoadPointLockSignature\(latest\.pilePlans, capturedActivePilePlanId\)/);
    assert.match(source, /getLoadPointLockSignature\(current\.pilePlans, capturedActivePilePlanId\)/);
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
