import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ProjectImportPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./projectImport.css", import.meta.url), "utf8");

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

  it("uses the custom themed listbox for imported project currency", () => {
    assert.match(panel, /<ThemedSelect[\s\S]*ariaLabel=\{t\("importProject\.currency"\)\}/);
    assert.doesNotMatch(panel, /<select/);
  });

  it("explains why a ready new project still cannot be imported", () => {
    assert.match(panel, /showPileHeadLevelBlocker/);
    assert.match(panel, /pileHeadLevelRequired/);
    assert.match(panel, /aria-invalid/);
  });

  it("keeps pile-head guidance in a tooltip and the blocking reason beside the submit action", () => {
    assert.match(panel, /className="project-import-help"/);
    assert.match(panel, /title=\{t\("importProject\.pileHeadLevelHelp"\)\}/);
    assert.match(panel, /className="project-import-submit-area"/);
    assert.doesNotMatch(panel, /className="project-import-property-help"/);
    assert.match(styles, /\.project-import-help\s*\{[\s\S]*?cursor:\s*default/);
    assert.doesNotMatch(styles, /\.project-import-help\s*\{[\s\S]*?cursor:\s*help/);
  });

  it("prefills one selected source in refresh mode", () => {
    assert.match(panel, /initialSource/);
    assert.match(panel, /setMode\("refresh"\)/);
    assert.match(panel, /assignRoleFile\(initialSource\.role, initialSource\.file\)/);
  });

  it("shows a non-blocking warning for CPT-only refreshes", () => {
    assert.match(panel, /shouldWarnAboutMissingFoundationAdvice\(drafts, mode\)/);
    assert.match(panel, /importProject\.warnings\.cptsWithoutFoundationAdvice/);
    assert.match(panel, /className="project-import-warning"/);
    assert.match(panel, /role="status"/);
  });
});
