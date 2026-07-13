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

  it("shows save commands only when supported by the platform", () => {
    const source = readFileSync(resolve(import.meta.dirname, "backstage/Backstage.tsx"), "utf8");
    assert.match(source, /commands\.save/);
    assert.match(source, /commands\.saveAs/);
    assert.match(source, /commands\.download/);
    assert.doesNotMatch(source, /label=\{t\("new"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("print"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("extensions"\)\}/);
    assert.doesNotMatch(source, /actionAndClose/);
  });

  it("marks dirty projects in the explorer and guards replacement actions", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");

    assert.match(source, /isDirty/);
    assert.match(source, /\{isDirty \? " \*" : ""\}/);
    assert.match(source, /confirmProjectReplacement/);
    assert.match(source, /UnsavedChangesDialog/);
  });

  it("keeps alpha export limited to IFCPP", () => {
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
