import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("status bar", () => {
  it("shows live viewport zoom without duplicating explorer costs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "StatusBar.tsx"), "utf8");

    assert.match(source, /zoomPercent/);
    assert.doesNotMatch(source, /totalCost/);
    assert.doesNotMatch(source, /missingCostCount/);
    assert.doesNotMatch(source, />100%<\/span>/);
  });

  it("announces a temporary Undo or Redo result", () => {
    const source = readFileSync(resolve(import.meta.dirname, "StatusBar.tsx"), "utf8");

    assert.match(source, /historyMessage\?: string/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /historyMessage/);
  });
});
