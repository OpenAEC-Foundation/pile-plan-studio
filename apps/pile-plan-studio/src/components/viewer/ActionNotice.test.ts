import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("viewer action notice", () => {
  it("uses one polite status region for neutral feedback", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ActionNotice.tsx"), "utf8");

    assert.match(source, /tone = "neutral"/);
    assert.match(source, /role=\{tone === "error" \? "alert" : "status"\}/);
    assert.match(source, /aria-live=\{tone === "error" \? "assertive" : "polite"\}/);
    assert.match(source, /key=\{noticeId\}/);
  });

  it("adds restrained error styling without changing placement or motion behavior", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ActionNotice.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "ActionNotice.css"), "utf8");

    assert.match(source, /is-error/);
    assert.match(css, /position:\s*absolute/);
    assert.match(css, /left:\s*50%/);
    assert.match(css, /bottom:/);
    assert.match(css, /pointer-events:\s*none/);
    assert.match(css, /\.action-notice\.is-error/);
    assert.match(css, /action-notice-fade/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });
});
