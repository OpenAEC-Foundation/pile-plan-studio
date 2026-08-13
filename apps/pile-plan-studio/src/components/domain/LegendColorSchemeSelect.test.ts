import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendColorSchemeSelect", () => {
  it("renders six named palette previews in a keyboard listbox", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorSchemeSelect.tsx"), "utf8");

    assert.match(source, /LEGEND_COLOR_SCHEMES\.map/);
    assert.match(source, /getLegendColorSchemePreview/);
    assert.match(source, /role="listbox"/);
    assert.match(source, /role="option"/);
    assert.match(source, /ArrowDown/);
    assert.match(source, /ArrowUp/);
    assert.match(source, /event\.key === "Enter"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /useRef/);
    assert.match(source, /document\.addEventListener\("pointerdown"/);
    assert.match(source, /rootRef\.current\?\.contains/);
    assert.match(source, /document\.removeEventListener\("pointerdown"/);
  });

  it("fills the stable toolbar column without depending on translated label width", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorSchemeSelect.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    assert.doesNotMatch(source, /legend-scheme-width-probe/);
    assert.match(css, /\.legend-scheme-select\s*\{[^}]*display:\s*inline-grid[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
    assert.match(css, /\.legend-editor-auto-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(190px, 1\.25fr\) minmax\(0, 1\.1fr\)/s);
    assert.match(css, /\.legend-scheme-options\s*\{[^}]*width:\s*100%/s);
    assert.match(css, /\.legend-scheme-options\s*>\s*button\s*>\s*span:first-child\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    assert.doesNotMatch(css, /\.legend-scheme-options\s*\{[^}]*width:\s*min\(320px/s);
  });
});
