import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Workspace translations", () => {
  it("translates the explorer and legend through the common language setting", () => {
    const app = readFileSync(resolve(import.meta.dirname, "../../App.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "Legend.tsx"), "utf8");

    assert.match(app, /t\("projectExplorer\.inputSources"\)/);
    assert.match(app, /t\(`projectExplorer\.sources\.\$\{source\.kind\}`\)/);
    assert.match(app, /t\(`projectExplorer\.statuses\.\$\{source\.status\}`\)/);
    assert.match(legend, /useTranslation\("common"\)/);
    assert.match(legend, /t\("legend\.size"\)/);
    assert.match(legend, /t\("legend\.tip"\)/);
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
