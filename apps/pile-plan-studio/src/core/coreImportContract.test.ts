import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toCoreImportSource } from "./coreImportContract.ts";

describe("core import contract", () => {
  it("serializes a role, file name, format, and bytes", () => {
    assert.deepEqual(toCoreImportSource({
      role: "load-points",
      fileName: "loads.xlsx",
      format: "xlsx",
      bytes: new Uint8Array([1, 2, 3]),
    }), {
      role: "load-points",
      file_name: "loads.xlsx",
      format: "xlsx",
      bytes: new Uint8Array([1, 2, 3]),
    });
  });
});
