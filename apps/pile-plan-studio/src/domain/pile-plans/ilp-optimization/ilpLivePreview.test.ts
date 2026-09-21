import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "../../project/projectState.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../../core/projectTestSupport.ts";
import { createManagedProjectState, projectHistoryReducer } from "../../project/history/projectHistoryReducer.ts";
import { captureProjectContent } from "../../project/projectContent.ts";
import { ilpSolvedForTest } from "../../../core/ilpOptimizationTestSupport.ts";
import { applyIlpSolutionToState } from "./ilpResultApplication.ts";
import { createIlpLivePreview, applyIlpPreviewInteraction } from "./ilpLivePreview.ts";

function fixture(newPlan:boolean) {
  const project=canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp","utf8"));
  const state=createInitialProjectState(project,{initializeDefaultPiles:false},projectTipLevelKeysForTest(project));
  state.ilpOptimizationCreatesPilePlan=newPlan;
  state.selectedLoadPointIds=state.loadPoints.slice(0,2).map(p=>p.id);
  if(ilpSolvedForTest.status!=="solved")throw new Error("fixture");
  const solution={...ilpSolvedForTest.solution,assignments:state.selectedLoadPointIds.map(load_point_id=>({load_point_id,configuration:{pile_size_mm:320,pile_tip_level_mm:-18000}}))};
  return {state,solution};
}

for(const newPlan of [true,false])test(`preview ${newPlan?"new":"current"} plan stays temporary; completion records one undo step`,()=>{
  const {state,solution}=fixture(newPlan);
  let managed=createManagedProjectState(state);
  const before=captureProjectContent(managed.present);
  const first=createIlpLivePreview(state,solution,"nl");
  const better={...solution,score_milli:0,assignments:solution.assignments.map(a=>({...a,configuration:{pile_size_mm:400,pile_tip_level_mm:-19000}}))};
  const second=createIlpLivePreview(state,better,"nl");
  assert.equal(first.activePilePlanId,second.activePilePlanId);
  assert.equal(second.pilePlans.length,state.pilePlans.length+(newPlan?1:0));
  assert.equal(second.selectedPileConfigurationsByLoadPoint.get(state.selectedLoadPointIds[0])?.pile_size_mm,400);
  assert.deepEqual(captureProjectContent(managed.present),before);
  assert.equal(managed.history.past.length,0);
  const displayed={...state,...second};
  const panned=applyIlpPreviewInteraction(state,displayed,{...displayed,viewport:{...state.viewport,scale:2}});
  assert.ok(panned);assert.equal(panned.viewport.scale,2);
  assert.equal(panned.pilePlans,state.pilePlans);
  assert.equal(panned.selectedPileConfigurationsByLoadPoint,state.selectedPileConfigurationsByLoadPoint);
  managed=projectHistoryReducer(managed,{type:"runtime",update:panned});
  managed=projectHistoryReducer(managed,{type:"commit",update:now=>applyIlpSolutionToState(now,better,"nl")});
  assert.equal(managed.history.past.length,1);
  assert.equal(managed.present.activePilePlanId,second.activePilePlanId);
  managed=projectHistoryReducer(managed,{type:"undo"});
  assert.deepEqual(captureProjectContent(managed.present),before);
  assert.equal(managed.present.viewport.scale,2);
  assert.deepEqual(managed.present.selectedLoadPointIds,state.selectedLoadPointIds);
  managed=projectHistoryReducer(managed,{type:"redo"});
  assert.equal(managed.present.selectedPileConfigurationsByLoadPoint.get(state.selectedLoadPointIds[0])?.pile_size_mm,400);
});

test("preview interactions cannot save a temporary plan or overwrite its assignments",()=>{
  const {state,solution}=fixture(true);const shown={...state,...createIlpLivePreview(state,solution,"nl")};
  assert.equal(applyIlpPreviewInteraction(state,shown,{...shown,pilePlans:[...shown.pilePlans]}),null);
  assert.equal(applyIlpPreviewInteraction(state,shown,{...shown,selectedPileConfigurationsByLoadPoint:new Map()}),null);
  const selected=applyIlpPreviewInteraction(state,shown,{...shown,selectedLoadPointIds:[]});
  assert.ok(selected);assert.equal(selected.activePilePlanId,state.activePilePlanId);
  assert.deepEqual(selected.selectedLoadPointIds,[]);
});
