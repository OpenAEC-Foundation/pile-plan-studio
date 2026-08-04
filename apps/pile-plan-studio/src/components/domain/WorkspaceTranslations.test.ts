import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Workspace translations", () => {
  it("translates the explorer and legend through the common language setting", () => {
    const explorer = readFileSync(resolve(import.meta.dirname, "PilePlanExplorer.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.match(explorer, /t\("projectExplorer\.pilePlans"\)/);
    assert.match(explorer, /t\("projectExplorer\.newPilePlan"\)/);
    assert.match(explorer, /t\("projectExplorer\.rename"\)/);
    assert.match(legend, /useTranslation\("common"\)/);
    assert.match(legend, /t\("legend\.size"\)/);
    assert.match(legend, /t\("legend\.tip"\)/);
  });

  it("provides complete English and Dutch legend editor copy", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8"));

    for (const copy of [en.legend, nl.legend]) {
      assert.equal(typeof copy.edit, "string");
      assert.equal(typeof copy.editorTitle, "string");
      assert.equal(typeof copy.enabled, "string");
      assert.equal(typeof copy.disabled, "string");
      assert.equal(typeof copy.enableAll, "string");
      assert.equal(typeof copy.enableUsed, "string");
      assert.equal(typeof copy.disableAll, "string");
      assert.equal(typeof copy.usedWarning, "string");
      assert.equal(typeof copy.unused, "string");
    }
  });

  it("describes hover candidates as objects near the pointer", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8"));

    assert.equal(en.viewer.hover.candidateCount_other, "{{count}} objects near pointer");
    assert.equal(en.viewer.hover.nextCandidate, "Next object");
    assert.equal(nl.viewer.hover.candidateCount_other, "{{count}} objecten bij aanwijzer");
    assert.equal(nl.viewer.hover.nextCandidate, "Volgend object");
  });

  it("uses load-location terminology in the Dutch panel and ribbon", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/rightPanel.json"), "utf8");
    const ribbon = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/ribbon.json"), "utf8");

    assert.match(panel, /"tabs\.loadPoint":\s*"Belastinglocaties"/);
    assert.match(ribbon, /"loadPoints":\s*"Belastinglocaties"/);
  });

  it("provides complete English and Dutch copy for multi-load-point CPT settings", () => {
    const en = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/rightPanel.json"), "utf8");
    const nl = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/rightPanel.json"), "utf8");

    for (const copy of [en, nl]) {
      assert.match(copy, /"cptSettings\.selectedLoadPoints":/);
      assert.match(copy, /"cptSettings\.selectedCount":/);
      assert.match(copy, /"cptSettings\.global":/);
      assert.match(copy, /"cptSettings\.noSelection":/);
      assert.match(copy, /"cptSettings\.mixed":/);
      assert.match(copy, /"cptSettings\.monopolyDistance":/);
      assert.match(copy, /"cptSettings\.overwriteManualSelections":/);
      assert.match(copy, /"cptSettings\.manualCount":/);
      assert.match(copy, /"cptSettings\.algorithmic":/);
      assert.doesNotMatch(copy, /"cptSettings\.thisLoadPoint":/);
    }

    assert.match(en, /"cptSettings\.manualCount":\s*"\{\{count\}\} CPTs are manually selected across the selected load points\."/);
    assert.match(nl, /"cptSettings\.manualCount":\s*"\{\{count\}\} sonderingen zijn handmatig geselecteerd voor de geselecteerde belastinglocaties\."/);
  });

  it("translates CPT selection values and range labels at render time", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /localizeCptTableValue/);
    assert.match(panel, /cpts\.frdRange/);
    assert.match(panel, /localizeCptName/);
    assert.match(panel, /localizeCptName\(row\.governingLabel,\s*t\)/);
  });

  it("keeps clickable CPT names readable on the light table background", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "rightPanel.css"), "utf8");
    const cptLinkRule = styles.match(/\.cpt-link\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";

    assert.match(cptLinkRule, /color:\s*var\(--theme-text\)/);
    assert.match(cptLinkRule, /text-decoration:\s*underline/);
    assert.doesNotMatch(cptLinkRule, /--theme-accent-text/);
  });

  it("translates project import copy and uses foundation advice terminology", () => {
    const importPanel = readFileSync(resolve(import.meta.dirname, "ProjectImportPanel.tsx"), "utf8");
    const nlCommon = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"), "utf8");
    const enCommon = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/common.json"), "utf8");

    assert.match(importPanel, /useTranslation\("common"\)/);
    assert.match(importPanel, /t\("importProject\.title"\)/);
    assert.doesNotMatch(importPanel, />Import project data</);
    assert.match(nlCommon, /Funderingsadvies/);
    assert.match(enCommon, /Foundation advice/);
    assert.match(enCommon, /"rfemExport":\s*"RFEM export"/);
    assert.match(nlCommon, /"rfemExport":\s*"RFEM-export"/);
    assert.match(enCommon, /"automatic":\s*"Automatically detect"/);
    assert.match(nlCommon, /"automatic":\s*"Automatisch herkennen"/);
    assert.match(enCommon, /Select the RFEM worksheet that contains the node reactions/);
    assert.match(nlCommon, /Kies het RFEM-werkblad met de knoopreacties/);
  });

  it("translates the pile plan import workflow consistently", () => {
    const enBackstage = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/en/backstage.json"), "utf8");
    const nlBackstage = readFileSync(resolve(import.meta.dirname, "../../i18n/locales/nl/backstage.json"), "utf8");

    assert.match(enBackstage, /"importPilePlan":\s*"Import pile plan"/);
    assert.match(enBackstage, /"pileAssignments":\s*"Pile assignments"/);
    assert.match(nlBackstage, /"importPilePlan":\s*"Palenplan importeren"/);
    assert.match(nlBackstage, /"pileAssignments":\s*"Paaltoewijzingen"/);
    assert.match(nlBackstage, /"cptSelections":\s*"Sonderingselecties"/);
    assert.match(nlBackstage, /"tolerance":\s*"Coördinatietolerantie"/);
  });

  it("renders the updated design resistance notation in visible tables", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");

    assert.match(panel, /ResistanceLabel/);
    assert.match(panel, /<sub>c;net;d<\/sub>/);
    assert.doesNotMatch(panel, />FRD</);
  });
});
