import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("advice selection markers and direct status-switch help are translated",()=>{
 for(const lang of ["nl","en"]){
  const panel=JSON.parse(readFileSync(new URL(`../../i18n/locales/${lang}/rightPanel.json`,import.meta.url),"utf8"));
  for(const key of ["cpts.selectedPileAdvice","cpts.adviceHighlightFailed","cpts.selectOnlyLocation"])assert.ok(panel[key]?.trim(),`${lang}:${key}`);
  const common=JSON.parse(readFileSync(new URL(`../../i18n/locales/${lang}/common.json`,import.meta.url),"utf8"));
  assert.ok(common.viewer.focusSelection?.trim());
  assert.equal(common.viewer.focusSelectionLabel,"Focus");
  assert.match(common.loadDirection.show_compression,lang==="nl"?/Klik om druk/:/Click to show compression/);
  assert.match(common.loadDirection.show_tension,lang==="nl"?/Klik om trek/:/Click to show tension/);
 }
});
