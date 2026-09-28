import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { prepareOptimizationStart, requireMatchingRunId } from "./optimizationControls.ts";

const project=canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp","utf8"));
const state=createInitialProjectState(project,{initializeDefaultPiles:false},projectTipLevelKeysForTest(project));
const snapshot={state,marker:{project_instance_id:"test",project_revision:1},analysisReady:true,
  groups:{groups:[],topology:{load_point_ids:[],edges:[],faces:[]},pending:false,error:null}};
const plan_id=state.activePilePlanId;

describe("MCP optimization controls",()=>{
  it("distinguishes an omitted duration from explicit no limit",()=>{
    assert.equal(prepareOptimizationStart(snapshot,{plan_id},1800).timeLimitSeconds,1800);
    assert.equal(prepareOptimizationStart(snapshot,{plan_id,time_limit_seconds:null},1800).timeLimitSeconds,null);
    assert.deepEqual(prepareOptimizationStart(snapshot,{plan_id,target_load_point_ids:[state.loadPoints[0].id]},600).targetLoadPointIds,[state.loadPoints[0].id]);
  });
  it("rejects unsafe targets, destination and duration before starting",()=>{
    for(const args of [
      {plan_id:"other"},{plan_id,target_load_point_ids:[]},{plan_id,target_load_point_ids:[999999]},
      {plan_id,time_limit_seconds:0},{plan_id,time_limit_seconds:7201},
      {plan_id,create_new_plan:false,new_plan_name:"Unexpected"},
    ]) assert.throws(()=>prepareOptimizationStart(snapshot,args,600));
  });
  it("requires the exact running ID for stop and cancel",()=>{
    assert.doesNotThrow(()=>requireMatchingRunId("run-1","run-1"));
    assert.throws(()=>requireMatchingRunId("run-1","run-2"),/run_not_current/);
  });
  it("passes explicit run-scoped limits without editing project defaults",()=>{
    const options=prepareOptimizationStart(snapshot,{plan_id,limit_scope:"whole-plan",
      include_boundary_transitions:true},600);
    assert.equal(options.limitScope,"whole-plan");
    assert.equal(options.includeBoundaryTransitions,true);
    assert.throws(()=>prepareOptimizationStart(snapshot,{plan_id,limit_scope:"invalid"},600),/invalid_limit_scope/);
  });
});
