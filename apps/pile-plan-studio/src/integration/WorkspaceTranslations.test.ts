import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Workspace translations", () => {
  it("translates pile option column preferences in both languages", () => {
    for (const language of ["en", "nl"]) {
      const panel = JSON.parse(readFileSync(resolve(import.meta.dirname, `../i18n/locales/${language}/rightPanel.json`), "utf8"));
      for (const key of ["button", "title", "single", "multiple", "help", "drag", "dragHelp", "moved", "reset", "close"]) {
        assert.ok(panel[`columnSettings.${key}`]?.trim(), `${language}: ${key}`);
      }
      for (const key of ["drag", "moved"]) assert.ok(panel[`columnSettings.${key}`].includes("{{column}}"));
      for (const key of ["symbol", "size", "tip", "status", "cost", "use", "governing", "frd", "totalCost", "maxUse", "criticalLoadPoint"]) {
        assert.ok(panel[`columns.${key}`]?.trim(), `${language}: columns.${key}`);
      }
    }
  });
  it("labels split-view controls and the return-to-plan action in both languages", () => {
    for (const language of ["en", "nl"]) {
      const panel = JSON.parse(readFileSync(resolve(import.meta.dirname, `../i18n/locales/${language}/rightPanel.json`), "utf8"));
      const common = JSON.parse(readFileSync(resolve(import.meta.dirname, `../i18n/locales/${language}/common.json`), "utf8"));
      for (const key of ["tabs.combined", "split.resize", "split.help"]) {
        assert.ok(panel[key]?.trim(), `${language}: ${key}`);
      }
      assert.ok(common.sourceViewer.backToPlan?.trim(), `${language}: sourceViewer.backToPlan`);
    }
  });

  it("distinguishes local improvement, stop with best plan, and cancellation in both languages",()=>{
    for(const language of ["nl","en"]) {
      const ribbon=JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/ribbon.json`),"utf8")).ilp;
      const panel=JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/rightPanel.json`),"utf8")).ilp;
      for(const key of ["runSolver","runLocal","localShort","localHelp","stopBest","cancel"]) assert.ok(ribbon[key]?.length);
      assert.ok(ribbon.skipUnsolvable?.length);
      assert.ok(ribbon.targetLocations?.length);
      for(const key of ["saveAs","planName","currentPlan","customCandidates","customHelp","chooseCandidates","utilizationAndCost","allowedConfigurations","selectSizeCandidates","selectTipCandidates","selectAllCandidates","clearCandidates"])assert.ok(ribbon[key]?.length);
      assert.ok(ribbon.skipUnsolvableHelp?.length);
      for (const key of ["tips", "sizes", "configurations", "unlimited", "weights", "currentPlan"]) assert.ok(ribbon.sectionSummary[key]?.length);
      assert.ok(panel.details?.length);
      assert.ok(panel.enableSkipUnsolvable?.length);
      assert.ok(panel.skipUnsolvableEnabled?.length);
      for (const form of ["one", "other"]) assert.ok(panel[`unsolvableSummary_${form}`]?.includes("{{count}}"));
      assert.ok(panel.messages?.includes("{{count}}"));
      assert.ok(panel.messageLocations?.includes("{{count}}"));
      assert.ok(panel.livePreview?.includes("{{score}}"));
      const common=JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/common.json`),"utf8"));
      assert.ok(common.projectExplorer.optimizing?.length);
      assert.ok(panel.skipped?.length);
      assert.ok(panel.diagnostics.skipped_unsolvable_units?.length);
      assert.ok(panel.diagnostics.no_solvable_targets?.length);
      assert.notEqual(ribbon.stopBest,ribbon.cancel);
      for(const key of ["score","scoreHelp","bestScore","lowerBound","remainingGap","timeLimitBest","localHelp"]) assert.ok(panel[key]?.length);
      assert.ok(panel.diagnostics.stopped_with_best);
      assert.ok(panel.diagnostics.local_optimization);
      assert.ok(panel.reusedPlan?.length);
      assert.ok(panel.diagnostics.spatial_current_plan_fallback?.length);
    }
  });
  it("provides matching nonempty ILP copy and placeholders in both languages", () => {
    function leaves(value: unknown, prefix = ""): Record<string, string> {
      if (typeof value === "string") return { [prefix]: value };
      assert.ok(value && typeof value === "object", prefix);
      return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
        Object.entries(leaves(child, `${prefix}.${key}`))));
    }
    for (const namespace of ["ribbon", "rightPanel"]) {
      const copies = ["en", "nl"].map(language => leaves(JSON.parse(readFileSync(
        resolve(import.meta.dirname, `../i18n/locales/${language}/${namespace}.json`), "utf8",
      )).ilp));
      assert.deepEqual(Object.keys(copies[0]).sort(), Object.keys(copies[1]).sort());
      if (namespace === "rightPanel") {
        assert.match(copies[0][".diagnostics.spatial_reference_fallback"], /time limit.*cost-reference.*not proven/i);
        assert.match(copies[1][".diagnostics.spatial_reference_fallback"], /rekentijd.*kostenreferentie.*niet bewezen/i);
        assert.match(copies[0][".proof.feasible"], /not proven optimal/i);
        assert.match(copies[1][".proof.feasible"], /niet bewezen optimaal/i);
        assert.ok(copies[0][".solutionProof"] && copies[1][".solutionProof"]);
        assert.equal(copies[0][".locallyImprovedPlan"], "Locally improved pile plan");
        assert.equal(copies[1][".locallyImprovedPlan"], "Lokaal verbeterd palenplan");
        assert.doesNotMatch(copies[0][".diagnostics.spatial_improved_start_fallback"], /starting plan/i);
        assert.doesNotMatch(copies[1][".diagnostics.spatial_improved_start_fallback"], /startplan/i);
      }
      for (const [key, english] of Object.entries(copies[0])) {
        const dutch = copies[1][key];
        assert.ok(english.trim() && dutch.trim(), key);
        assert.deepEqual(english.match(/\{\{[^}]+\}\}/g)?.sort() ?? [],
          dutch.match(/\{\{[^}]+\}\}/g)?.sort() ?? [], key);
      }
    }
  });

  it("provides bilingual project-open feedback for invalid pile tip levels", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

    assert.match(en.pileTipLevels.projectOpenError_one, /not opened/i);
    assert.match(en.pileTipLevels.projectOpenError_one, /millimetre/i);
    assert.match(nl.pileTipLevels.projectOpenError_one, /niet geopend/i);
    assert.match(nl.pileTipLevels.projectOpenError_one, /millimeter/i);
    assert.match(en.importProject.diagnostics["invalid-pile-tip-level-precision"], /millimetre/i);
    assert.match(nl.importProject.diagnostics["invalid-pile-tip-level-precision"], /millimeter/i);
  });

  it("provides bilingual feedback for every structured project-document error", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

    for (const code of [
      "invalid-json",
      "invalid-schema",
      "unsupported-schema-version",
      "duplicate-pile-plan-id",
      "invalid-pile-costs",
      "invalid-ilp-settings",
    ]) {
      assert.equal(typeof en.projectDocument.errors[code], "string");
      assert.equal(typeof nl.projectDocument.errors[code], "string");
    }

    assert.match(en.projectDocument.errors["invalid-json"], /not opened/i);
    assert.match(nl.projectDocument.errors["invalid-json"], /niet geopend/i);
    assert.match(en.projectDocument.errors["unsupported-schema-version"], /version/i);
    assert.match(nl.projectDocument.errors["unsupported-schema-version"], /versie/i);
    assert.match(en.projectDocument.errors["invalid-pile-costs"], /pile cost/i);
    assert.match(nl.projectDocument.errors["invalid-pile-costs"], /paalkost/i);
  });

  it("provides bilingual feedback for unavailable Undo and Redo requests", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

    assert.equal(en.history.result.unavailable.undo, "There is no operation to undo.");
    assert.equal(en.history.result.unavailable.redo, "There is no operation to redo.");
    assert.equal(nl.history.result.unavailable.undo, "Er is geen bewerking om ongedaan te maken.");
    assert.equal(nl.history.result.unavailable.redo, "Er is geen bewerking om opnieuw uit te voeren.");
  });

  it("provides bilingual tip-level region toggle labels", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/ribbon.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/ribbon.json"), "utf8"));

    assert.equal(en.view.showTipLevelRegions, "Show tip-level regions");
    assert.equal(en.view.hideTipLevelRegions, "Hide tip-level regions");
    assert.equal(nl.view.showTipLevelRegions, "Puntniveaugebieden tonen");
    assert.equal(nl.view.hideTipLevelRegions, "Puntniveaugebieden verbergen");
  });

  it("translates the explorer and legend through the common language setting", () => {
    const explorer = readFileSync(resolve(import.meta.dirname, "../components/domain/pile-plans/PilePlanExplorer.tsx"), "utf8");
    const legend = readFileSync(resolve(import.meta.dirname, "../components/domain/pile-plans/Legend.tsx"), "utf8");

    assert.match(explorer, /t\("projectExplorer\.pilePlans"\)/);
    assert.match(explorer, /t\("projectExplorer\.newPilePlan"\)/);
    assert.match(explorer, /t\("projectExplorer\.rename"\)/);
    assert.match(legend, /useTranslation\("common"\)/);
    assert.match(legend, /t\("legend\.size"\)/);
    assert.match(legend, /t\("legend\.tip"\)/);
  });

  it("provides complete English and Dutch legend editor copy", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

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
      assert.equal(typeof copy.symbolRepresents, "string");
      assert.equal(typeof copy.colorRepresentsTip, "string");
      assert.equal(typeof copy.colorRepresentsSize, "string");
      assert.equal(typeof copy.pilePlansInScope, "string");
      assert.equal(typeof copy.encodingSummary, "string");
      assert.equal(typeof copy.scopeCurrentOnly, "string");
      assert.equal(typeof copy.scopeSelection, "string");
      assert.equal(typeof copy.selectAllPlans, "string");
      assert.equal(typeof copy.selectCurrentPlanOnly, "string");
      assert.equal(typeof copy.activeOutsideScope, "string");
      assert.equal(typeof copy.planUsageTitle, "string");
      assert.equal(typeof copy.assignedLocations_other, "string");
      assert.equal(typeof copy.duplicateEncoding, "string");
      assert.equal(typeof copy.duplicateEncodingTitle, "string");
      assert.equal(typeof copy.duplicateEncodingDetails, "string");
      assert.equal(typeof copy.duplicateConflict, "string");
      assert.equal(Object.keys(copy.encodingModes).length, 3);
      assert.equal(typeof copy.recolorSizes, "string");
      assert.equal(typeof copy.recolorTipLevels, "string");
      assert.equal(typeof copy.shapeFromCostTable, "string");
      assert.equal(typeof copy.missingCostShape, "string");
      assert.equal(typeof copy.showTipLevelRegions, "string");
      assert.equal(typeof copy.regionsHidden, "string");
      assert.equal(typeof copy.regionsUnavailable, "string");
      assert.equal(typeof copy.assignSymbols, "string");
      assert.equal(typeof copy.assignColors, "string");
      assert.equal(typeof copy.resetAppearance, "string");
      assert.equal(typeof copy.symbolLimit, "string");
      assert.equal(typeof copy.colorblindAid, "string");
      assert.equal(Object.keys(copy.colorSchemes).length, 6);
      assert.equal(Object.keys(copy.baseShapes).length, 9);
      assert.equal(Object.keys(copy.fillPatterns).length, 6);
    }

    assert.equal(en.legend.symbolRepresents, "Symbol represents");
    assert.equal(en.legend.colorRepresentsTip, "Color represents tip level");
    assert.equal(en.legend.colorRepresentsSize, "Color represents size");
    assert.equal(en.legend.colorSchemes.colorblindFriendly, "Colorblind-friendly");
    assert.equal(en.legend.colorSchemes.tableauExtended, "Tableau Extended");
    assert.equal(en.legend.colorSchemes.evenHue, "Even Hue Spread");
    assert.equal(nl.legend.symbolRepresents, "Symbool representeert");
    assert.equal(nl.legend.colorRepresentsTip, "Kleur representeert puntniveau");
    assert.equal(nl.legend.colorRepresentsSize, "Kleur representeert afmeting");
    assert.equal(nl.legend.scopeCurrentOnly, "Alleen huidig palenplan");
    assert.equal(nl.legend.selectAllPlans, "Alles selecteren");
    assert.equal(nl.legend.selectCurrentPlanOnly, "Alleen huidig");
    assert.equal(en.legend.selectAllPlans, "Select all");
    assert.equal(en.legend.selectCurrentPlanOnly, "Current only");
    assert.equal(nl.legend.activeOutsideScope, "Actief buiten bereik: {{count}}");
    assert.equal(nl.legend.assignedLocations_other, "Toegewezen aan {{count}} locaties");
    assert.equal(nl.legend.duplicateEncoding, "Dubbele codering: {{count}}");
    assert.equal(en.legend.duplicateEncoding, "Duplicate encoding: {{count}}");
    assert.equal(
      nl.legend.encodingModes.sizeColorTipRegion,
      "Afmeting als symboolkleur · Puntniveau als gebiedskleur",
    );
    assert.equal(
      en.legend.encodingModes.sizeColorTipRegion,
      "Size by symbol color · Tip level by region color",
    );
    assert.equal(nl.legend.regionsHidden, "Verborgen");
    assert.equal(nl.legend.regionsUnavailable, "Niet beschikbaar");
    assert.equal(nl.legend.colorSchemes.colorblindFriendly, "Kleurenblindvriendelijk");
    assert.equal(nl.legend.colorSchemes.tableauExtended, "Tableau uitgebreid");
    assert.equal(nl.legend.colorSchemes.evenHue, "Gelijkmatige tintspreiding");
  });

  it("describes hover candidates as objects near the pointer", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

    assert.equal(en.viewer.hover.candidateCount_other, "{{count}} objects near pointer");
    assert.equal(en.viewer.hover.nextCandidate, "Next object");
    assert.equal(nl.viewer.hover.candidateCount_other, "{{count}} objecten bij aanwijzer");
    assert.equal(nl.viewer.hover.nextCandidate, "Volgend object");
  });

  it("uses load-location terminology in the Dutch panel and ribbon", () => {
    const panel = readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/rightPanel.json"), "utf8");
    const ribbon = readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/ribbon.json"), "utf8");

    assert.match(panel, /"tabs\.loadPoint":\s*"Belastinglocaties"/);
    assert.match(ribbon, /"loadPoints":\s*"Belastinglocaties"/);
  });

  it("provides complete English and Dutch copy for multi-load-point CPT settings", () => {
    const en = readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/rightPanel.json"), "utf8");
    const nl = readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/rightPanel.json"), "utf8");

    for (const copy of [en, nl]) {
      assert.match(copy, /"cptSettings\.selectedLoadPoints":/);
      assert.match(copy, /"cptSettings\.selectedCount":/);
      assert.match(copy, /"cptSettings\.global":/);
      assert.match(copy, /"cptSettings\.noSelection":/);
      assert.match(copy, /"cptSettings\.mixed":/);
      assert.match(copy, /"cptSettings\.monopolyDistance":/);
      assert.match(copy, /"cptSettings\.maxDistanceHelp":/);
      assert.match(copy, /"cptSettings\.monopolyDistanceHelp":/);
      assert.match(copy, /"cptSettings\.overwriteManualSelections":/);
      assert.match(copy, /"cptSettings\.manualCount":/);
      assert.match(copy, /"cptSettings\.algorithmic":/);
      assert.doesNotMatch(copy, /"cptSettings\.thisLoadPoint":/);
    }

    assert.match(en, /"cptSettings\.manualCount":\s*"\{\{count\}\} CPTs are manually selected across the selected load points\."/);
    assert.match(nl, /"cptSettings\.manualCount":\s*"\{\{count\}\} sonderingen zijn handmatig geselecteerd voor de geselecteerde belastinglocaties\."/);
  });

  it("provides bilingual group-selection notices for the pile options panel", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/rightPanel.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/rightPanel.json"), "utf8"));

    assert.equal(
      en["pileOptions.groupSelection.single"],
      "This selection is a group of {{count}} marked load points.",
    );
    assert.equal(
      en["pileOptions.groupSelection.multiple_one"],
      "This selection includes {{count}} group with {{markedCount}} marked load points in total.",
    );
    assert.equal(
      nl["pileOptions.groupSelection.single"],
      "Deze selectie betreft een groep van {{count}} gemarkeerde locaties.",
    );
    assert.equal(
      nl["pileOptions.groupSelection.multiple_one"],
      "Deze selectie betreft {{count}} groep met in totaal {{markedCount}} gemarkeerde locaties.",
    );
  });

  it("translates CPT selection values and range labels at render time", () => {
    const panel = ["CptPanel.tsx", "LoadPointPanel.tsx", "PanelControls.tsx"]
      .map((file) => `../components/domain/right-panel/${file}`)
      .map((file) => readFileSync(resolve(import.meta.dirname, file), "utf8"))
      .join("\n");

    assert.match(panel, /localizeCptTableValue/);
    assert.match(panel, /cpts\.frdRange/);
    assert.match(panel, /localizeCptName/);
    assert.match(panel, /localizeCptName\(row\.governingLabel,\s*t\)/);
  });

  it("keeps clickable CPT names readable on the light table background", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../components/domain/right-panel/rightPanel.css"), "utf8");
    const cptLinkRule = styles.match(/\.cpt-link\s*\{(?<body>[^}]*)\}/s)?.groups?.body ?? "";

    assert.match(cptLinkRule, /color:\s*var\(--theme-text\)/);
    assert.match(cptLinkRule, /text-decoration:\s*underline/);
    assert.doesNotMatch(cptLinkRule, /--theme-accent-text/);
  });

  it("translates project import copy and uses foundation advice terminology", () => {
    const importPanel = readFileSync(resolve(import.meta.dirname, "../components/domain/imports/ProjectImportPanel.tsx"), "utf8");
    const nlCommon = readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8");
    const enCommon = readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8");

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

  it("describes the project reference level and its pile cut-off assumption in both languages", () => {
    const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/common.json"), "utf8"));
    const nl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/common.json"), "utf8"));

    assert.equal(nl.importProject.pileHeadLevel, "Peil t.o.v. NAP (m)");
    assert.match(nl.importProject.pileHeadLevelHelp, /afhakniveau/);
    assert.equal(nl.projectInformation.pileHeadLevel, "Peil t.o.v. NAP (m)");
    assert.match(nl.projectInformation.pileHeadLevelHelp, /afhakniveau/);
    assert.equal(en.importProject.pileHeadLevel, "Reference level (m)");
    assert.match(en.importProject.pileHeadLevelHelp, /pile cut-off level/);
    assert.equal(en.projectInformation.pileHeadLevel, "Reference level (m)");
    assert.match(en.projectInformation.pileHeadLevelHelp, /pile cut-off level/);
  });

  it("translates the pile plan import workflow consistently", () => {
    const enBackstage = readFileSync(resolve(import.meta.dirname, "../i18n/locales/en/backstage.json"), "utf8");
    const nlBackstage = readFileSync(resolve(import.meta.dirname, "../i18n/locales/nl/backstage.json"), "utf8");

    assert.match(enBackstage, /"importPilePlan":\s*"Import pile plan"/);
    assert.match(enBackstage, /"pileAssignments":\s*"Pile assignments"/);
    assert.match(nlBackstage, /"importPilePlan":\s*"Palenplan importeren"/);
    assert.match(nlBackstage, /"pileAssignments":\s*"Paaltoewijzingen"/);
    assert.match(nlBackstage, /"cptSelections":\s*"Sonderingselecties"/);
    assert.match(nlBackstage, /"tolerance":\s*"Coördinatietolerantie"/);
  });

  it("renders the updated design resistance notation in visible tables", () => {
    const panel = ["CptPanel.tsx", "LoadPointPanel.tsx", "PanelControls.tsx"]
      .map((file) => `../components/domain/right-panel/${file}`)
      .map((file) => readFileSync(resolve(import.meta.dirname, file), "utf8"))
      .join("\n");

    assert.match(panel, /ResistanceLabel/);
    assert.match(panel, /<sub>c;net;d<\/sub>/);
    assert.doesNotMatch(panel, />FRD</);
  });
});

it("explains the running plan, cooperative stopping and historical results in both languages",()=>{
  for(const language of ["nl","en"]) {
    const copy=JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/rightPanel.json`),"utf8")).ilp;
    assert.match(copy.runningPlan,/{{name}}/);
    assert.match(copy.planResult,/{{name}}/);
    for(const key of ["viewPlan","stoppingHelp","resultStale","usedWeights"])assert.ok(copy[key].trim().length>0);
    assert.match(copy.stoppingHelp,language==="nl"?/Wacht.*solver/:/wait.*solver/);
  }
});

it("describes two additive neighbor weights in both languages",()=>{
  for(const language of ["nl","en"]) {
    const copy=JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/ribbon.json`),"utf8")).ilp;
    assert.ok(copy.tip_only_milli && copy.size_only_milli);
    assert.equal(copy.both_milli,undefined);
    assert.match(copy.bothHelp,language==="nl"?/opgeteld/:/added together/);
    assert.doesNotMatch(copy.sectionSummary.weights,/both/);
  }
});
