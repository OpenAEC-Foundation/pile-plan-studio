import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");
const viewer = read("components/domain/PilePlanViewer.tsx");
const ribbon = read("components/template/ribbon/Ribbon.tsx");
const modal = read("components/template/Modal.tsx");
const app = read("App.tsx");
const appStyles = read("App.css");
const titleBarStyles = read("components/template/TitleBar.css");
const ribbonStyles = read("components/template/ribbon/Ribbon.css");
const baseline = read("domain/uiBaseline.ts");
const scaleRuntime = read("domain/interfaceScaleRuntime.ts");

describe("compact browser geometry integration", () => {
  it("normalizes viewer pointer positions and rendered lasso coordinates", () => {
    assert.match(viewer, /elementLayoutScale/);
    assert.match(viewer, /screenToLocal/);
    assert.match(viewer, /getLocalPointer/);
    assert.match(viewer, /getLocalCanvasRect/);
  });

  it("avoids measuring ribbon tabs and normalizes modal and splitter geometry", () => {
    assert.doesNotMatch(ribbon, /getBoundingClientRect|elementLayoutScale|screenToLocal/);
    assert.match(modal, /elementLayoutScale/);
    assert.match(app, /elementLayoutScale\(appContentRef\.current\)/);
    assert.match(app, /screenToLocal/);
  });

  it("keeps CSS layout scaling separate from the relative desktop WebView factor", () => {
    assert.match(baseline, /compact-application-baseline/);
    assert.match(scaleRuntime, /normalizeInterfaceScale\(scalePercent\) \/ 100/);
    assert.doesNotMatch(scaleRuntime, /BROWSER_BASELINE_ZOOM/);
  });

  it("keeps the fixed title bar border inside the height reserved by the ribbon", () => {
    const shellRule = appStyles.match(/\.app-shell\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const titleBarRule = titleBarStyles.match(/\.titlebar\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const ribbonRule = ribbonStyles.match(/\.ribbon-container\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    assert.match(shellRule, /--titlebar-height:\s*32px/);
    assert.match(titleBarRule, /box-sizing:\s*border-box/);
    assert.match(titleBarRule, /height:\s*var\(--titlebar-height\)/);
    assert.match(ribbonRule, /margin-top:\s*var\(--titlebar-height\)/);
  });
});
