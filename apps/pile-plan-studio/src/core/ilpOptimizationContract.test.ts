import {test} from "node:test";
import assert from "node:assert/strict";
import {ilpRequestForTest,ilpSolvedForTest} from "./ilpOptimizationTestSupport.ts";
import {toBrowserIlpOptimizationRequest,toDesktopIlpOptimizationRequest,ilpOptimizationOutcomeFromCore} from "./ilpOptimizationContract.ts";
test("ILP native and browser transports preserve the same immutable engineering request",()=>{
  const r=ilpRequestForTest(),copy=structuredClone(r);
  const browser=toBrowserIlpOptimizationRequest(r),native=toDesktopIlpOptimizationRequest(r);
  assert.deepEqual({...browser,input:{...browser.input,options_by_load_point:Object.fromEntries(browser.input.options_by_load_point),current_assignments:Object.fromEntries(browser.input.current_assignments)}},native);
  browser.input.load_points[0].name="changed";browser.input.settings.transition_weights.tip_only_milli=123;
  assert.deepEqual(r,copy);
});
test("ILP contract rejects partial or numerically invalid successful outcomes",()=>{
  assert.deepEqual(ilpOptimizationOutcomeFromCore(ilpSolvedForTest),ilpSolvedForTest);
  for (const patch of [{cost:23},{cost:NaN},{proof:"unknown"},{assignments:[{}]},{score_milli:Number.MAX_SAFE_INTEGER+1}]) {
    assert.equal(ilpOptimizationOutcomeFromCore({...ilpSolvedForTest,solution:{...ilpSolvedForTest.solution,...patch}}).status,"failed");
  }
  assert.deepEqual(ilpOptimizationOutcomeFromCore({status:"infeasible",diagnostics:[],proposal:null}),{status:"infeasible",diagnostics:[],proposal:null});
});

test("new optimization requests omit the historical joint weight without mutating input",()=>{
  const request=ilpRequestForTest();
  request.input.settings.transition_weights.both_milli=500;
  for(const convert of [toBrowserIlpOptimizationRequest,toDesktopIlpOptimizationRequest]) {
    assert.equal(convert(request).input.settings.transition_weights.both_milli,undefined);
  }
  assert.equal(request.input.settings.transition_weights.both_milli,500);
});


test("cap metadata rejects duplicate members, invalid counts and unassigned cap choices",()=>{
 if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
 const cap={load_point_ids:[1,2],pile_count:3,quarter_turns:0,configuration:{pile_size_mm:320,pile_tip_level_mm:-18500}};
 const result={...ilpSolvedForTest,solution:{...ilpSolvedForTest.solution,assignments:[1,2].map(load_point_id=>({load_point_id,configuration:cap.configuration})),pile_cap_proposals:[cap]}};
 assert.equal(ilpOptimizationOutcomeFromCore(result).status,"solved");
 for (const count of [7,12,20]) assert.equal(ilpOptimizationOutcomeFromCore({...result,solution:{...result.solution,pile_cap_proposals:[{...cap,pile_count:count}]}}).status,"solved");
 for(const bad of [{...cap,pile_count:21},{...cap,load_point_ids:[1,1]},{...cap,quarter_turns:4},{...cap,configuration:null},{...cap,load_point_ids:[999]},{...cap,configuration:{...cap.configuration,pile_size_mm:450}}]){
  assert.deepEqual(ilpOptimizationOutcomeFromCore({...result,solution:{...result.solution,pile_cap_proposals:[bad]}}),{status:"failed",code:"invalid_contract"});
 }
});


test("new pile-count transition facts are preserved and malformed counts are rejected",()=>{
 if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
 const solution={...ilpSolvedForTest.solution,transitions:{...ilpSolvedForTest.solution.transitions,pile_count:2},score_milli:2500};
 const parsed=ilpOptimizationOutcomeFromCore({...ilpSolvedForTest,solution});
 assert.equal(parsed.status,"solved");if(parsed.status==="solved")assert.equal(parsed.solution.transitions.pile_count,2);
 for(const count of [-1,0.5,NaN])assert.deepEqual(ilpOptimizationOutcomeFromCore({...ilpSolvedForTest,solution:{...solution,transitions:{...solution.transitions,pile_count:count}}}),{status:"failed",code:"invalid_contract"});
});
