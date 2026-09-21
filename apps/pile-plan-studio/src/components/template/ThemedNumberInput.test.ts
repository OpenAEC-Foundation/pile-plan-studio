import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { stepNumericDraft } from "./themedNumberInputModel.ts";

describe("ThemedNumberInput integration", () => {
  it("is used by every numeric editor", () => {
    const files = [
      "../domain/right-panel/CostCatalogEditor.tsx",
      "../domain/pile-plans/ilp-optimization/IlpOptimizationSettingsPanel.tsx",
      "../domain/imports/PilePlanImportPanel.tsx",
      "../domain/right-panel/PanelControls.tsx",
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

  it("steps decimal drafts by one, preserving the fraction and respecting bounds", () => {
    assert.equal(stepNumericDraft("1.5", 1, { step: 1 }), "2.5");
    assert.equal(stepNumericDraft("1,5", -1, { step: 1 }), "0.5");
    assert.equal(stepNumericDraft("99,5", 1, { min: 0, max: 100, step: 1 }), "100");
    assert.equal(stepNumericDraft("0,25", -1, { min: 0, step: 1 }), "0");
  });

  it("starts empty limit drafts at the catalog maximum when stepping down", () => {
    assert.equal(stepNumericDraft("", -1, { min: 1, max: 64, step: 1 }), "64");
    assert.equal(stepNumericDraft("64", -1, { min: 1, max: 64, step: 1 }), "63");
    assert.equal(stepNumericDraft("", 1, { min: 1, max: 64, step: 1 }), "1");
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
