import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EXPORT_FIELDS} from "./exportColumns.ts";

test("every selectable export field and proposal explanation is available in Dutch and English",()=>{
 for(const language of ["nl","en"]){
  const messages=JSON.parse(readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),"utf8")).exportTools;
  for(const field of EXPORT_FIELDS){assert.ok(messages.fields[field]?.trim(),`${language}: field ${field}`);assert.ok(messages.headers[field]?.trim(),`${language}: header ${field}`);}
  for(const key of ["includeProposals","proposalCode","originalHelp","proposalHelp","proposalSummary","exportIdHelp","reviewProposalSources","statusDisplay","statusStandard","statusCustom","statusCustomHelp","coordinateSource","coordinateOldWithinTolerance","coordinateNew","coordinateSourceHelp","movementThresholdHelp"]){assert.ok(messages[key]?.trim(),`${language}: ${key}`);}
  for(const status of ["valid","insufficient","missing","no_cpts","unassigned"]){assert.ok(messages.statusLabels[status]?.trim());}
  assert.match(messages.proposalSummary,/\{\{oldCount\}\}/);assert.match(messages.proposalSummary,/\{\{newCount\}\}/);
 }
});
