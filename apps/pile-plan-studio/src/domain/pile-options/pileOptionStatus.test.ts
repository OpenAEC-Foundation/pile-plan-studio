import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getPileOptionStatus } from "./pileOptionStatus.ts";

describe("pile option status", () => {
  it("shows OK for valid pile options", () => {
    assert.deepEqual(getPileOptionStatus({ technicalStatus: "valid" }), {
      className: "is-ok",
      label: "OK",
    });
  });

  it("shows Missing when a pile option misses bearing capacity entries", () => {
    assert.deepEqual(getPileOptionStatus({ technicalStatus: "missing_capacity_data" }), {
      className: "is-missing",
      label: "Missing",
    });
  });

  it("shows Insufficient capacity for complete but insufficient pile options", () => {
    assert.deepEqual(getPileOptionStatus({ technicalStatus: "insufficient_capacity" }), {
      className: "is-not-ok",
      label: "Insufficient capacity",
    });
  });
});
