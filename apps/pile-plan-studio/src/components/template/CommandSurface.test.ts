import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Alpha command surfaces", () => {
  it("uses the platform-specific primary project action", () => {
    const source = readFileSync(resolve(import.meta.dirname, "TitleBar.tsx"), "utf8");
    assert.match(source, /projectAction/);
    assert.match(source, /projectActionKind/);
    assert.doesNotMatch(source, /aria-label=\{t\("undo"\)\}/);
    assert.doesNotMatch(source, /aria-label=\{t\("redo"\)\}/);
    assert.doesNotMatch(source, /aria-label=\{t\("print"\)\}/);
  });

  it("identifies the public build as an engineering alpha", () => {
    const titleBar = readFileSync(resolve(import.meta.dirname, "TitleBar.tsx"), "utf8");
    const enCommon = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8");
    const nlCommon = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8");

    assert.match(titleBar, /t\("alphaLabel"\)/);
    assert.match(enCommon, /"alphaLabel":\s*"Alpha"/);
    assert.match(nlCommon, /"alphaLabel":\s*"Alpha"/);
    assert.match(enCommon, /professional verification/i);
    assert.match(nlCommon, /deskundige/);
  });

  it("shows save commands only when supported by the platform", () => {
    const source = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    assert.match(source, /commands\.save/);
    assert.match(source, /commands\.saveAs/);
    assert.match(source, /commands\.download/);
    assert.doesNotMatch(source, /label=\{t\("new"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("print"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("extensions"\)\}/);
    assert.doesNotMatch(source, /actionAndClose/);
    assert.match(source, /\{commands\.save \? <>\s*<Divider \/>[\s\S]*?label=\{t\("exit"\)\}/);
  });

  it("uses one shared visual language for backstage content panels", () => {
    const backstage = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    const importPanel = readFileSync(resolve(import.meta.dirname, "../domain/ProjectImportPanel.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.css"), "utf8");

    assert.match(backstage, /backstage-panel-title/);
    assert.match(backstage, /bs-open-project-option/);
    assert.match(backstage, /bs-recent-item/);
    assert.match(importPanel, /backstage-panel-title/);
    assert.match(styles, /\.backstage-panel-title/);
    assert.doesNotMatch(backstage, /onMouseEnter=/);
  });

  it("marks dirty projects in the explorer and guards replacement actions", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");

    assert.match(source, /isDirty/);
    assert.match(source, /\{isDirty \? " \*" : ""\}/);
    assert.match(source, /confirmProjectReplacement/);
    assert.match(source, /UnsavedChangesDialog/);
  });

  it("offers IFCPP and standard pile plan table exports", () => {
    const backstage = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    const app = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");
    const workspace = readFileSync(resolve(import.meta.dirname, "../domain/PilePlanWorkspace.tsx"), "utf8");
    const viewer = readFileSync(resolve(import.meta.dirname, "../domain/PilePlanViewer.tsx"), "utf8");

    assert.doesNotMatch(backstage, /onExportViewImage/);
    assert.doesNotMatch(backstage, /exportPanel\.asImage/);
    assert.doesNotMatch(backstage, /exportPanel\.asHtml/);
    assert.doesNotMatch(app, /html2canvas/);
    assert.doesNotMatch(app, /createPilePlanImage/);
    assert.doesNotMatch(workspace, /data-export-target="pile-plan"/);
    assert.doesNotMatch(viewer, /data-export-target="pile-plan"/);
    assert.match(backstage, /onExportPilePlanXlsx/);
    assert.match(backstage, /onExportPilePlanCsv/);
    assert.match(backstage, /exportPanel\.excel/);
    assert.match(backstage, /exportPanel\.csv/);
  });

  it("offers pile plan import directly after project source import", () => {
    const backstage = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");

    assert.match(
      backstage,
      /label=\{t\("import"\)\}[\s\S]*?label=\{t\("importPilePlan"\)\}/,
    );
    assert.match(backstage, /activePanel === "pile-plan-import"/);
    assert.match(backstage, /<PilePlanImportPanel/);
  });

  it("shows one busy state while either export action is running", () => {
    const backstage = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.css"), "utf8");

    assert.match(backstage, /runningExport/);
    assert.match(backstage, /aria-busy/);
    assert.match(backstage, /is-exporting/);
    assert.match(styles, /cursor:\s*wait/);
  });

  it("resizes the properties sidebar from the workspace divider", () => {
    const app = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");

    assert.match(app, /rightPanelWidth/);
    assert.match(app, /resizeRightPanelWidth/);
    assert.match(app, /className="right-panel-splitter"/);
    assert.match(app, /style\.setProperty\("--right-panel-width"/);
    assert.doesNotMatch(app, /setRightPanelWidth/);
  });
});
