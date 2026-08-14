import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "InterfaceScaleNotice.tsx"), "utf8");
const css = readFileSync(resolve(import.meta.dirname, "InterfaceScaleNotice.css"), "utf8");

describe("desktop interface scale control", () => {
  it("announces the logical percentage and exposes decrease, increase, and reset actions", () => {
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /\{notice\.percent\}%/);
    assert.match(source, /onDecrease: \(\) => void/);
    assert.match(source, /onIncrease: \(\) => void/);
    assert.match(source, /onReset: \(\) => void/);
    assert.match(source, /onClick=\{onDecrease\}/);
    assert.match(source, /onClick=\{onIncrease\}/);
    assert.match(source, /onClick=\{onReset\}/);
  });

  it("expires after two idle seconds and postpones dismissal during interaction", () => {
    assert.match(source, /window\.setTimeout\([\s\S]*?2000/);
    assert.match(source, /window\.clearTimeout/);
    assert.match(source, /onPointerEnter=\{pauseExpiry\}/);
    assert.match(source, /onPointerLeave=\{scheduleExpiry\}/);
    assert.match(source, /onFocusCapture=\{pauseExpiry\}/);
    assert.match(source, /onBlurCapture=/);
  });

  it("uses an interactive themed overlay positioned from its title-bar anchor", () => {
    assert.match(css, /position:\s*absolute/);
    assert.match(css, /top:/);
    assert.match(css, /right:/);
    assert.match(css, /pointer-events:\s*auto/);
    assert.match(css, /var\(--theme-surface\)/);
    assert.match(css, /var\(--theme-border\)/);
    assert.match(css, /var\(--theme-text\)/);
  });
});
