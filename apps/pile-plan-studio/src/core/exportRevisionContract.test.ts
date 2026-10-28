import {test} from "node:test";
import assert from "node:assert/strict";
import {toConfiguredExportRequest, DEFAULT_EXPORT_OPTIONS} from "./exportRevisionContract.ts";
import type {PilePlanExportInput} from "./projectTypes.ts";

const input:PilePlanExportInput={loadPoints:[],selectedPiles:new Map([[7,{pile_size_mm:290,pile_tip_level_mm:-19500}]]),selectedCpts:new Map([[7,[61]]]),pileShapes:new Map([[290,"square"]]),pileSizeFormat:"dimensions"};
test("configured export keeps numeric map keys for WASM and complete optional rules",()=>{
    const request=toConfiguredExportRequest(input,DEFAULT_EXPORT_OPTIONS,false);
    assert.deepEqual(request.plan.selected_piles,new Map([[7,{pile_size_mm:290,pile_tip_level_mm:-19500}]]));
    assert.equal(request.export_options.tip_code.direction,"descending");
    assert.equal(request.export_options.mark.enabled,false);
    assert.equal(request.plan.pile_size_format,"dimensions");
});
test("desktop export serializes map keys as JSON records without altering source maps",()=>{
    const options={...DEFAULT_EXPORT_OPTIONS,tip_code:{enabled:true,sequence:"numbers" as const,direction:"ascending" as const}};
    const request=toConfiguredExportRequest(input,options,true);
    assert.deepEqual(request.plan.selected_cpts,{"7":[61]});
    assert.deepEqual(request.plan.pile_shapes,{"290":"square"});
    assert.deepEqual(request.export_options.tip_code,{enabled:true,sequence:"numbers",direction:"ascending"});
    assert.equal(input.selectedPiles.size,1);
});
