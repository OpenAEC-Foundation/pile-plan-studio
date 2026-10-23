import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importDiagnosticText } from "./importDiagnosticText.ts";

describe("import diagnostic text", () => {
  it("lists every invalid pile tip level with its source location", () => {
    const calls: Array<{ key: string; options?: Record<string, unknown> }> = [];
    const text = importDiagnosticText({
      severity: "error",
      code: "invalid-pile-tip-level-precision",
      count: 2,
      nodeIds: [],
      loadPointNames: [],
      xMm: null,
      yMm: null,
      location: null,
      tipLevelValues: [
        {
          value: "-18.5004",
          reason: "submillimetre",
          location: {
            fileName: "advies.xlsx",
            sheetName: "Blad1",
            row: 7,
            column: 3,
            columnName: "Puntniveau",
          },
        },
        {
          value: "-19.0006",
          reason: "submillimetre",
          location: {
            fileName: "advies.xlsx",
            sheetName: "Blad1",
            row: 9,
            column: 3,
            columnName: "Puntniveau",
          },
        },
      ],
      fallbackMessage: "Invalid levels.",
    }, (key, options) => {
      calls.push({ key, options });
      if (key.endsWith("sourceSheet")) return `sheet ${options?.sheet}`;
      if (key.endsWith("sourceRow")) return `row ${options?.row}`;
      if (key.endsWith("sourceColumn")) return `column ${options?.column}`;
      return String(options?.values ?? key);
    });

    assert.match(text, /-18\.5004 m \(advies\.xlsx, sheet Blad1, row 7, column 3\)/);
    assert.match(text, /-19\.0006 m \(advies\.xlsx, sheet Blad1, row 9, column 3\)/);
    assert.equal(calls.at(-1)?.key, "importProject.diagnostics.invalid-pile-tip-level-precision");
  });
});

it("keeps physical cell locations visible for invalid advice values",()=>{
  const text=importDiagnosticText({severity:"error",code:"invalid-required-value",count:1,nodeIds:[],loadPointNames:[],xMm:null,yMm:null,
    location:{fileName:"advies.xlsx",sheetName:"diep",row:7,column:4,columnName:null},tipLevelValues:[],fallbackMessage:"Invalid"},
    (key, options)=>key.endsWith("sourceSheet") ? `sheet ${options?.sheet}` : key.endsWith("sourceRow") ? `row ${options?.row}` : key.endsWith("sourceColumn") ? `column ${options?.column}` : "Invalid value");
  assert.match(text,/advies\.xlsx/);assert.match(text,/sheet diep/);assert.match(text,/row 7/);assert.match(text,/column 4/);
});

import { readFileSync } from 'node:fs';
import { createInstance } from 'i18next';
for (const language of ['nl','en']) it(`advice recovery messages expose field, value and action in ${language}`,async()=>{
 const copy=JSON.parse(readFileSync(new URL(`../i18n/locales/${language}/common.json`,import.meta.url),'utf8'));
 const i18n=createInstance();await i18n.init({lng:language,resources:{[language]:{translation:copy}}});
 const diagnostic={severity:'error' as const,code:'invalid-advice-value',count:1,nodeIds:[],loadPointNames:[],xMm:null,yMm:null,location:null,tipLevelValues:[],fallbackMessage:'UNTRANSLATED',
   advice:{field:'pile-size' as const,value:'320 mm',expectedUnit:'millimetres' as const,pileSizesMm:[],columnCount:null,requiredProfile:null}};
 const text=importDiagnosticText(diagnostic,(key,options)=>i18n.t(key,options));
 assert.match(text,/320 mm/);assert.doesNotMatch(text,/UNTRANSLATED|importProject\./);
 assert.match(text,language==='nl'?/afmeting/i:/size/i);
 assert.match(text,/mm/);
 for(const code of ['advice-profile-required','advice-profile-mismatch','unsupported-advice-layout','ambiguous-advice-layout','missing-advice-header','missing-advice-value','missing-advice-formula-result']) {
   const message=importDiagnosticText({...diagnostic,code,advice:{...diagnostic.advice,requiredProfile:'capacity-columns',pileSizesMm:[250,290]}},(key,options)=>i18n.t(key,options));
   assert.doesNotMatch(message,/UNTRANSLATED|importProject\./);
 }
});

import { fromCoreImportDiagnostic } from './coreImportContract.ts';
it('omitted WASM location fields do not render empty row and column labels',()=>{
 const d=fromCoreImportDiagnostic({severity:'error',code:'advice-profile-required',count:1,node_ids:[],fallback_message:'Choose',
   location:{file_name:'advies.xlsx',sheet_name:'Blad1'}});
 const text=importDiagnosticText(d,(key,options)=>key.endsWith('sourceRow')?'EMPTY_ROW':key.endsWith('sourceColumn')?'EMPTY_COLUMN':key.endsWith('sourceSheet')?String(options?.sheet):'Choose');
 assert.doesNotMatch(text,/EMPTY_ROW|EMPTY_COLUMN/);
 assert.equal(d.location?.row,null);assert.equal(d.location?.column,null);
});
