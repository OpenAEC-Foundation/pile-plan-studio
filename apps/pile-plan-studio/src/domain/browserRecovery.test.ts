import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserRecoveryRecord,
  parseBrowserRecoveryRecord,
} from "./browserRecovery.ts";

const ifcppText = JSON.stringify({
  schema: "IFCPP",
  schema_version: 3,
  metadata: { name: "Recovered project" },
});

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
    assert.equal(record.schemaVersion, 3);
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
    assert.equal(parseBrowserRecoveryRecord({ ...valid, schemaVersion: 99 }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, ifcppText: "{" }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, projectName: "" }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, isDirty: "yes" }), null);
  });

  it("rejects metadata that disagrees with the serialized IFCPP project", () => {
    const valid = createBrowserRecoveryRecord({
      appVersion: "0.1.7",
      ifcppText,
      projectName: "Recovered project",
      savedProjectSignature: "",
      isDirty: false,
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    assert.equal(parseBrowserRecoveryRecord({ ...valid, schemaVersion: 1 }), null);
    assert.equal(parseBrowserRecoveryRecord({ ...valid, projectName: "Other project" }), null);
  });
});
