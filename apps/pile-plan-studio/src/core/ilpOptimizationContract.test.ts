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
