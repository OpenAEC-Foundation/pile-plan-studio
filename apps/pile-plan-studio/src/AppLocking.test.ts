import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "app/session/AppSession.tsx"), "utf8");
const editingSource = readFileSync(resolve(import.meta.dirname, "domain/pile-plans/loadPointLockEditing.ts"), "utf8");

function functionBlock(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

describe("App load-point lock editing", () => {
  it("moves the current selection into the lock draft on entry", () => {
    const block = functionBlock("const startLockEditing", "const cancelLockEditing");

    assert.match(block, /setRightTaskPanel\(null\)/);
    assert.match(block, /setProjectState\(beginLoadPointLockEditing\)/);
    assert.match(editingSource, /loadPointLockSelectionSnapshot:\s*{/);
    assert.match(editingSource, /startLoadPointLockDraft\([\s\S]*state\.selectedLoadPointIds/);
    assert.match(editingSource, /selectedLoadPointIds:\s*\[\]/);
    assert.match(editingSource, /selectedLoadPointId:\s*null/);
    assert.match(editingSource, /selectedCptId:\s*null/);
  });

  it("restores the entry selection when lock editing is cancelled", () => {
    const block = functionBlock("const cancelLockEditing", "const unlockAllInDraft");

    assert.match(block, /setProjectState\(cancelLoadPointLockEditing\)/);
    assert.match(editingSource, /selectedLoadPointIds:\s*snapshot\.selectedLoadPointIds/);
    assert.match(editingSource, /selectedLoadPointId:\s*snapshot\.selectedLoadPointId/);
    assert.match(editingSource, /selectedCptId:\s*snapshot\.selectedCptId/);
  });

  it("discards the entry selection snapshot when locks are applied", () => {
    const block = functionBlock("const applyLockEditing", "const renameProjectPilePlan");

    assert.match(block, /commitProjectState\(finishLoadPointLockEditing\)/);
    assert.match(editingSource, /loadPointLockSelectionSnapshot:\s*null/);
  });
});
