import { test } from "node:test";
import assert from "node:assert/strict";
import { toCoreImportSource } from "./coreImportContract.ts";
import { sourceImportErrorFromUnknown } from "./adviceImportContract.ts";

test("advice selection preserves explicit empty versus missing and stable identity", () => {
  const source = { sourceId: "a", role: "bearing-capacities" as const, profile: "auto" as const,
    profileOptions: { coordinateSheet: null, reactionSheet: null, adviceSheets: [] },
    fileName: "advies.xlsx", format: "xlsx" as const, bytes: new Uint8Array() };
  assert.deepEqual(toCoreImportSource(source).profile_options.advice_sheets, []);
  assert.equal(toCoreImportSource(source).source_id, "a");
});
test("structured final errors retain all conflict values and physical locations", () => {
  const result = sourceImportErrorFromUnknown({ message: "Conflict", diagnostics: [], conflicts: [
    { cpt_id: 1, pile_size_mm: 290, pile_tip_level_mm: -15000, values: [
      { frd_kn: 500, locations: [{ source_id: "a", file_name: "a.xlsx", sheet_name: "diep", row: 7, column: 4 }] },
      { frd_kn: 600, locations: [{ source_id: "b", file_name: "a.xlsx", sheet_name: "diep", row: 9, column: 4 }] },
    ] },
  ] });
  assert.equal(result?.conflicts[0].values[1].locations[0].row, 9);
  assert.equal(result?.message, "Conflict");
});

import { fromCoreImportDiagnostic } from './coreImportContract.ts';
import { fromCoreProjectImportPreview } from './adviceImportContract.ts';
test('diagnostics preserve empty raw values and typed advice meanings', () => {
 const d=fromCoreImportDiagnostic({severity:'error',code:'advice-profile-required',count:1,node_ids:[],location:null,fallback_message:'Choose profile',
 advice:{field:'header',value:'',expected_unit:'millimetres',pile_sizes_mm:[250,290],column_count:4,required_profile:'capacity-columns'}});
 assert.deepEqual(d.advice,{field:'header',value:'',expectedUnit:'millimetres',pileSizesMm:[250,290],columnCount:4,requiredProfile:'capacity-columns'});
});
test('uncomputed totals do not become an asserted zero count', () => {
 const p={can_apply:false,unique_value_count:0,imported_value_count:0,exact_duplicate_count:0,orphan_value_count:0,conflicts:[],diagnostics:[]};
 assert.equal(fromCoreProjectImportPreview(p).countsAvailable,false);
 assert.equal(fromCoreProjectImportPreview({...p,counts_available:true}).countsAvailable,true);
});
