import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { stepNumericDraft } from "./themedNumberInputModel.ts";

describe("ThemedNumberInput integration", () => {
  it("is used by every numeric editor", () => {
    const files = [
      "../domain/CostSettingsPanel.tsx",
      "../domain/OptimizationPanel.tsx",
      "../domain/PilePlanImportPanel.tsx",
      "../domain/RightPanel.tsx",
    ];

    files.forEach((file) => {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      assert.match(source, /ThemedNumberInput/);
      assert.doesNotMatch(source, /<input[\s\S]{0,180}?type="number"/);
    });
  });

  it("steps drafts repeatedly without accumulating floating point errors", () => {
    assert.equal(stepNumericDraft("10", 1, { min: 0, step: 1 }), "11");
    assert.equal(stepNumericDraft("10", -1, { min: 0, step: 1 }), "9");
    assert.equal(stepNumericDraft("0.2", 1, { min: 0, step: 0.1 }), "0.3");
    assert.equal(stepNumericDraft("0", -1, { min: 0, step: 1 }), "0");
    assert.equal(stepNumericDraft("100", 1, { max: 100, min: 0, step: 1 }), "100");
  });

  it("starts a delayed repeat and stops it on pointer completion", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ThemedNumberInput.tsx"), "utf8");
    assert.match(source, /window\.setTimeout\([\s\S]*?window\.setInterval/);
    assert.match(source, /onPointerUp=\{stopRepeating\}/);
    assert.match(source, /onPointerCancel=\{stopRepeating\}/);
    assert.match(source, /onPointerLeave=\{stopRepeating\}/);
  });

  it("shows the stepper on pointer hover without keeping it visible after focus", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "ThemedNumberInput.css"), "utf8");
    assert.match(styles, /\.themed-number-input:hover \.themed-number-stepper/);
    assert.doesNotMatch(styles, /focus-within[^{]*\.themed-number-stepper/);
  });
});
