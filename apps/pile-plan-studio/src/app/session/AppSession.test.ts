import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./AppSession.tsx", import.meta.url), "utf8");

describe("App group editing and assessment wiring", () => {
  it("delegates MCP construction to the connection-scoped project factory", () => {
    assert.match(source, /createProjectMcpSession\(\{/);
    assert.match(source, /useMcpConnection\(isDesktop, createMcpSession/);
    assert.doesNotMatch(source, /createSourceImportSession|createPilePlanImportSession|createSessionMcpDispatcher/);
  });

  it("uses the shared group edit controller for previews and commits", () => {
    assert.match(source, /useGroupEdit\(\{/);
    assert.match(source, /commit: commitProjectState/);
    assert.match(source, /onPreviewLoadPointGroupEdit=/);
    assert.match(source, /onApplyLoadPointGroupEdit=/);
  });

  it("wires group assessment to project assignments and locks", () => {
    assert.match(source, /useGroupAssignmentAssessment/);
    assert.match(source, /groups: loadPointGroups\.groups/);
    assert.match(source, /assignments: projectState\.selectedPileConfigurationsByLoadPoint/);
    assert.match(source, /lockedLoadPointIds: \[\.\.\.activeLockedLoadPointIdSet\]/);
  });

  it("wires operations to the completed-group readiness gate", () => {
    assert.match(source, /groupsReady: \(\) => hasCompletedLoadPointGroups/);
    assert.match(source, /useIlpOptimization\(projectState, loadPointGroups\.groups/);
  });
});
