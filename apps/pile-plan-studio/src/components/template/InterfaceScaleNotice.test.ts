import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "InterfaceScaleNotice.tsx"), "utf8");
const css = readFileSync(resolve(import.meta.dirname, "InterfaceScaleNotice.css"), "utf8");

describe("desktop interface scale notice", () => {
  it("announces the logical percentage and expires after 1.5 seconds", () => {
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /\{notice\.percent\}%/);
    assert.match(source, /window\.setTimeout\([\s\S]*?1500/);
    assert.match(source, /window\.clearTimeout/);
  });

  it("uses a non-interactive themed top-right surface", () => {
    assert.match(css, /position:\s*fixed/);
    assert.match(css, /top:/);
    assert.match(css, /right:/);
    assert.match(css, /pointer-events:\s*none/);
    assert.match(css, /var\(--theme-surface\)/);
    assert.match(css, /var\(--theme-border\)/);
    assert.match(css, /var\(--theme-text\)/);
  });
});
