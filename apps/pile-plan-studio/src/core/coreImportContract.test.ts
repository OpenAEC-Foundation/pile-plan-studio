import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fromCoreImportSourcePreview, toCoreImportSource } from "./coreImportContract.ts";

describe("core import contract", () => {
  it("serializes a role, profile, sheet choices, file name, format, and bytes", () => {
    assert.deepEqual(toCoreImportSource({
      role: "load-points",
      profile: "rfem-export",
      profileOptions: {
        coordinateSheet: "1.1 Knopen",
        reactionSheet: "RC1",
      },
      fileName: "loads.xlsx",
      format: "xlsx",
      bytes: new Uint8Array([1, 2, 3]),
    }), {
      role: "load-points",
      profile: "rfem-export",
      profile_options: {
        coordinate_sheet: "1.1 Knopen",
        reaction_sheet: "RC1",
      },
      file_name: "loads.xlsx",
      format: "xlsx",
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  it("converts RFEM preview details to the UI contract", () => {
    const preview = fromCoreImportSourcePreview({
      role: "load-points",
      requested_profile: "auto",
      detected_profile: "rfem-export",
      resolved_profile: "rfem-export",
      available_profiles: ["standard-table", "rfem-export"],
      resolved_options: {
        coordinate_sheet: "1.1 Knopen",
        reaction_sheet: "RC1",
      },
      item_count: 328,
      diagnostics: [{
        severity: "warning",
        code: "reaction-nodes-without-coordinates",
        count: 1,
        node_ids: [999],
        load_point_names: [],
        x_mm: null,
        y_mm: null,
        fallback_message: "One node was skipped.",
      }],
      details: {
        kind: "rfem-export",
        coordinate_sheet_candidates: ["1.1 Knopen"],
        reaction_sheet_candidates: ["RC1"],
        selected_coordinate_sheet: "1.1 Knopen",
        selected_reaction_sheet: "RC1",
        load_rule: "abs-min-pz-prime",
      },
    });

    assert.equal(preview.itemCount, 328);
    assert.equal(preview.details?.kind, "rfem-export");
    assert.deepEqual(preview.diagnostics[0].nodeIds, [999]);
  });

  it("preserves duplicate-position details for a localized diagnostic", () => {
    const preview = fromCoreImportSourcePreview({
      role: "load-points",
      requested_profile: "standard-table",
      detected_profile: "standard-table",
      resolved_profile: "standard-table",
      available_profiles: ["standard-table"],
      resolved_options: { coordinate_sheet: null, reaction_sheet: null },
      item_count: 2,
      diagnostics: [{
        severity: "error",
        code: "duplicate-load-point-position",
        count: 2,
        node_ids: [1, 2],
        load_point_names: ["L1", "L2"],
        x_mm: 100,
        y_mm: 200,
        fallback_message: "Duplicate position.",
      }],
      details: { kind: "standard-table", sheet_name: null },
    });

    assert.deepEqual(preview.diagnostics[0], {
      severity: "error",
      code: "duplicate-load-point-position",
      count: 2,
      nodeIds: [1, 2],
      loadPointNames: ["L1", "L2"],
      xMm: 100,
      yMm: 200,
      fallbackMessage: "Duplicate position.",
    });
  });
});
