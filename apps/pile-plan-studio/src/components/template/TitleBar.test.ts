import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("title bar history controls", () => {
  const source = readFileSync(resolve(import.meta.dirname, "TitleBar.tsx"), "utf8");

  it("uses the shared Pile Plan Studio app icon without temporary text", () => {
    assert.match(source, /src="\/pile-plan-studio-icon\.svg"/);
    assert.match(source, /alt=""/);
    assert.match(source, /aria-hidden="true"/);
    assert.doesNotMatch(source, />\s*tmp\s*</i);
  });

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

  it("joins the Undo and Redo arrowheads to the ends of their shafts", () => {
    assert.match(source, /<path d="M9 14 4 9l5-5" \/>/);
    assert.match(source, /<path d="M4 9h10\.5a5\.5 5\.5 0 0 1 0 11H11" \/>/);
    assert.match(source, /<path d="m15 4 5 5-5 5" \/>/);
    assert.match(source, /<path d="M20 9H9\.5a5\.5 5\.5 0 0 0 0 11H13" \/>/);
  });

  it("leaves window management to the browser or native desktop frame", () => {
    assert.doesNotMatch(source, /@tauri-apps\/api\/window/);
    assert.doesNotMatch(source, /titlebar-minimize/);
    assert.doesNotMatch(source, /titlebar-maximize/);
    assert.doesNotMatch(source, /titlebar-close/);
    assert.doesNotMatch(source, /toggleMaximize|\.minimize\(\)|\.close\(\)/);
  });
});
