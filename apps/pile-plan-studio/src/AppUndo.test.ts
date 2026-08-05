import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

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
    assert.match(source, /handleProjectStateChange[\s\S]*?commitProjectState\(nextState\)/);
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

  it("clears history when a different project is installed", () => {
    assert.match(source, /const installOpenedProject[\s\S]*?replaceProjectState\(project\)/);
  });

  it("supports history shortcuts without overriding focused editors", () => {
    assert.match(source, /isEditableTarget/);
    assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
    assert.match(source, /const key = event\.key\.toLowerCase\(\)/);
    assert.match(source, /key === "z"/);
    assert.match(source, /key === "y"/);
    assert.match(source, /dispatchProject\(\{ type: "undo" \}\)/);
    assert.match(source, /dispatchProject\(\{ type: "redo" \}\)/);
  });
});
