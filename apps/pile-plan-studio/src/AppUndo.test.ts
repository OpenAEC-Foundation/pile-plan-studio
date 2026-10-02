import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "app/session/AppSession.tsx"), "utf8");

describe("App Undo integration", () => {
  it("uses the project history reducer as the single top-level project state owner", () => {
    assert.match(source, /useReducer\(\s*projectHistoryReducer/);
    assert.match(source, /createManagedProjectState/);
    assert.match(source, /const projectState = managedProject\.present/);
  });

  it("separates committed content, runtime updates, and replacement projects", () => {
    assert.match(source, /const commitProjectState/);
    assert.match(source, /type: "commit"/);
    assert.match(source, /const setProjectState/);
    assert.match(source, /type: "runtime"/);
    assert.match(source, /const replaceProjectState/);
    assert.match(source, /type: "replace"/);
  });

  it("routes central workspace changes and project operations through commits", () => {
    const workspaceChangeStart = source.indexOf("const handleProjectStateChange");
    const workspaceChangeEnd = source.indexOf("const importPilePlan", workspaceChangeStart);
    const workspaceChangeBlock = source.slice(workspaceChangeStart, workspaceChangeEnd);

    assert.match(workspaceChangeBlock, /commitProjectState\(/);
    assert.match(source, /const importPilePlan[\s\S]*?commitProjectState/);
    assert.match(source, /const applyLockEditing[\s\S]*?commitProjectState/);
    assert.match(source, /const renameProjectPilePlan[\s\S]*?commitProjectState/);
    assert.match(source, /const duplicateProjectPilePlan[\s\S]*?commitProjectState/);
    assert.match(source, /const deleteProjectPilePlan[\s\S]*?commitProjectState/);
  });

  it("keeps asynchronous default choices inside the refresh history entry", () => {
    assert.match(source, /const amendProjectState/);
    assert.match(source, /defaultSelectionKeepsDirtyRef\.current[\s\S]*?amendProjectState/);
  });

  it("wires the ribbon gesture to the shared history controller", () => {
    assert.match(source, /createSymbolScaleHistory\(\{\s*commit: commitProjectState,\s*amend: amendProjectState/);
    assert.match(source, /onSymbolScaleChangeStart=\{symbolScaleHistory.begin\}/);
    assert.match(source, /onSymbolScaleChange=\{symbolScaleHistory.change\}/);
    assert.match(source, /onSymbolScaleChangeEnd=\{symbolScaleHistory.end\}/);
  });

  it("shows history results in the viewer without replacing general status feedback", () => {
    assert.match(source, /import ActionNotice/);
    assert.match(source, /showActionNotice\(describeHistoryResult/);
    assert.match(source, /<ActionNotice/);
    assert.match(source, /message=\{statusMessage\}/);
    assert.doesNotMatch(source, /historyMessage=\{historyMessage\}/);
  });
});
