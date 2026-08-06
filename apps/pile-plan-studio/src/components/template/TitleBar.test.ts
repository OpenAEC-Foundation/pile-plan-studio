import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("title bar history controls", () => {
  const source = readFileSync(resolve(import.meta.dirname, "TitleBar.tsx"), "utf8");

  it("exposes Undo and Redo buttons with next-action labels", () => {
    assert.match(source, /canUndo: boolean/);
    assert.match(source, /canRedo: boolean/);
    assert.match(source, /undoLabel: string/);
    assert.match(source, /redoLabel: string/);
    assert.match(source, /onUndo: \(\) => void/);
    assert.match(source, /onRedo: \(\) => void/);
    assert.match(source, /disabled=\{!canUndo\}/);
    assert.match(source, /disabled=\{!canRedo\}/);
    assert.match(source, /title=\{undoLabel\}/);
    assert.match(source, /title=\{redoLabel\}/);
  });
});
