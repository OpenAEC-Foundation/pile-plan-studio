import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toStringKeyedRecord, toWasmNumberKeyedMap, toWasmNumberKeyedRecord } from "./coreSerialization.ts";

describe("core serialization", () => {
  it("keeps numeric ids as numeric Map keys for WASM requests", () => {
    const result = toWasmNumberKeyedMap(new Map([[15, ["option"]]]));

    assert.equal(result.get(15)?.[0], "option");
    assert.equal(result.has("15" as unknown as number), false);
  });

  it("uses string keyed objects for Tauri requests", () => {
    const result = toStringKeyedRecord(new Map([[15, ["option"]]]));

    assert.deepEqual(Object.keys(result), ["15"]);
    assert.deepEqual(result["15"], ["option"]);
  });

  it("converts persisted string ids back to numeric WASM map keys", () => {
    const result = toWasmNumberKeyedRecord({ "15": [61, 62] });

    assert.deepEqual(result.get(15), [61, 62]);
    assert.equal(result.has("15" as unknown as number), false);
  });
});
