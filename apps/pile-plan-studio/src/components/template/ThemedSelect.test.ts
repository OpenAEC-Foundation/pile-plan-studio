import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ThemedSelect", () => {
  it("exposes accessible listbox semantics without native selection colors", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ThemedSelect.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "ThemedSelect.css"), "utf8");

    assert.match(source, /aria-label=\{ariaLabel\}/);
    assert.match(source, /role="listbox"/);
    assert.match(source, /role="option"/);
    assert.match(source, /disabled=\{opt\.disabled\}/);
    assert.match(styles, /\.themed-select-item\.active\s*\{[\s\S]*?background:\s*var\(--theme-dialog-tab-active-bg\)/);
  });

  it("renders its menu in a viewport overlay so scrolling panels cannot clip it", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ThemedSelect.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "ThemedSelect.css"), "utf8");

    assert.match(source, /createPortal/);
    assert.match(source, /getBoundingClientRect/);
    assert.match(source, /elementLayoutScale/);
    assert.match(source, /menuRef/);
    assert.match(source, /getComputedStyle\(triggerButton \?\? trigger\)/);
    assert.match(source, /fontFamily:\s*triggerFont\.fontFamily/);
    assert.match(source, /fontSize:\s*triggerFont\.fontSize/);
    assert.match(styles, /\.themed-select-menu\s*\{[\s\S]*?position:\s*fixed/);
    assert.doesNotMatch(styles, /\.themed-select-menu\s*\{[\s\S]*?top:\s*100%/);
  });
});
