import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { projectAnalysisResultFromCore } from "./projectAnalysisResult.ts";

describe("project analysis core result", () => {
  it("accepts omitted CPT FRD rows from WASM recalculation", () => {
    const result = projectAnalysisResultFromCore({
      pile_options_by_load_point: new Map(),
      selected_cpts_by_load_point: new Map(),
      cpt_frd_rows_by_cpt_id: undefined,
    });

    assert.deepEqual(result.pileOptionsByLoadPointId, new Map());
    assert.deepEqual(result.selectedCptsByLoadPointId, new Map());
    assert.equal(result.cptFrdRowsByCptId, null);
  });
});
