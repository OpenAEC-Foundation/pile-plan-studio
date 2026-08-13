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

  it("uses a shared themed stepper without native Chromium arrows", () => {
    const appStyles = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");
    const numberSource = readFileSync(resolve(import.meta.dirname, "components/template/ThemedNumberInput.tsx"), "utf8");
    const numberStyles = readFileSync(resolve(import.meta.dirname, "components/template/ThemedNumberInput.css"), "utf8");

    assert.match(numberSource, /stepNumericDraft\(valueRef\.current, direction, inputProps\)/);
    assert.match(numberStyles, /::-webkit-inner-spin-button[\s\S]*?-webkit-appearance:\s*none/);
    assert.match(numberStyles, /\.themed-number-input > input\s*\{[\s\S]*?box-sizing:\s*border-box/);
    assert.match(numberStyles, /\.themed-number-stepper\s*\{[\s\S]*?visibility:\s*hidden[\s\S]*?background:\s*color-mix\(in srgb, var\(--theme-text\) 7%, var\(--theme-dialog-input-bg\)\)/);
    assert.match(numberStyles, /\.themed-number-input:hover \.themed-number-stepper\s*\{[\s\S]*?visibility:\s*visible/);
    assert.doesNotMatch(numberStyles, /focus-within[^{]*\.themed-number-stepper/);
    assert.match(appStyles, /input\[type="number"\]:focus-visible\s*\{[\s\S]*?outline:\s*none/);
    assert.match(appStyles, /input\[type="number"\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*inset 0 0 0 1px var\(--theme-focus-color\)/);
  });

  it("does not apply input chrome to the project currency wrapper", () => {
    const appStyles = readFileSync(resolve(import.meta.dirname, "App.css"), "utf8");

    assert.doesNotMatch(appStyles, /\.project-information-form input,\s*\n\.project-information-form select,\s*\n\.project-information-form \.themed-select/);
    assert.match(appStyles, /\.project-information-form \.themed-select\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  });
});
