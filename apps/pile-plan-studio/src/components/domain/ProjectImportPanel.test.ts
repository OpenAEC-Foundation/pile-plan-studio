import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ProjectImportPanel.tsx", import.meta.url), "utf8");

describe("ProjectImportPanel", () => {
  it("renders one profiled source card for every project role", () => {
    assert.match(panel, /ROLES\.map/);
    assert.match(panel, /project-import-source-card/);
    assert.match(panel, /requestedProfile/);
  });

  it("previews assigned files before final import", () => {
    assert.match(panel, /previewImportSourceCore/);
    assert.match(panel, /beginImportPreview/);
    assert.match(panel, /canImportProject/);
  });

  it("renders RFEM analysis and conditional sheet selectors", () => {
    assert.match(panel, /importProject\.rfem\.analysis/);
    assert.match(panel, /coordinateSheetCandidates/);
    assert.match(panel, /reactionSheetCandidates/);
    assert.match(panel, /abs-min-pz-prime/);
  });
});
