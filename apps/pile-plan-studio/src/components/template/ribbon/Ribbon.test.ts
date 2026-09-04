import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Plan and View ribbon", () => {
  it("exposes direct view controls for symbol size, utilization range, and foreground", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

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
    assert.match(styles, /\.ribbon-foreground-control button:hover\s*{[\s\S]*?background:\s*var\(--theme-ribbon-btn-hover\)/);
  });

  it("offers independent workspace panel visibility controls", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /explorerVisible/);
    assert.match(source, /propertiesVisible/);
    assert.match(source, /onExplorerVisibilityChange/);
    assert.match(source, /onPropertiesVisibilityChange/);
    assert.match(source, /view\.windows/);
  });

  it("keeps the tip-level region subject intact above its toggle action", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.match(source, /className="tip-level-regions-toggle"/);
    assert.match(styles, /\.ribbon-btn\.tip-level-regions-toggle\s*{[\s\S]*?width:\s*104px/);
    assert.match(styles, /\.ribbon-btn\.tip-level-regions-toggle \.ribbon-btn-label\s*{[\s\S]*?max-width:\s*100px/);
  });

  it("uses a scale-independent active tab border and separates ribbon content", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.doesNotMatch(source, /ribbon-tab-border|ribbon-tab-gap|updateHighlight/);
    assert.match(css, /\.ribbon-tab\.active\s*{[\s\S]*?border-color:\s*var\(--theme-accent\)/);
    assert.match(css, /\.ribbon-tab\.active\s*{[\s\S]*?border-bottom-color:\s*var\(--theme-bg\)/);
    assert.match(css, /\.ribbon-content-wrapper\s*{[\s\S]*?border-bottom:\s*1px solid var\(--theme-border\)/);
  });

  it("draws the preferred utilization track only between its two handles", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.match(source, /ribbon-dual-range-selection/);
    assert.match(source, /left:\s*`\$\{utilizationDraft\.minimum \* 100\}%`/);
    assert.match(source, /width:\s*`\$\{\(utilizationDraft\.maximum - utilizationDraft\.minimum\) \* 100\}%`/);
    assert.match(css, /\.ribbon-dual-range-selection\s*{[\s\S]*?background:\s*var\(--theme-accent\)/);
    assert.match(css, /::-webkit-slider-runnable-track\s*{[\s\S]*?background:\s*transparent/);
    assert.match(css, /::-moz-range-track\s*{[\s\S]*?background:\s*transparent/);
  });

  it("keeps utilization dragging local and commits only the completed range", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /utilizationDraft/);
    assert.match(source, /setUtilizationDraft/);
    assert.match(source, /commitUtilizationRange/);
    assert.match(source, /onPointerUp=\{commitUtilizationRange\}/);
    assert.match(source, /onKeyUp=\{commitUtilizationRange\}/);
    assert.doesNotMatch(source, /onChange=\{\(event\) => onViewerUtilizationRangeChange/);
  });

  it("delimits pointer and keyboard symbol-scale gestures", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");

    assert.match(source, /onSymbolScaleChangeStart/);
    assert.match(source, /onSymbolScaleChangeEnd/);
    assert.match(source, /onPointerDown=\{onSymbolScaleChangeStart\}/);
    assert.match(source, /onPointerUp=\{onSymbolScaleChangeEnd\}/);
    assert.match(source, /onPointerCancel=\{onSymbolScaleChangeEnd\}/);
    assert.match(source, /isRangeAdjustmentKey/);
    assert.match(source, /onKeyDown=\{handleSymbolScaleKeyDown\}/);
    assert.match(source, /onKeyUp=\{handleSymbolScaleKeyUp\}/);
    assert.match(source, /handleSymbolScaleBlur/);
    assert.match(source, /onBlur=\{handleSymbolScaleBlur\}/);
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
    const icons = readFileSync(resolve(import.meta.dirname, "icons.ts"), "utf8");

    assert.match(source, /optimizeIcon/);
    assert.match(source, /icon=\{optimizeIcon\} label=\{t\("optimize\.run"\)\}/);
    const optimizeIcon = icons.slice(
      icons.indexOf("export const optimizeIcon"),
      icons.indexOf("export const lockIcon"),
    );
    assert.equal((optimizeIcon.match(/<circle/g) ?? []).length, 4);
    assert.match(optimizeIcon, /fill="currentColor"/);
    assert.match(optimizeIcon, /stroke-linecap="round"/);
  });

  it("depicts tip-level regions as three mapped areas with location points", () => {
    const icons = readFileSync(resolve(import.meta.dirname, "icons.ts"), "utf8");
    const tipLevelRegionsIcon = icons.slice(
      icons.indexOf("export const tipLevelRegionsIcon"),
      icons.indexOf("export const explorerPanelIcon"),
    );

    assert.equal((tipLevelRegionsIcon.match(/<path/g) ?? []).length, 3);
    assert.equal((tipLevelRegionsIcon.match(/<circle/g) ?? []).length, 3);
    assert.match(tipLevelRegionsIcon, /stroke-linejoin="round"/);
    assert.doesNotMatch(tipLevelRegionsIcon, /stroke-width="6"/);
  });

  it("uses distinct Dutch labels for information and settings commands", () => {
    const translations = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/nl/ribbon.json"), "utf8"));
    assert.equal(translations.plan.cpts, "Sonderingen");
    assert.equal(translations.plan.cptSettings, "Sonderingsinstellingen");
    assert.equal(translations.plan.costSettings, "Kosteninstellingen");
  });
});
