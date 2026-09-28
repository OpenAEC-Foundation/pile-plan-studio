import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateManualCptSelectionBatchCore, validateLoadPointLockBatchCore } from "./locationBulkCoreClient.ts";

describe("location batch core client", () => {
  it("exposes Rust-backed CPT and lock validators", () => {
    assert.equal(typeof validateManualCptSelectionBatchCore, "function");
    assert.equal(typeof validateLoadPointLockBatchCore, "function");
  });
});
