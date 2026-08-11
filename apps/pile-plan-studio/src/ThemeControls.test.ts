import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("native themed controls", () => {
  const themes = readFileSync(resolve(import.meta.dirname, "themes.css"), "utf8");

  it("renders native number steppers for each light and dark theme", () => {
    assert.match(themes, /\[data-theme="light"\]\s*{[\s\S]*?color-scheme:\s*light/);
    for (const theme of ["forge", "openaec", "blueprint", "contrast"]) {
      assert.match(themes, new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[\\s\\S]*?color-scheme:\\s*dark`));
    }
  });
});
