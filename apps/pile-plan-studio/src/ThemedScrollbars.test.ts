import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("themed scrollbars", () => {
  const css = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");

  it("uses theme colors for native and WebView scrollbars", () => {
    assert.match(css, /\*\s*\{[^}]*scrollbar-color:\s*var\(--theme-text-muted\)\s+var\(--theme-surface\)/s);
    assert.match(css, /\*::\-webkit-scrollbar-track\s*\{[^}]*background:\s*var\(--theme-surface\)/s);
    assert.match(css, /\*::\-webkit-scrollbar-thumb\s*\{[^}]*background:\s*var\(--theme-text-muted\)/s);
    assert.match(css, /\*::\-webkit-scrollbar-thumb\s*\{[^}]*border:[^;]*var\(--theme-surface\)/s);
    assert.match(css, /\*::\-webkit-scrollbar-thumb:hover\s*\{[^}]*background:\s*var\(--theme-text-secondary\)/s);
    assert.match(css, /\*::\-webkit-scrollbar-button\s*\{[^}]*display:\s*none/s);
    assert.match(css, /\*::\-webkit-scrollbar-corner\s*\{[^}]*background:\s*var\(--theme-surface\)/s);
  });
});
