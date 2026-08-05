import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Plan and View ribbon", () => {
  it("exposes direct view controls for symbol size, utilization range, and foreground", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /type TabId = "plan" \| "view"/);
    assert.match(source, /const TABS: TabId\[\] = \["plan", "view"\]/);
    assert.doesNotMatch(source, /case "project"/);
    assert.doesNotMatch(source, /case "optimize"/);
    assert.match(source, /symbolScalePercent/);
    assert.match(source, /viewerUtilizationMinimum/);
    assert.match(source, /viewerUtilizationMaximum/);
    assert.match(source, /foregroundLayer/);
    assert.match(source, /showGrid/);
    assert.match(source, /onGridVisibilityChange/);
    assert.match(source, /type="range"/);
  });

  it("draws the preferred utilization track only between its two handles", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.match(source, /ribbon-dual-range-selection/);
    assert.match(source, /left:\s*`\$\{viewerUtilizationMinimum \* 100\}%`/);
    assert.match(source, /width:\s*`\$\{\(viewerUtilizationMaximum - viewerUtilizationMinimum\) \* 100\}%`/);
    assert.match(css, /\.ribbon-dual-range-selection\s*{[\s\S]*?background:\s*var\(--theme-accent\)/);
    assert.match(css, /::-webkit-slider-runnable-track\s*{[\s\S]*?background:\s*transparent/);
    assert.match(css, /::-moz-range-track\s*{[\s\S]*?background:\s*transparent/);
  });

  it("connects settings and run commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenTaskPanel/);
    assert.match(source, /onRunOptimization/);
    assert.match(source, /optimizationDisabled/);
    assert.match(source, /label=\{t\("optimize\.run"\)\} disabled=\{optimizationDisabled\} onClick=\{onRunOptimization\}/);
  });

  it("offers draft-based load-point lock controls", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /isLockEditing/);
    assert.match(source, /onStartLockEditing/);
    assert.match(source, /onApplyLockEditing/);
    assert.match(source, /onCancelLockEditing/);
    assert.match(source, /onUnlockAll/);
  });

  it("connects only supported project and plan commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenProjectInformation/);
    assert.match(source, /onOpenRightPanel/);
    assert.match(source, /onOpenRightPanel\?\.\("load-point"\)/);
    assert.match(source, /onOpenRightPanel\?\.\("cpts"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("cpt-settings"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("cost-settings"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("optimization"\)/);
    assert.doesNotMatch(source, /label=\{t\("project\.validate"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("view\.help"\)\}/);
  });

  it("uses domain icons for load points and CPTs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /loadPointIcon/);
    assert.match(source, /cptIcon/);
    assert.match(source, /icon=\{loadPointIcon\} label=\{t\("plan\.loadPoints"\)\}/);
    assert.match(source, /icon=\{cptIcon\} label=\{t\("plan\.cpts"\)\}/);
  });

  it("uses a domain optimization icon for the run command", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /optimizeIcon/);
    assert.match(source, /icon=\{optimizeIcon\} label=\{t\("optimize\.run"\)\}/);
  });

  it("uses distinct Dutch labels for information and settings commands", () => {
    const translations = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/nl/ribbon.json"), "utf8"));
    assert.equal(translations.plan.cpts, "Sonderingen");
    assert.equal(translations.plan.cptSettings, "Sonderingsinstellingen");
    assert.equal(translations.plan.costSettings, "Kosteninstellingen");
  });
});
