import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PilePlanImportPanel", () => {
  const source = readFileSync(resolve(import.meta.dirname, "PilePlanImportPanel.tsx"), "utf8");

  it("previews the selected file through the shared Rust core", () => {
    assert.match(source, /previewPilePlanImportCore/);
    assert.match(source, /accept="\.csv,\.xlsx"/);
    assert.match(source, /coordinateToleranceMm/);
  });

  it("offers independent native pile and CPT import choices", () => {
    assert.match(source, /type="checkbox"[\s\S]*?importPileAssignments/);
    assert.match(source, /type="checkbox"[\s\S]*?importCptSelections/);
    assert.match(source, /disabled=\{!canImportCptSelections/);
  });

  it("shows preview diagnostics and only applies an eligible patch", () => {
    assert.match(source, /result\.diagnostics/);
    assert.match(source, /canApplyPilePlanImport/);
    assert.match(source, /onImportPilePlan\(result\.patch\)/);
  });
});
