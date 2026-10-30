import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("pile-plan source and matching controls are translated consistently",()=>{
 const load=(language:string)=>JSON.parse(readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),'utf8'));
 const nl=load('nl'),en=load('en');assert.deepEqual(Object.keys(nl.locationMatchingEntry).sort(),Object.keys(en.locationMatchingEntry).sort());
 for(const copy of [nl,en])for(const key of ['title','open','confirmed','unreviewed','toleranceHelp','refreshHelp','revisionHelp','refreshSummary','nearestResult','nearestUnresolved'])assert.ok(copy.locationMatchingEntry[key]?.trim());assert.deepEqual(Object.keys(nl.pilePlanMatching).sort(),Object.keys(en.pilePlanMatching).sort());
 for(const language of ['nl','en']){const copy=load(language);for(const key of ['title','source','project','skip','summary','emptyColumnHelp','clearHelp','cptHelp','matchHelp','reviewNeeded'])assert.ok(copy.pilePlanMatching[key]?.trim());for(const key of ['selected-cpts','pile-count'])assert.ok(copy.tableImport.fields[key]);assert.match(copy.pilePlanMatching.rowId,/{{row}}.*{{id}}/);}
});


test("matching workflows share location terminology and translate local editor controls",()=>{
 const load=(language:string)=>JSON.parse(readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),'utf8'));
 const nl=load('nl'),en=load('en');assert.deepEqual(Object.keys(nl.matchingEditor).sort(),Object.keys(en.matchingEditor).sort());
 for(const copy of [nl,en]){
  assert.equal(copy.exportTools.new,copy.pilePlanMatching.source);assert.equal(copy.exportTools.old,copy.pilePlanMatching.project);
  for(const key of ['history','undo','redo','applyTolerance','toleranceHelp','tolerance'])assert.ok(copy.matchingEditor[key]?.trim());
 }
});
