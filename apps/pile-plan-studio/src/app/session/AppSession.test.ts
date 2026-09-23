import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./AppSession.tsx", import.meta.url), "utf8");

describe("App group editing and assessment orchestration", () => {
  it("applies group edits as one guarded project commit without changing assignments", () => {
    assert.match(source, /previewLoadPointGroupEditCore\(\{/);
    assert.match(source, /applyLoadPointGroupEditCore\(\{/);
    assert.match(source, /current\.loadPointGroupingSettings !== capturedSettings/);
    assert.match(source, /loadPointGroupingSettings: groupingSettings/);
    assert.doesNotMatch(
      source.slice(source.indexOf("const applyGroupEdit"), source.indexOf("const applyGroupedPileConfiguration")),
      /selectedPileConfigurationsByLoadPoint:\s*new Map/,
    );
  });

  it("keeps original IDs after ungrouping and selects the returned full group after grouping", () => {
    assert.match(source, /action === "group"[\s\S]*result\.grouping\.groups/);
    assert.match(source, /action === "ungroup"[\s\S]*capturedSelectedIds/);
  });

  it("derives conflicts from completed groups, assignments, and locks", () => {
    assert.match(source, /useGroupAssignmentAssessment/);
    assert.match(source, /groups: loadPointGroups\.groups/);
    assert.match(source, /assignments: projectState\.selectedPileConfigurationsByLoadPoint/);
    assert.match(source, /lockedLoadPointIds: \[\.\.\.activeLockedLoadPointIdSet\]/);
  });

  it("continues using the completed group snapshot while a replacement is pending", () => {
    const assignmentSection = source.slice(
      source.indexOf("const applyGroupedPileConfiguration"),
      source.indexOf("const renameProjectPilePlan"),
    );
    assert.doesNotMatch(assignmentSection, /loadPointGroups\.pending/);
    assert.match(source, /useIlpOptimization\(projectState, loadPointGroups\.groups/);
  });
});
