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
});
