import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Optimize ribbon", () => {
  it("connects settings and run commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenOptimizationSettings/);
    assert.match(source, /onRunOptimization/);
    assert.match(source, /optimizationDisabled/);
    assert.match(source, /label=\{t\("optimize\.run"\)\} disabled=\{optimizationDisabled\} onClick=\{onRunOptimization\}/);
  });

  it("connects only supported project and plan commands", () => {
    const source = readFileSync(resolve(import.meta.dirname, "Ribbon.tsx"), "utf8");
    assert.match(source, /onOpenProjectInformation/);
    assert.match(source, /onOpenRightPanel/);
    assert.match(source, /onOpenRightPanel\?\.\("load-point"\)/);
    assert.match(source, /onOpenRightPanel\?\.\("cpts"\)/);
    assert.match(source, /onOpenRightPanel\?\.\("cpt-settings"\)/);
    assert.match(source, /onOpenRightPanel\?\.\("cost-settings"\)/);
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
