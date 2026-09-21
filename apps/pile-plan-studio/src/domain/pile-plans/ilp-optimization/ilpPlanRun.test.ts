import {initSync,read_project_document,write_project_document} from "../../../core/wasm/pile-plan-wasm/pile_plan_wasm.js";
import {projectDocumentOutcomeFromCore,toBrowserProjectDocumentDraft} from "../../../core/projectDocumentContract.ts";
import {createManagedProjectState,projectHistoryReducer} from "../../project/history/projectHistoryReducer.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createInitialProjectState} from "../../project/projectState.ts";
import {ilpSolvedForTest} from "../../../core/ilpOptimizationTestSupport.ts";
import {duplicatePilePlan,switchPilePlan} from "../pilePlanManagement.ts";
import {captureProjectContent,projectDocumentDraftFromContent} from "../../project/projectContent.ts";
import {createIlpPlanRun,isIlpPlanRunCurrent,displayIlpPlanRun,completeIlpPlanRun,isIlpResultStale} from "./ilpPlanRun.ts";

initSync({module:readFileSync(new URL("../../../core/wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm",import.meta.url))});

function fixture(newPlan:boolean) {
  const wire=projectDocumentOutcomeFromCore({status:"valid",...read_project_document({contents:readFileSync("../../sample_project/sample_project.ifcpp","utf8")})});
  if(wire.status!=="valid")throw new Error("fixture");
  let state=createInitialProjectState(wire.project,{initializeDefaultPiles:false},wire.keys);
  state={...state,...duplicatePilePlan({...state,sourcePilePlanId:state.activePilePlanId,language:"nl"})};
  state.ilpOptimizationCreatesPilePlan=newPlan;
  if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
  const outcome={...ilpSolvedForTest,solution:{...ilpSolvedForTest.solution,assignments:[{load_point_id:state.loadPoints[0].id,configuration:{pile_size_mm:320,pile_tip_level_mm:-18000}}]}};
  return {state,outcome};
}

for(const newPlan of [true,false])test(`background optimization (${newPlan?"new":"existing"} plan) preserves the viewed plan`,()=>{
  const {state,outcome}=fixture(newPlan),run=createIlpPlanRun(state,"nl",false);
  const other=state.pilePlans[0].id;
  const browsing={...state,...switchPilePlan({...state,targetPilePlanId:other})};
  assert.equal(isIlpPlanRunCurrent(browsing,run),true);
  const preview=displayIlpPlanRun(browsing,run,outcome.solution,false);
  assert.equal(preview.activePilePlanId,other);
  assert.deepEqual(preview.selectedPileConfigurationsByLoadPoint,browsing.selectedPileConfigurationsByLoadPoint);
  assert.equal(preview.pilePlans.find(p=>p.id===run.target.id)?.selectedPileConfigurationsByLoadPoint.get(state.loadPoints[0].id)?.pile_size_mm,320);
  assert.equal(displayIlpPlanRun(browsing,run,outcome.solution,true).activePilePlanId,run.target.id);
  const finished=completeIlpPlanRun(browsing,run,outcome,false);
  assert.equal(finished.activePilePlanId,other);
  assert.deepEqual(finished.selectedPileConfigurationsByLoadPoint,browsing.selectedPileConfigurationsByLoadPoint);
  const target=finished.pilePlans.find(p=>p.id===run.target.id)!;
  assert.equal(target.ilpResult?.solution.score_milli,outcome.solution.score_milli);
  assert.equal(isIlpResultStale(finished,target),false);
  assert.equal(finished.pilePlans[0].ilpResult,undefined);
  assert.equal(isIlpPlanRunCurrent({...browsing,pileHeadLevelM:123},run),false);
  const changed={...target,selectedPileConfigurationsByLoadPoint:new Map(target.selectedPileConfigurationsByLoadPoint)};
  changed.selectedPileConfigurationsByLoadPoint.delete(state.loadPoints[0].id);
  assert.equal(isIlpResultStale(finished,changed),true);
  assert.equal(isIlpResultStale({...finished,ilpOptimizationSettings:{...finished.ilpOptimizationSettings,budget_basis_points:9999}},target),false);
});

