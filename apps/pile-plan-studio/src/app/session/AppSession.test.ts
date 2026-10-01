import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./AppSession.tsx", import.meta.url), "utf8");
const groupController = readFileSync(new URL("../project/groupEditController.ts", import.meta.url), "utf8");
const groupHook = readFileSync(new URL("../project/useGroupEdit.ts", import.meta.url), "utf8");

describe("App group editing and assessment orchestration", () => {
  it("applies group edits as one guarded project commit without changing assignments", () => {
    assert.match(source, /useGroupEdit\(\{/);
    assert.match(source, /commit: \(update, action\) => commitProjectState\(update, action\)/);
    assert.match(groupHook, /preview: previewLoadPointGroupEditCore/);
    assert.match(groupHook, /evaluate: applyLoadPointGroupEditCore/);
    assert.match(groupController, /state\.loadPointGroupingSettings === input\.settings/);
    assert.match(groupController, /loadPointGroupingSettings: groupingSettings/);
    assert.doesNotMatch(
      groupController,
      /selectedPileConfigurationsByLoadPoint:\s*new Map/,
    );
  });

  it("keeps original IDs after ungrouping and selects the returned full group after grouping", () => {
    assert.match(groupController, /action === "group"[\s\S]*result\.grouping\.groups/);
    assert.match(groupController, /action === "ungroup"[\s\S]*input\.selectedLoadPointIds/);
  });

  it("derives conflicts from completed groups, assignments, and locks", () => {
    assert.match(source, /useGroupAssignmentAssessment/);
    assert.match(source, /groups: loadPointGroups\.groups/);
    assert.match(source, /assignments: projectState\.selectedPileConfigurationsByLoadPoint/);
    assert.match(source, /lockedLoadPointIds: \[\.\.\.activeLockedLoadPointIdSet\]/);
  });

  it("continues using the completed group snapshot while a replacement is pending", () => {
    assert.match(source, /groupsReady: \(\) => hasCompletedLoadPointGroups/);
    assert.match(source, /useIlpOptimization\(projectState, loadPointGroups\.groups/);
  });
});
