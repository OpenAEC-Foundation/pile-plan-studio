import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pile plan explorer", () => {
  const source = readFileSync(resolve(import.meta.dirname, "PilePlanExplorer.tsx"), "utf8");

  it("renders selectable pile plans with costs and management actions", () => {
    assert.match(source, /pilePlans\.map/);
    assert.match(source, /activePilePlanId/);
    assert.match(source, /formatCurrency/);
    assert.match(source, /onActivate/);
    assert.match(source, /onRename/);
    assert.match(source, /onDuplicate/);
    assert.match(source, /onDelete/);
    assert.match(source, /onCreate/);
  });

  it("supports inline rename commit and cancellation", () => {
    assert.match(source, /event\.key === "Enter"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /onBlur/);
  });

  it("disables fresh plan creation until project analysis is complete", () => {
    assert.match(source, /createDisabled/);
    assert.match(source, /disabled=\{creating \|\| createDisabled\}/);
  });

  it("renders navigable and independently collapsible source and pile-plan groups", () => {
    assert.match(source, /inputSources/);
    assert.match(source, /activeSourceKind/);
    assert.match(source, /inputSourcesExpanded/);
    assert.match(source, /pilePlansExpanded/);
    assert.match(source, /onSourceActivate/);
    assert.match(source, /onExpansionChange/);
  });
});