test("saved optimization summary survives the project document roundtrip",()=>{
  const {state,outcome}=fixture(true),run=createIlpPlanRun(state,"nl",true);
  const finished=completeIlpPlanRun(state,run,outcome,true);
  const contents=write_project_document({draft:toBrowserProjectDocumentDraft(projectDocumentDraftFromContent(captureProjectContent(finished),finished.activePilePlanId))});
  const wire=projectDocumentOutcomeFromCore({status:"valid",...read_project_document({contents})});
  assert.equal(wire.status,"valid");if(wire.status!=="valid")return;
  const loaded=createInitialProjectState(wire.project,{initializeDefaultPiles:false},wire.keys);
  const target=loaded.pilePlans.find(p=>p.id===run.target.id)!;
  assert.deepEqual(target.ilpResult,finished.pilePlans.find(p=>p.id===run.target.id)!.ilpResult);
  assert.equal(isIlpResultStale(loaded,target),false);
});

test("background completion and saved summary share one undo step",()=>{
  const {state,outcome}=fixture(true),run=createIlpPlanRun(state,"nl",false);
  const other=state.pilePlans[0].id;
  const browsing={...state,...switchPilePlan({...state,targetPilePlanId:other})};
  let managed=createManagedProjectState(browsing);
  managed=projectHistoryReducer(managed,{type:"commit",update:now=>completeIlpPlanRun(now,run,outcome,false)});
  assert.equal(managed.history.past.length,1);
  assert.ok(managed.present.pilePlans.find(p=>p.id===run.target.id)?.ilpResult);
  managed=projectHistoryReducer(managed,{type:"undo"});
  assert.equal(managed.present.pilePlans.some(p=>p.id===run.target.id),false);
  managed=projectHistoryReducer(managed,{type:"redo"});
  assert.equal(managed.present.pilePlans.find(p=>p.id===run.target.id)?.ilpResult?.solution.score_milli,outcome.solution.score_milli);
});

test("editing or deleting the source rejects a late result even while another plan is viewed",()=>{
  const {state,outcome}=fixture(true),run=createIlpPlanRun(state,"nl",false);
  const browsing={...state,...switchPilePlan({...state,targetPilePlanId:state.pilePlans[0].id})};
  for(const changed of [
    {...browsing,pilePlans:browsing.pilePlans.filter(p=>p.id!==run.sourceId)},
    {...browsing,pilePlans:browsing.pilePlans.map(p=>p.id===run.sourceId?{...p,selectedPileConfigurationsByLoadPoint:new Map([[state.loadPoints[0].id,{pile_size_mm:400,pile_tip_level_mm:-20000}]])}:p)},
  ]) {
    assert.equal(isIlpPlanRunCurrent(changed,run),false);
    assert.equal(completeIlpPlanRun(changed,run,outcome,false),changed);
  }
});

test("restoring a plan with the reserved destination ID cannot overwrite it",()=>{
  const {state,outcome}=fixture(true),run=createIlpPlanRun(state,"nl",false);
  const restored={...state,pilePlans:[...state.pilePlans,{...run.target,name:"Restored plan"}]};
  assert.equal(isIlpPlanRunCurrent(restored,run),false);
  assert.equal(completeIlpPlanRun(restored,run,outcome,false),restored);
});

test("a custom new-plan name stays identical in preview and the saved result",()=>{
  const {state,outcome}=fixture(true);
  const run=createIlpPlanRun(state,"en",false,"  Courtyard  ");
  assert.equal(run.target.name,"Courtyard");
  const preview=displayIlpPlanRun(state,run,outcome.solution,true);
  const finished=completeIlpPlanRun(state,run,outcome,true);
  assert.equal(preview.pilePlans.find(p=>p.id===run.target.id)?.name,"Courtyard");
  assert.equal(finished.pilePlans.find(p=>p.id===run.target.id)?.name,"Courtyard");
  const existing=fixture(false).state;
  assert.equal(createIlpPlanRun(existing,"en",false,"Ignored").target.name,existing.pilePlans.find(p=>p.id===existing.activePilePlanId)?.name);
});

test("empty names use the next localized optimization name",()=>{
  for(const language of ["nl","en"] as const) {
    const {state,outcome}=fixture(true);
    const first=createIlpPlanRun(state,language,false,"  ");
    assert.equal(first.target.name,language==="nl"?"Optimalisatie 1":"Optimization 1");
    const finished=completeIlpPlanRun(state,first,outcome,true);
    assert.equal(createIlpPlanRun(finished,language,false).target.name,language==="nl"?"Optimalisatie 2":"Optimization 2");
  }
});
