import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EXPORT_FIELDS} from "./exportColumns.ts";

test("every selectable export field and proposal explanation is available in Dutch and English",()=>{
 for(const language of ["nl","en"]){
  const messages=JSON.parse(readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),"utf8")).exportTools;
  for(const field of EXPORT_FIELDS){assert.ok(messages.fields[field]?.trim(),`${language}: field ${field}`);assert.ok(messages.headers[field]?.trim(),`${language}: header ${field}`);}
  for(const key of ["exportTitle","includeProposals","proposalCode","originalHelp","proposalHelp","proposalSummary","exportIdHelp","reviewProposalSources","statusDisplay","statusStandard","statusCustom","statusCustomHelp","coordinateSource","coordinateOldWithinTolerance","coordinateNew","coordinateSourceHelp","movementThresholdHelp"]){assert.ok(messages[key]?.trim(),`${language}: ${key}`);}
  for(const status of ["valid","insufficient","missing","no_cpts","unassigned"]){assert.ok(messages.statusLabels[status]?.trim());}
  assert.match(messages.proposalSummary,/\{\{oldCount\}\}/);assert.match(messages.proposalSummary,/\{\{newCount\}\}/);
  assert.ok(messages.outputColumnsHelp.trim());
  assert.ok(messages.exportPreview.trim());
  assert.ok(messages.reviewAndConfirmLinks.trim());
  assert.ok(messages.revisionPreviewBlocked.trim());
  assert.match(messages.dragColumn,/\{\{name\}\}/);
  assert.match(messages.columnMoved,/\{\{position\}\}/);
 }
});

test("the CAD export is available in Dutch and English", () => {
  for (const language of ["nl", "en"]) {
    const locale = new URL('../../i18n/locales/' + language + '/backstage.json', import.meta.url);
    const { cad } = JSON.parse(readFileSync(locale, "utf8")).exportPanel;
    for (const key of ["title", "description", "format", "downloadCad", "downloadPdf", "drawingSettings", "numbering", "pileNumbers", "locationNumbers", "symbols", "patternedSymbols", "viewerSymbols", "includeCpts", "open", "popupBlocked", "openFailed", "piles", "regions", "unassigned", "legendTitle", "legendMark", "legendSize", "legendCount", "legendCpts", "proposals", "regionsUnavailable", "failed"]) {
      assert.ok(cad[key]?.trim(), language + ": " + key);
    }
    for (const key of ["noNumbers", "numberSize", "sizeAutomatic", "sizeCompact", "regionDisplay", "regionsFilled", "regionsOutlines", "regionsHidden", "editQuadrants"]) {
      assert.ok(cad[key]?.trim(), language + ": " + key);
    }
    for (const key of ["title", "help", "sizes", "patterns", "swap", "reset", "apply", "empty", "filled", "topRight", "topLeft", "bottomLeft", "bottomRight"]) {
      assert.ok(cad.quadrants[key]?.trim(), language + ": quadrants." + key);
    }
    assert.ok(cad.plan?.trim());
    assert.equal(cad.title, language === "nl" ? "CAD-tekening" : "CAD drawing");
    assert.match(cad.description, /PDF.*A0/);
    assert.match(cad.failed, /\{\{format\}\}/);
  }
});
