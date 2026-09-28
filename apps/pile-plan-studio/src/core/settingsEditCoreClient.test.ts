import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCptSettingsEditCore,
  evaluateLoadPointGroupingSettingsCore,
  evaluatePileCostCatalogEditCore,
} from "./settingsEditCoreClient.ts";

describe("settings edit core client", () => {
  it("exposes Rust-backed CPT, grouping, and cost evaluators", () => {
    assert.equal(typeof evaluateCptSettingsEditCore, "function");
    assert.equal(typeof evaluateLoadPointGroupingSettingsCore, "function");
    assert.equal(typeof evaluatePileCostCatalogEditCore, "function");
  });
});
