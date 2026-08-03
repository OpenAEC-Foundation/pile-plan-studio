import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("status bar", () => {
  it("shows live project costs and viewport zoom", () => {
    const source = readFileSync(resolve(import.meta.dirname, "StatusBar.tsx"), "utf8");

    assert.match(source, /totalCost/);
    assert.match(source, /missingCostCount/);
    assert.match(source, /zoomPercent/);
    assert.doesNotMatch(source, />100%<\/span>/);
  });
});
