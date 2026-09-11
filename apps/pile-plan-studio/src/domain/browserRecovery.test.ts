import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserRecoveryRecord,
  parseBrowserRecoveryRecord,
} from "./browserRecovery.ts";

const ifcppText = "canonical IFCPP text supplied by Rust";

describe("browser recovery record", () => {
  it("creates and parses a versioned recovery record", () => {
    const record = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "saved-signature",
      isDirty: true,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    assert.deepEqual(parseBrowserRecoveryRecord(record), record);
    assert.equal(record.formatVersion, 1);
    assert.equal(record.savedProjectSignature, "saved-signature");
    assert.equal(record.isDirty, true);
  });

  it("rejects malformed and incompatible recovery records", () => {
    const valid = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "",
      isDirty: false,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    assert.equal(parseBrowserRecoveryRecord(null), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, formatVersion: 2 }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, ifcppText: "" }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, projectName: "" }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, isDirty: "yes" }), null);
  });

  it("treats serialized project text as opaque Rust-owned content", () => {
    const valid = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "",
      isDirty: false,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    assert.deepEqual(parseBrowserRecoveryRecord(valid), valid);
    assert.equal("schemaVersion" in valid, false);
  });

  it("continues to accept version-one records containing the former schema metadata", () => {
    const legacy = {
      ...createBrowserRecoveryRecord({
        appVersion: "0.1.7",
        ifcppText,
        projectName: "Recovered project",
        savedProjectSignature: "",
        isDirty: false,
        updatedAt: "2026-08-05T10:00:00.000Z",
      }),
      schemaVersion: 3,
    };

    assert.deepEqual(parseBrowserRecoveryRecord(legacy), legacy);
  });
});
