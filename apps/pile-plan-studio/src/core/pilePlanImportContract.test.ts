import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fromCorePilePlanImportPreview, toCorePilePlanImportRequest } from "./pilePlanImportContract.ts";

describe("pile plan import core contract", () => {
  it("serializes matching context and options for Rust", () => {
    const request = toCorePilePlanImportRequest({
      fileName: "plan.csv",
      format: "csv",
      bytes: new Uint8Array([1, 2]),
      profile: "automatic",
      options: {
        importPileAssignments: true,
        importCptSelections: false,
        coordinateToleranceMm: 1,
      },
      loadPoints: [],
      cpts: [],
      availablePileConfigurations: [{ pile_size_mm: 320, pile_tip_level_m_key: -18_500 }],
    });

    assert.equal(request.file_name, "plan.csv");
    assert.equal(request.options.coordinate_tolerance_mm, 1);
    assert.equal(request.options.import_cpt_selections, false);
    assert.deepEqual(request.available_pile_configurations, [
      { pile_size_mm: 320, pile_tip_level_m_key: -18_500 },
    ]);
  });

  it("maps Rust preview fields to the UI contract", () => {
    const preview = fromCorePilePlanImportPreview({
      requested_profile: "automatic",
      detected_profile: "standard-table",
      supports_cpt_selections: true,
      can_apply: true,
      summary: {
        source_rows: 1,
        matched_rows: 1,
        coordinate_fallbacks: 0,
        skipped_rows: 0,
        conflicts: 0,
      },
      diagnostics: [],
      patch: { changes: [] },
    });

    assert.equal(preview.detectedProfile, "standard-table");
    assert.equal(preview.summary.matchedRows, 1);
    assert.equal(preview.canApply, true);
  });
});
