import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Alpha command surfaces", () => {
  it("keeps only working quick access commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "TitleBar.tsx"), "utf8");
    assert.match(source, /onSave/);
    assert.match(source, /onClick=\{onSave\}/);
    assert.doesNotMatch(source, /aria-label=\{t\("undo"\)\}/);
    assert.doesNotMatch(source, /aria-label=\{t\("redo"\)\}/);
    assert.doesNotMatch(source, /aria-label=\{t\("print"\)\}/);
  });

  it("does not show backstage commands without alpha behavior", () => {
    const source = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    assert.doesNotMatch(source, /label=\{t\("new"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("saveAs"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("print"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("extensions"\)\}/);
    assert.doesNotMatch(source, /actionAndClose/);
  });
});
