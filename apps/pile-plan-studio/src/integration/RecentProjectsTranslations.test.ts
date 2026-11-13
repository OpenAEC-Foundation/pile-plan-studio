import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
describe("recent project explanations",()=>{
 for(const language of ["nl","en"])it(`explains local copies and recoverable failures in ${language}`,()=>{
  const read=(name:string)=>JSON.parse(readFileSync(resolve(import.meta.dirname,`../i18n/locales/${language}/${name}.json`),"utf8"));
  const backstage=read("backstage"),common=read("common");
  assert.match(backstage.openPanel.localCopy,language==="nl"?/Lokale kopie/:/Local copy/);
  assert.match(backstage.openPanel.localCopiesHelp,/IFCPP/);
  assert.match(backstage.openPanel.removeFile,/\{\{name\}\}/);
  assert.match(backstage.openPanel.removeFile,language==="nl"?/uit recente projecten verwijderen/:/remove.+from recent projects/i);
  assert.ok(common["recentProjects.storageFailed"].length>20);
  assert.match(common["recentProjects.copyMissing"],/IFCPP/);
 });
});
