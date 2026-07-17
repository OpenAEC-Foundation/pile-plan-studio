import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyImportPreview,
  beginImportPreview,
  canSubmitProjectImport,
  createEmptyImportDrafts,
  setImportFile,
  setImportProfile,
  shouldWarnAboutMissingFoundationAdvice,
} from "./projectImportModel.ts";
import type { ImportSourcePreview } from "../../core/coreImportContract.ts";

describe("project import model", () => {
  it("warns only when refreshing CPTs without foundation advice", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    drafts = setImportFile(drafts, "cpts", { name: "sonderingen.xlsx" });

    assert.equal(shouldWarnAboutMissingFoundationAdvice(drafts, "refresh"), true);
    assert.equal(shouldWarnAboutMissingFoundationAdvice(drafts, "new-project"), false);

    drafts = setImportFile(drafts, "bearing-capacities", { name: "funderingsadvies.xlsx" });
    assert.equal(shouldWarnAboutMissingFoundationAdvice(drafts, "refresh"), false);
  });

  it("starts every role with automatic profile detection", () => {
    const drafts = createEmptyImportDrafts<{ name: string }>();

    assert.equal(drafts["load-points"].requestedProfile, "auto");
    assert.equal(drafts.cpts.requestedProfile, "auto");
    assert.equal(drafts["bearing-capacities"].requestedProfile, "auto");
  });

  it("resets profile choices when assigning another file", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    drafts = setImportProfile(drafts, "load-points", "rfem-export");
    drafts = setImportFile(drafts, "load-points", { name: "other.xlsx" });

    assert.equal(drafts["load-points"].requestedProfile, "auto");
    assert.deepEqual(drafts["load-points"].profileOptions, {
      coordinateSheet: null,
      reactionSheet: null,
    });
  });

  it("ignores stale asynchronous preview results", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    drafts = setImportFile(drafts, "load-points", { name: "Export RFEM.xlsx" });
    drafts = beginImportPreview(drafts, "load-points", 2);
    drafts = applyImportPreview(drafts, "load-points", 1, rfemPreview());

    assert.equal(drafts["load-points"].previewState.status, "analyzing");
  });

  it("allows warnings but blocks preview errors and pending roles", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    for (const role of ["load-points", "cpts", "bearing-capacities"] as const) {
      drafts = setImportFile(drafts, role, { name: `${role}.xlsx` });
      drafts = beginImportPreview(drafts, role, 1);
      drafts = applyImportPreview(drafts, role, 1, standardPreview(role));
    }
    assert.equal(canSubmitProjectImport(drafts, "new-project"), true);

    drafts = beginImportPreview(drafts, "cpts", 2);
    assert.equal(canSubmitProjectImport(drafts, "new-project"), false);
  });

  it("allows one ready source for refresh but not for a new project", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    drafts = setImportFile(drafts, "load-points", { name: "Export RFEM.xlsx" });
    drafts = beginImportPreview(drafts, "load-points", 1);
    drafts = applyImportPreview(drafts, "load-points", 1, rfemPreview());

    assert.equal(canSubmitProjectImport(drafts, "refresh"), true);
    assert.equal(canSubmitProjectImport(drafts, "new-project"), false);
  });

  it("blocks an empty refresh and any selected source that is not ready", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    assert.equal(canSubmitProjectImport(drafts, "refresh"), false);

    drafts = setImportFile(drafts, "cpts", { name: "cpts.csv" });
    drafts = beginImportPreview(drafts, "cpts", 1);
    assert.equal(canSubmitProjectImport(drafts, "refresh"), false);
  });

  it("keeps resolved RFEM sheet choices in the draft", () => {
    let drafts = createEmptyImportDrafts<{ name: string }>();
    drafts = setImportFile(drafts, "load-points", { name: "Export RFEM.xlsx" });
    drafts = beginImportPreview(drafts, "load-points", 1);
    drafts = applyImportPreview(drafts, "load-points", 1, rfemPreview());

    assert.deepEqual(drafts["load-points"].profileOptions, {
      coordinateSheet: "1.1 Knopen",
      reactionSheet: "RC1",
    });
  });
});

function standardPreview(role: "load-points" | "cpts" | "bearing-capacities"): ImportSourcePreview {
  return {
    role,
    requestedProfile: "auto",
    detectedProfile: "standard-table",
    resolvedProfile: "standard-table",
    availableProfiles: ["standard-table"],
    resolvedOptions: { coordinateSheet: null, reactionSheet: null },
    itemCount: 1,
    diagnostics: [],
    details: { kind: "standard-table", sheetName: null },
  };
}

function rfemPreview(): ImportSourcePreview {
  return {
    role: "load-points",
    requestedProfile: "auto",
    detectedProfile: "rfem-export",
    resolvedProfile: "rfem-export",
    availableProfiles: ["standard-table", "rfem-export"],
    resolvedOptions: {
      coordinateSheet: "1.1 Knopen",
      reactionSheet: "RC1",
    },
    itemCount: 328,
    diagnostics: [{
      severity: "warning",
      code: "reaction-nodes-without-coordinates",
      count: 1,
      nodeIds: [999],
      fallbackMessage: "One node was skipped.",
    }],
    details: {
      kind: "rfem-export",
      coordinateSheetCandidates: ["1.1 Knopen"],
      reactionSheetCandidates: ["RC1"],
      selectedCoordinateSheet: "1.1 Knopen",
      selectedReactionSheet: "RC1",
      loadRule: "abs-min-pz-prime",
    },
  };
}
