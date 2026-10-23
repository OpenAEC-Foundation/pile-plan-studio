import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initWasm from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { validateManualCptSelectionBatchCore, validateLoadPointLockBatchCore } from "./locationBulkCoreClient.ts";

describe("location batch core client", () => {
  it("preserves automatic group resets as null across the real browser WASM boundary", async () => {
    await initWasm({ module_or_path: readFileSync(new URL("./wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
    const result = await validateManualCptSelectionBatchCore({
      loadPointIds: [1, 2, 3], cptIds: [61], changes: [
        { load_point_id: 1, cpt_ids: null },
        { load_point_id: 2, cpt_ids: null },
        { load_point_id: 3, cpt_ids: [] },
      ],
    });
    assert.deepEqual(result, { status: "valid", changes: [
      { load_point_id: 1, cpt_ids: null }, { load_point_id: 2, cpt_ids: null }, { load_point_id: 3, cpt_ids: [] },
    ] });
  });
  it("exposes Rust-backed CPT and lock validators", () => {
    assert.equal(typeof validateManualCptSelectionBatchCore, "function");
    assert.equal(typeof validateLoadPointLockBatchCore, "function");
  });
});
