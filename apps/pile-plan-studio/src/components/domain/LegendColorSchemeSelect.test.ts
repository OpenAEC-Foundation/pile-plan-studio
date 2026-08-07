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

  it("sizes the trigger and list from the longest label in the active language", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorSchemeSelect.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    assert.match(source, /legend-scheme-width-probe/);
    assert.match(source, /legend-scheme-width-labels/);
    assert.match(source, /LEGEND_COLOR_SCHEMES\.map\(\(scheme\) => \(/);
    assert.match(css, /\.legend-scheme-select\s*\{[^}]*display:\s*inline-grid[^}]*width:\s*max-content/s);
    assert.match(css, /\.legend-scheme-width-labels\s*>\s*span\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s);
    assert.match(css, /\.legend-scheme-options\s*\{[^}]*width:\s*100%/s);
    assert.doesNotMatch(css, /\.legend-scheme-options\s*\{[^}]*width:\s*min\(320px/s);
  });
});
