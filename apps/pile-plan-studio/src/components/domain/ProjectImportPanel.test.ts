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
    assert.match(panel, /canSubmitProjectImport/);
  });

  it("renders RFEM analysis and conditional sheet selectors", () => {
    assert.match(panel, /importProject\.rfem\.analysis/);
    assert.match(panel, /coordinateSheetCandidates/);
    assert.match(panel, /reactionSheetCandidates/);
    assert.match(panel, /abs-min-pz-prime/);
  });

  it("uses the shared application styling for fields, file actions, and status", () => {
    assert.match(panel, /project-import-field/);
    assert.match(panel, /project-import-file-button/);
    assert.match(panel, /project-import-status-dot/);
    assert.match(panel, /primary-action project-import-submit/);
  });

  it("keeps native file inputs visually hidden behind themed controls", () => {
    assert.match(panel, /project-import-native-file/);
    assert.match(panel, /ifcImportIcon/);
  });

  it("offers explicit new-project and refresh modes", () => {
    assert.match(panel, /ProjectImportMode/);
    assert.match(panel, /"new-project"/);
    assert.match(panel, /"refresh"/);
    assert.match(panel, /importProject\.modes\.newProject/);
    assert.match(panel, /importProject\.modes\.refresh/);
    assert.match(panel, /mode === "new-project"/);
  });

  it("omits empty source cards from a refresh request", () => {
    assert.match(panel, /ROLES\.filter\(\(\{ role \}\) => drafts\[role\]\.file/);
    assert.match(panel, /canSubmitProjectImport\(drafts, mode\)/);
  });

  it("shows a non-blocking warning for CPT-only refreshes", () => {
    assert.match(panel, /shouldWarnAboutMissingFoundationAdvice\(drafts, mode\)/);
    assert.match(panel, /importProject\.warnings\.cptsWithoutFoundationAdvice/);
    assert.match(panel, /className="project-import-warning"/);
    assert.match(panel, /role="status"/);
  });
});
