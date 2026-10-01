import { test } from "node:test";
import assert from "node:assert/strict";
import type { PilePlanData } from "../../../core/projectFile.ts";
import type { IlpSolution } from "../../../core/ilpOptimizationTypes.ts";
import { applyIlpSolutionToPlan, canSkipUnsolvableIlpTargets, enableSkippingUnsolvableTargets } from "./ilpResultApplication.ts";
import { readFileSync } from "node:fs";
import { createInitialProjectState } from "../../project/projectState.ts";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../../core/projectTestSupport.ts";
const a={pile_size_mm:300,pile_tip_level_mm:-10000}, b={pile_size_mm:400,pile_tip_level_mm:-11000};
test("ILP patches only targets, preserving locks and excluded/outside assignments", () => {
  const plan: PilePlanData={id:"p",name:"P",activePileSizes:[300],activePileTipLevelMms:[-10000],
    selectedPileConfigurationsByLoadPoint:new Map([[1,a],[2,a],[3,a]]),lockedLoadPointIds:[3],
    externalReferencesByLoadPoint:new Map([[1,["ref1"]],[2,["ref2"]]]),
    optimizationUnassignedByLoadPoint:new Map([[1,"configuration_limits"],[2,"configuration_limits"]])};
  const solution: IlpSolution={assignments:[{load_point_id:1,configuration:b}],cost:12,budget:12,
    reference:{cost:12,proof:"optimal",termination:"completed"},counts:{tip_levels:1,pile_sizes:1,configurations:1},
    transitions:{tip_only:0,size_only:0,both:0},score_milli:0,proof:"optimal",termination:"completed"};
  const after=applyIlpSolutionToPlan(plan,solution);
  assert.notEqual(after,plan); assert.deepEqual(plan.selectedPileConfigurationsByLoadPoint.get(1),a);
  assert.deepEqual(after.selectedPileConfigurationsByLoadPoint.get(1),b);
  assert.deepEqual(after.selectedPileConfigurationsByLoadPoint.get(2),a);
  assert.deepEqual(after.lockedLoadPointIds,[3]);
  assert.equal(after.externalReferencesByLoadPoint.has(1),false);
  assert.deepEqual(after.externalReferencesByLoadPoint.get(2),["ref2"]);
  assert.equal(after.optimizationUnassignedByLoadPoint.has(1),false);
  assert.equal(after.optimizationUnassignedByLoadPoint.has(2),true);
});
test("enabling skip from a blocked result preserves target scope, selection and assignments", () => {
  const project=canonicalProjectForTest(readFileSync("../../sample_project/sample_project.ifcpp","utf8"));
  for(const scope of ["all","selected"] as const) {
    const state=createInitialProjectState(project,{initializeDefaultPiles:false},projectTipLevelKeysForTest(project));
    state.ilpOptimizationTargetScope=scope;state.selectedLoadPointIds=[1,2,3];state.selectedLoadPointId=2;
    const outcome={status:"blocked" as const,diagnostics:[{code:"insufficient_capacity",load_point_ids:[2],blocking:true}],solvable_load_point_ids:[1,3]};
    assert.equal(canSkipUnsolvableIlpTargets(outcome),true);
    const next=enableSkippingUnsolvableTargets(state,outcome);
    assert.equal(next.ilpOptimizationSettings.skip_unsolvable_units,true);
    assert.equal(next.ilpOptimizationTargetScope,scope);
    assert.equal(next.selectedLoadPointIds,state.selectedLoadPointIds);
    assert.equal(next.selectedLoadPointId,2);
    assert.equal(next.pilePlans,state.pilePlans);
    assert.equal(next.selectedPileConfigurationsByLoadPoint,state.selectedPileConfigurationsByLoadPoint);
    assert.equal(state.ilpOptimizationSettings.skip_unsolvable_units,false);
    const invalid={status:"blocked" as const,diagnostics:[{code:"missing_relevant_cost",load_point_ids:[2],blocking:true}],solvable_load_point_ids:[]};
    assert.equal(canSkipUnsolvableIlpTargets(invalid),false);
    assert.equal(enableSkippingUnsolvableTargets(state,invalid),state);
  }
});
