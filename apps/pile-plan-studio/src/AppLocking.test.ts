import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");

function functionBlock(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

describe("App load-point lock editing", () => {
  it("moves the current selection into the lock draft on entry", () => {
    const block = functionBlock("const startLockEditing", "const cancelLockEditing");

    assert.match(block, /loadPointLockSelectionSnapshot:\s*{/);
    assert.match(block, /startLoadPointLockDraft\([\s\S]*current\.selectedLoadPointIds/);
    assert.match(block, /selectedLoadPointIds:\s*\[\]/);
    assert.match(block, /selectedLoadPointId:\s*null/);
    assert.match(block, /selectedCptId:\s*null/);
  });

  it("restores the entry selection when lock editing is cancelled", () => {
    const block = functionBlock("const cancelLockEditing", "const unlockAllInDraft");

    assert.match(block, /loadPointLockSelectionSnapshot/);
    assert.match(block, /selectedLoadPointIds:\s*snapshot\.selectedLoadPointIds/);
    assert.match(block, /selectedLoadPointId:\s*snapshot\.selectedLoadPointId/);
    assert.match(block, /selectedCptId:\s*snapshot\.selectedCptId/);
  });

  it("discards the entry selection snapshot when locks are applied", () => {
    const block = functionBlock("const applyLockEditing", "const renameProjectPilePlan");

    assert.match(block, /loadPointLockSelectionSnapshot:\s*null/);
  });
});
