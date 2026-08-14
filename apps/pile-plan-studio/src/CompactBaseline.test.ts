import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");
const main = readFileSync(resolve(import.meta.dirname, "main.tsx"), "utf8");

describe("compact application baseline", () => {
  it("uses the same root-level compact zoom in browser and desktop", () => {
    assert.match(css, /html\.compact-application-baseline\s*\{[\s\S]*?zoom:\s*0\.8/);
    assert.match(main, /applyRuntimeBaseline\(\)/);
    assert.doesNotMatch(main, /isDesktopRuntime/);
    assert.doesNotMatch(css, /--app-baseline-inverse/);
    assert.doesNotMatch(css, /#root\s*\{[\s\S]*?zoom:/);
    assert.doesNotMatch(css, /#root\s*\{[\s\S]*?transform:\s*scale\(/);
    assert.match(css, /html,[\s\S]*?body,[\s\S]*?#root\s*\{[\s\S]*?width:\s*100%/);
  });
});
