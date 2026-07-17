import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PilePlanImportPreview } from "../../core/pilePlanImportContract.ts";
import {
  applyPilePlanImportPreview,
  beginPilePlanImportPreview,
  canApplyPilePlanImport,
  canImportCptSelections,
  createPilePlanImportDraft,
  setPilePlanImportCategory,
  setPilePlanImportFile,
  setPilePlanImportProfile,
  setPilePlanImportTolerance,
} from "./pilePlanImportModel.ts";

const readyPreview: PilePlanImportPreview = {
  requestedProfile: "automatic",
  detectedProfile: "standard-table",
  supportsCptSelections: true,
  canApply: true,
  summary: { sourceRows: 3, matchedRows: 3, coordinateFallbacks: 0, skippedRows: 0, conflicts: 0 },
  diagnostics: [],
  patch: { changes: [] },
};

describe("pilePlanImportModel", () => {
  it("starts with the approved defaults", () => {
    const draft = createPilePlanImportDraft<File>();
    assert.equal(draft.file, null);
    assert.equal(draft.requestedProfile, "automatic");
    assert.equal(draft.coordinateToleranceMm, "1");
    assert.equal(draft.importPileAssignments, true);
    assert.equal(draft.importCptSelections, true);
    assert.equal(canApplyPilePlanImport(draft), false);
  });

  it("disables CPT selections for the legacy profile", () => {
    const next = setPilePlanImportProfile(createPilePlanImportDraft<File>(), "legacy");
    assert.equal(next.importCptSelections, false);
    assert.equal(canImportCptSelections(next), false);
  });

  it("invalidates an existing preview when matching inputs change", () => {
    const file = new File(["test"], "plan.csv");
    let draft = setPilePlanImportFile(createPilePlanImportDraft<File>(), file);
    draft = beginPilePlanImportPreview(draft, 1);
    draft = applyPilePlanImportPreview(draft, 1, readyPreview);
    assert.equal(draft.previewState.status, "ready");

    assert.equal(setPilePlanImportTolerance(draft, "2").previewState.status, "empty");
    assert.equal(setPilePlanImportCategory(draft, "piles", false).previewState.status, "empty");
  });

  it("ignores stale preview responses", () => {
    let draft = beginPilePlanImportPreview(createPilePlanImportDraft<File>(), 2);
    draft = applyPilePlanImportPreview(draft, 1, readyPreview);
    assert.equal(draft.previewState.status, "analyzing");
  });

  it("requires a valid tolerance, a file, a ready preview, and one category", () => {
    const file = new File(["test"], "plan.csv");
    let draft = setPilePlanImportFile(createPilePlanImportDraft<File>(), file);
    draft = beginPilePlanImportPreview(draft, 1);
    draft = applyPilePlanImportPreview(draft, 1, readyPreview);
    assert.equal(canApplyPilePlanImport(draft), true);
    assert.equal(canApplyPilePlanImport(setPilePlanImportTolerance(draft, "-1")), false);
    assert.equal(canApplyPilePlanImport(setPilePlanImportTolerance(draft, "")), false);
    const noCategories = setPilePlanImportCategory(
      setPilePlanImportCategory(draft, "piles", false),
      "cpts",
      false,
    );
    assert.equal(canApplyPilePlanImport(noCategories), false);
  });

  it("restores CPT import when leaving an automatically detected legacy profile", () => {
    const legacyPreview = { ...readyPreview, detectedProfile: "legacy" as const, supportsCptSelections: false };
    let draft = beginPilePlanImportPreview(createPilePlanImportDraft<File>(), 1);
    draft = applyPilePlanImportPreview(draft, 1, legacyPreview);
    assert.equal(draft.importCptSelections, false);

    draft = setPilePlanImportProfile(draft, "standard-table");
    assert.equal(draft.importCptSelections, true);
  });
});
