import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LegendColorSchemeSelect", () => {

  it("fills the stable toolbar column without depending on translated label width", () => {
    const source = readFileSync(resolve(import.meta.dirname, "LegendColorSchemeSelect.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "LegendEditor.css"), "utf8");

    assert.doesNotMatch(source, /legend-scheme-width-probe/);
    assert.match(css, /\.legend-scheme-select\s*\{[^}]*display:\s*inline-grid[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
    assert.match(css, /\.legend-editor-auto-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(190px, 1\.25fr\)/s);
    assert.match(css, /\.legend-editor-auto-actions\.is-dual\s*\{[^}]*grid-template-columns:[^}]*minmax\(170px, 1\.15fr\)[^}]*minmax\(170px, 1\.15fr\)/s);
    assert.match(css, /\.legend-scheme-options\s*\{[^}]*width:\s*100%/s);
    assert.match(css, /\.legend-scheme-options\s*>\s*button\s*>\s*span:first-child\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    assert.doesNotMatch(css, /\.legend-scheme-options\s*\{[^}]*width:\s*min\(320px/s);
  });
});
