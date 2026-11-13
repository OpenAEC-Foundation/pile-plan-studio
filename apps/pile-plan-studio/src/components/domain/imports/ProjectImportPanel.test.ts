import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("./ProjectImportPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./projectImport.css", import.meta.url), "utf8");
const fileButton = readFileSync(new URL("../shared/SourceFileButton.tsx", import.meta.url), "utf8");

describe("ProjectImportPanel", () => {
  it("renders one profiled source card for every project role", () => {
    assert.match(panel, /ROLES\.map/);
    assert.match(panel, /project-import-source-card/);
    assert.match(panel, /requestedProfile/);
  });

  it("renders RFEM analysis and conditional sheet selectors", () => {
    assert.match(panel, /importProject\.rfem\.analysis/);
    assert.match(panel, /coordinateSheetCandidates/);
    assert.match(panel, /reactionSheetCandidates/);
    assert.match(panel, /abs-min-pz-prime/);
  });

  it("uses shared Blueprint fields, file actions, feedback and a primary submission", () => {
    assert.match(panel, /<TextField/);
    assert.match(panel, /<ImportFileButton/);
    assert.match(panel, /<Status/);
    assert.match(panel, /<Banner/);
    assert.match(panel, /<Button kind="primary" className="project-import-submit"/);
  });

  it("keeps native file inputs visually hidden behind shared controls", () => {
    assert.match(fileButton, /project-import-native-file/);
    assert.match(fileButton, /<Button icon="file.open"/);
    assert.match(styles, /\.project-import-native-file\s*\{[^}]*clip-path:\s*inset\(50%\)/);
  });

  it("uses a fixed mode for the guided route and source tabs for refresh", () => {
    assert.match(panel, /guided \? "new-project" : "refresh"/);
    assert.match(panel, /<Tabs label=\{t\("importProject\.refreshTitle"\)\}/);
  });

  it("uses the shared native Select for imported project currency", () => {
    assert.match(panel, /<Select label=\{t\("importProject\.currency"\)\}/);
    assert.doesNotMatch(panel, /ThemedSelect/);
  });

  it("keeps pile-head guidance in a tooltip and the blocking reason beside the submit action", () => {
    assert.match(panel, /<IconButton small icon="ui.about"/);
    assert.match(panel, /className="project-import-reference-help" aria-describedby=\{levelHelpId\}/);
    assert.match(panel, /<span id=\{levelHelpId\} hidden>/);
    assert.match(panel, /className="project-import-submit-area"/);
    assert.doesNotMatch(panel, /className="project-import-property-help"/);
  });

  it("presents the CPT refresh warning as a status message", () => {
    assert.match(panel, /importProject\.warnings\.cptsWithoutFoundationAdvice/);
    assert.match(panel, /<Banner tone="warning" word="">\s*\{t\("importProject\.warnings\.cptsWithoutFoundationAdvice"\)\}/);
  });
});
