import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(import.meta.dirname, "InterfaceScaleNotice.css"), "utf8");

describe("desktop interface scale control", () => {

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
