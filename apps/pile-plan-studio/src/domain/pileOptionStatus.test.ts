import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getPileOptionStatus } from "./pileOptionStatus.ts";

describe("pile option status", () => {
  it("shows OK for valid pile options", () => {
    assert.deepEqual(getPileOptionStatus({ isOption: true, missing_cpt_ids: [] }), {
      className: "is-ok",
      label: "OK",
    });
  });

  it("shows Missing when a pile option misses bearing capacity entries", () => {
    assert.deepEqual(getPileOptionStatus({ isOption: false, missing_cpt_ids: [61, 62] }), {
      className: "is-missing",
      label: "Missing",
    });
  });

  it("shows Not OK for complete but insufficient pile options", () => {
    assert.deepEqual(getPileOptionStatus({ isOption: false, missing_cpt_ids: [] }), {
      className: "is-not-ok",
      label: "Not OK",
    });
  });
});
