import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("native themed controls", () => {
  const themes = readFileSync(resolve(import.meta.dirname, "themes.css"), "utf8");
  const tokens = readFileSync(resolve(import.meta.dirname, "openaec/openaec-tokens.css"), "utf8");

  it("renders native number steppers for each light and dark theme", () => {
    for (const theme of ["light", "high-contrast-light"]) {
      assert.match(tokens, new RegExp(`\\[data-oa-theme="${theme}"\\]\\s*\\{[^}]*?color-scheme:\\s*light`));
    }
    for (const theme of ["dark", "blueprint", "high-contrast-dark"]) {
      assert.match(tokens, new RegExp(`\\[data-oa-theme="${theme}"\\]\\s*\\{[^}]*?color-scheme:\\s*dark`));
    }
  });

  it("resolves compatibility aliases from the shared Blueprint tokens", () => {
    for (const [, token] of themes.matchAll(/var\((--oa-[\w-]+)\)/g)) {
      assert.ok(tokens.includes(`${token}:`), token);
    }
  });

  it("uses a shared themed stepper without native Chromium arrows", () => {
    const appStyles = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");
    const numberSource = readFileSync(resolve(import.meta.dirname, "openaec/number-field-preview/number.tsx"), "utf8");
    const numberStyles = readFileSync(resolve(import.meta.dirname, "openaec/number-field-preview/number-field.css"), "utf8");

    assert.match(numberSource, /stepNumberDraft\(state\.value, direction, state\.props\)/);
    assert.match(numberStyles, /::-webkit-inner-spin-button[\s\S]*?-webkit-appearance:\s*none/);
    assert.match(numberStyles, /\.oa-number-input > \.oa-field\s*\{[\s\S]*?box-sizing:\s*border-box/);
    assert.match(numberStyles, /\.oa-number-stepper\s*\{[^}]*?top:\s*2px;[^}]*?right:\s*2px;[^}]*?bottom:\s*2px/);
    assert.match(numberStyles, /\.oa-number-input:hover > \.oa-number-stepper/);
    assert.match(numberStyles, /\.oa-number-input:focus-within > \.oa-number-stepper/);
    assert.match(appStyles, /input\[type="number"\]:not\(\.oa-field\):focus-visible\s*\{[\s\S]*?outline:\s*none/);
    assert.match(appStyles, /input\[type="number"\]:not\(\.oa-field\):focus-visible\s*\{[\s\S]*?box-shadow:\s*inset 0 0 0 1px var\(--theme-focus-color\)/);
  });

});
