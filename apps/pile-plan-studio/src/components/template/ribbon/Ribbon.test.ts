import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Plan and View ribbon", () => {
  it("provides translated labels for editing numeric ribbon values",()=>{
    for(const [language,expected] of [["nl","{{label}} aanpassen"],["en","Edit {{label}}"]]){
      const messages=JSON.parse(readFileSync(resolve(import.meta.dirname,`../../../i18n/locales/${language}/ribbon.json`),"utf8"));
      assert.equal(messages.view.editValue,expected);
    }
  });
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
    assert.match(source, /<Slider/);
    assert.match(source, /active=\{foregroundLayer === "load-points"\}/);
    assert.match(source, /active=\{foregroundLayer === "cpts"\}/);
  });

  it("offers a project-backed group visibility toggle under View", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const app = readFileSync(resolve(import.meta.dirname, "../../../app/session/AppSession.tsx"), "utf8");

    assert.match(source, /showLoadPointGroups/);
    assert.match(source, /onLoadPointGroupVisibilityChange/);
    assert.match(source, /view\.showGroups/);
    assert.match(app, /showLoadPointGroups=\{projectState\.showLoadPointGroups\}/);
    assert.match(app, /showLoadPointGroups,\s*\}\)/);
  });

  it("keeps the tip-level region subject intact above its toggle action", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.match(source, /className="tip-level-regions-toggle"/);
    assert.match(styles, /\.ribbon-btn\.tip-level-regions-toggle\s*{[\s\S]*?width:\s*min-content/);
    assert.match(styles, /\.ribbon-btn\.tip-level-regions-toggle\s*{[\s\S]*?min-width:\s*104px/);
  });

  it("uses shared tabs for selection and separates ribbon content", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.doesNotMatch(source, /ribbon-tab-border|ribbon-tab-gap|updateHighlight/);
    assert.match(source, /<Tabs label=\{t\("tabs.label"\)\}/);
    assert.doesNotMatch(source, /RibbonTab/);
    assert.doesNotMatch(css, /\.ribbon-tab\.active/);
    assert.match(css, /\.ribbon-content-wrapper\s*{[\s\S]*?border-bottom:\s*1px solid var\(--theme-border\)/);
  });

  it("provides stable visibility-toggle names in both languages", () => {
    const expected = {
      nl: ["Grid", "Puntniveaugebieden", "Groepen", "Verkenner", "Eigenschappen"],
      en: ["Grid", "Tip-level regions", "Groups", "Explorer", "Properties"],
    };
    for (const language of ["nl", "en"] as const) {
      const {view} = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../i18n/locales/${language}/ribbon.json`), "utf8"));
      assert.deepEqual([view.grid, view.tipLevelRegions, view.groups, view.explorer, view.properties], expected[language]);
      const panel = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../i18n/locales/${language}/rightPanel.json`), "utf8"));
      assert.ok(panel["groupingSettings.viewHelp"].includes(language === "nl" ? "Weergave > Groepen" : "View > Groups"));
      assert.doesNotMatch(panel["groupingSettings.viewHelp"], /Groepen tonen|Show groups/);

    }
  });

  it("names the ribbon tablist in both languages", () => {
    for (const [language, label] of [["nl", "Linttabbladen"], ["en", "Ribbon tabs"]]) {
      const messages = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../i18n/locales/${language}/ribbon.json`), "utf8"));
      assert.equal(messages.tabs.label, label);
    }
  });

  it("draws the preferred utilization track only between its two handles", () => {
    const source = readFileSync(resolve(import.meta.dirname, "UtilizationRangeSlider.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "Ribbon.css"), "utf8");

    assert.match(source, /ribbon-dual-range-selection/);
    assert.match(source, /left:\s*`\$\{minimum\*100\}%`/);
    assert.match(source, /width:\s*`\$\{\(maximum-minimum\)\*100\}%`/);
    assert.match(css, /\.ribbon-dual-range-selection\s*{[\s\S]*?background:\s*var\(--theme-accent\)/);
    assert.match(css, /::-webkit-slider-runnable-track\s*{[\s\S]*?background:\s*transparent/);
    assert.match(css, /::-moz-range-track\s*{[\s\S]*?background:\s*transparent/);
  });

  it("opens the optimization panel from a single ribbon button", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    const group = source.slice(source.indexOf('<RibbonGroup label={t("optimize.ilp")}>'));
    const buttons = group.slice(0, group.indexOf('</RibbonGroup>'));
    assert.equal((buttons.match(/<RibbonButton /g) ?? []).length, 1);
    assert.match(buttons, /onOpenTaskPanel\?\.\("ilp-optimization"\)/);
    assert.doesNotMatch(source, /onRunIlpOptimization|onRunLocalOptimization/);
    for (const [language, title, action] of [["nl", "Optimalisatie", "Optimaliseren"], ["en", "Optimization", "Optimize"]]) {
      const translations = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../i18n/locales/${language}/ribbon.json`), "utf8"));
      assert.equal(translations.optimize.ilp, title);
      assert.equal(translations.ilp.run, action);
      assert.equal(translations.ilp.runSolver, action);
      assert.match(translations.ilp.solverHelp, /ILP/);
      const panel = JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../i18n/locales/${language}/rightPanel.json`), "utf8"));
      assert.doesNotMatch(panel.ilp.title + panel.ilp.planResult, /ILP/);
    }
  });

  it("connects only supported project and plan commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenProjectInformation/);
    assert.match(source, /onOpenRightPanel/);
    assert.match(source, /onOpenRightPanel\?\.\("load-point"\)/);
    assert.match(source, /onOpenRightPanel\?\.\("cpts"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("cpt-settings"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("cost-settings"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("grouping-settings"\)/);
    assert.match(source, /onOpenTaskPanel\?\.\("ilp-optimization"\)/);
    assert.doesNotMatch(source, /label=\{t\("project\.validate"\)\}/);
    assert.doesNotMatch(source, /label=\{t\("view\.help"\)\}/);
  });

  it("depicts tip-level regions as a split map with three location points", () => {
    const icons = readFileSync(resolve(import.meta.dirname, "../icons/pile-plan-proposals.svg"), "utf8");
    const tipLevelRegionsIcon = icons.match(/<symbol id="i24-pile.tip-regions"[^>]*>([\s\S]*?)<\/symbol>/)?.[1] ?? "";

    assert.equal((tipLevelRegionsIcon.match(/<path/g) ?? []).length, 2);
    assert.equal((tipLevelRegionsIcon.match(/<circle/g) ?? []).length, 3);
    assert.match(tipLevelRegionsIcon, /stroke-linejoin="round"/);
    assert.doesNotMatch(tipLevelRegionsIcon, /stroke-width="6"/);
  });

  it("uses distinct Dutch labels for information and settings commands", () => {
    const translations = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/nl/ribbon.json"), "utf8"));
    assert.equal(translations.plan.cpts, "Sonderingen");
    assert.equal(translations.plan.cptSettings, "Sonderingsinstellingen");
    assert.equal(translations.plan.costSettings, "Kosteninstellingen");
    assert.equal(translations.plan.groupingSettings, "Groeperingsinstellingen");
    assert.equal(translations.plan.costs, "Kosten");
    assert.equal(translations.plan.groups, "Groepen");
    const english = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../i18n/locales/en/ribbon.json"), "utf8"));
    assert.equal(english.plan.costs, "Costs");
    assert.equal(english.plan.groups, "Groups");
  });
});
