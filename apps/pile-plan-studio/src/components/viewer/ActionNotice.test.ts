import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("viewer action notice", () => {

  it("adds restrained error styling without changing placement or motion behavior", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ActionNotice.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "ActionNotice.css"), "utf8");

    assert.match(source, /<Banner tone=\{tone === "error" \? "error" : "info"\}/);
    assert.match(css, /position:\s*absolute/);
    assert.match(css, /left:\s*50%/);
    assert.match(css, /bottom:/);
    assert.match(css, /pointer-events:\s*none/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
    assert.match(css, /action-notice-fade/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });
});
