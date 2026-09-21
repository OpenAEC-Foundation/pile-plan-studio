import loadHighs from "highs";
import {createHighsBrowserSolver} from "./highsBrowserSolver.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initSync, WasmIlpSession } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { ilpOptimizationOutcomeFromCore } from "./ilpOptimizationContract.ts";
import type { IlpProgress } from "./ilpOptimizationTypes.ts";
import {ilpRequestForTest} from "./ilpOptimizationTestSupport.ts";
import {toBrowserIlpOptimizationRequest} from "./ilpOptimizationContract.ts";
initSync({module:readFileSync(new URL("./wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm",import.meta.url))});

const solveHighs=createHighsBrowserSolver(await loadHighs());
function createSession(){
  const raw=new WasmIlpSession();
  return {run:(request:unknown,progress:(p:IlpProgress)=>void,solver:Function=solveHighs)=>raw.run(request,progress,solver),free:()=>raw.free()};
}

test("WASM rejects a failing supplied solver instead of using a hidden fallback backend",()=>{
  const session=createSession();
  let invoked=false;
  try {
    const result=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(ilpRequestForTest()),()=>{},()=>{invoked=true;throw new Error("solver failed");}));
    assert.equal(invoked,true);
    assert.deepEqual(result,{status:"failed",code:"solver_error"});
  } finally {session.free();}
});

test("WASM gives HiGHS a complete warm start and reuses the cost reference",()=>{
  const session=createSession();
  const request=toBrowserIlpOptimizationRequest(ilpRequestForTest());
  request.input.settings.budget_basis_points=0;
  let references=0,starts=0;
  const solver:typeof solveHighs=(model,seconds,progress)=>{
    if(model.initial_solution){
      starts++;assert.equal(model.initial_solution.length,model.col_cost.length);
      assert.ok(model.initial_solution.every(Number.isFinite));
    }else references++;
    return solveHighs(model,seconds,progress);
  };
  try{
    for(let i=0;i<2;i++){
      const result=ilpOptimizationOutcomeFromCore(session.run(request,()=>{},solver));
      assert.equal(result.status,"solved");
      if(result.status==="solved")assert.equal(result.solution.proof,"optimal");
    }
    assert.equal(references,1);assert.equal(starts,2);
  }finally{session.free();}
});

test("WASM rejects malformed final assignments and malformed live candidates",()=>{
  for(const live of [false,true]){
    const session=createSession();
    try{
      const solver:typeof solveHighs=(model,seconds,progress)=>{
        if(live)progress({incumbent_objective:0,best_bound:0,relative_gap:0,values:[NaN]});
        return live?solveHighs(model,seconds,progress):{status:"solved",values:[],optimal:true};
      };
      const result=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(ilpRequestForTest()),()=>{},solver));
      assert.deepEqual(result,{status:"failed",code:"invalid_solver_assignment"});
    }finally{session.free();}
  }
});

test("release WASM skips empty candidate domains only when requested",()=>{
  const session=createSession();
  try {
    const request=ilpRequestForTest();
    request.input.settings.candidate_source="active_legend";
    request.input.candidateConfigurations=[{pile_size_mm:1000,pile_tip_level_mm:-10000}];
    assert.equal(ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(request),()=>{})).status,"blocked");
    request.input.settings.skip_unsolvable_units=true;
    const outcome=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(request),()=>{}));
    assert.equal(outcome.status,"solved");
    if(outcome.status==="solved") {
      assert.deepEqual(outcome.solution.assignments.map(a=>a.load_point_id),[1]);
      assert.ok(outcome.diagnostics.some(d=>d.code==="skipped_unsolvable_units" && d.load_point_ids[0]===2));
    }
  } finally {session.free();}
});

test("release WASM transports local-mode snapshots as valid stop-and-use plans",()=>{
  const session=createSession();
  const snapshots:IlpProgress[]=[];
  try {
    const outcome=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest({...ilpRequestForTest(),localOnly:true}),p=>snapshots.push(p)));
    assert.equal(outcome.status,"solved");
    if(outcome.status==="solved") assert.equal(outcome.solution.termination,"completed");
    const best=snapshots.find(p=>p.best_solution)?.best_solution;
    assert.ok(best);assert.equal(typeof best.score_milli,"number");
    assert.equal(ilpOptimizationOutcomeFromCore({status:"solved",solution:best,diagnostics:[]}).status,"solved");
    assert.ok(snapshots.every(p=>!("choices" in p)));
  } finally {session.free();}
});
test("release WASM skips spatial solving for cost-only mode and zero weights",()=>{
  const request=JSON.parse(readFileSync("../../tests/fixtures/ilp-contract/request.json","utf8"));
  request.input.options_by_load_point=new Map(Object.entries(request.input.options_by_load_point).map(([id,options])=>[Number(id),options]));
  request.input.current_assignments=new Map();
  const session=createSession();
  try {
    for(const coherence of [false,true]) {
      request.input.settings.optimize_coherence=coherence;
      if(coherence) request.input.settings.transition_weights={tip_only_milli:0,size_only_milli:0};
      const phases:string[]=[];
      const outcome=ilpOptimizationOutcomeFromCore(session.run(request,(p:IlpProgress)=>phases.push(p.phase)));
      assert.equal(outcome.status,"solved");
      if(outcome.status==="solved") {
        assert.equal(outcome.solution.cost,21);
        assert.equal(outcome.solution.budget,coherence?22:21);
        assert.equal(outcome.solution.proof,"optimal");
      }
      assert.equal(phases.includes("spatial"),false);
    }
  } finally {session.free();}
});
test("release WASM solves the shared native contract with five percent budget",()=>{
  const request=JSON.parse(readFileSync("../../tests/fixtures/ilp-contract/request.json","utf8"));
  request.input.options_by_load_point=new Map(Object.entries(request.input.options_by_load_point).map(([id,options])=>[Number(id),options]));
  request.input.current_assignments=new Map();
  const session=createSession();
  try {
    const outcome=ilpOptimizationOutcomeFromCore(session.run(request,()=>undefined));
    assert.equal(outcome.status,"solved");
    if(outcome.status==="solved") {
      assert.equal(outcome.solution.reference.cost,21); assert.equal(outcome.solution.budget,22);
      assert.equal(outcome.solution.cost,22); assert.equal(outcome.solution.score_milli,0);
      assert.equal(outcome.solution.proof,"optimal");
    }
    request.time_limit_ms=0;
    assert.equal(ilpOptimizationOutcomeFromCore(session.run(request,()=>undefined)).status,"no_solution");
  } finally {session.free();}
});

test("release WASM enforces custom candidates and refreshes the cost reference when they change",()=>{
  const session=createSession();
  try {
    const request=ilpRequestForTest();
    request.input.settings.candidate_source="custom";
    request.input.settings.custom_configurations=[{pile_size_mm:1000,pile_tip_level_mm:-11000}];
    const result=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(request),()=>{}));
    assert.equal(result.status,"solved");
    if(result.status==="solved") {
      assert.ok(result.solution.assignments.every(a=>a.configuration.pile_tip_level_mm===-11000));
      assert.equal(result.solution.reference.cost,22);
    }
    request.input.settings.custom_configurations=[];
    assert.equal(ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(request),()=>{})).status,"blocked");
    request.input.settings.candidate_source="all_available";
    const unrestricted=ilpOptimizationOutcomeFromCore(session.run(toBrowserIlpOptimizationRequest(request),()=>{}));
    assert.equal(unrestricted.status,"solved");
    if(unrestricted.status==="solved")assert.equal(unrestricted.solution.reference.cost,21);
  } finally {session.free();}
});
