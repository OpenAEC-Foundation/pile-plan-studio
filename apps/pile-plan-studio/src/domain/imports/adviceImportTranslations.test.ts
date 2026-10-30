import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("advice applicability and per-sheet size controls are translated",()=>{
 for(const lang of ["nl","en"]){const copy=JSON.parse(readFileSync(new URL(`../../i18n/locales/${lang}/common.json`,import.meta.url),"utf8"));
  for(const key of ["adviceApplicability","allPileCounts","specificPileCount","capPileCount","sizeSource","sizeFromColumn","fixedSheetSize","fixedPileSize","applicabilityHelp","missingResistance"])assert.ok(copy.tableImport[key]?.trim());
  assert.ok(copy.sourceViewer.columns.pile_count?.trim());
 }
});
