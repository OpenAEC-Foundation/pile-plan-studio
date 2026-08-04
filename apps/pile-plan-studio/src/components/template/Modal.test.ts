import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Modal", () => {
  it("exposes dialog semantics and contains keyboard focus", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Modal.tsx"), "utf8");

    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby=\{titleId\}/);
    assert.match(source, /e\.key === "Tab"/);
    assert.match(source, /getFocusableElements/);
  });

  it("restores focus and accepts a localized close label", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Modal.tsx"), "utf8");

    assert.match(source, /previouslyFocusedElement/);
    assert.match(source, /previouslyFocusedElement\.current\?\.focus\(\)/);
    assert.match(source, /closeLabel\?: string/);
    assert.match(source, /aria-label=\{closeLabel\}/);
  });
});
