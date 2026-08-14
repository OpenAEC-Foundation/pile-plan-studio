import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("viewer theme surfaces", () => {
  it("uses the application background around the white drawing canvas", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "viewer.css"), "utf8");

    assert.match(styles, /\.pile-plan-workspace\s*{[\s\S]*?background:\s*var\(--theme-bg\)/);
    assert.match(styles, /\.viewer-canvas\s*{[\s\S]*?background:\s*#f8fafb/);
  });
});
