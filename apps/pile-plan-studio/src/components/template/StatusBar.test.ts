import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("status bar", () => {
  it("shows live viewport zoom without duplicating explorer costs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "StatusBar.tsx"), "utf8");
    const app = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");

    assert.match(source, /zoomPercent/);
    assert.match(app, /<StatusBar[\s\S]*?zoomPercent=\{projectState\.viewport\.scale \* 100\}/);
    assert.doesNotMatch(source, /totalCost/);
    assert.doesNotMatch(source, /missingCostCount/);
    assert.doesNotMatch(source, />100%<\/span>/);
  });

  it("announces general status feedback without owning history presentation", () => {
    const source = readFileSync(resolve(import.meta.dirname, "StatusBar.tsx"), "utf8");

    assert.match(source, /message\?: string/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /\{message &&/);
    assert.doesNotMatch(source, /historyMessage/);
    assert.doesNotMatch(source, /status-history-message/);
  });
});
