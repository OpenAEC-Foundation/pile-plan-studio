import type { PilePlanData } from "../../../core/projectFile.ts";
import type { IlpSolution, IlpOptimizationOutcome } from "../../../core/ilpOptimizationTypes.ts";
import { samePileConfiguration } from "../../../core/pileConfigurationKey.ts";
import type { ProjectState } from "../../project/projectState.ts";

export function applyIlpSolutionToPlan(plan: PilePlanData, solution: IlpSolution): PilePlanData {
  const selectedPileConfigurationsByLoadPoint=new Map(plan.selectedPileConfigurationsByLoadPoint);
  const externalReferencesByLoadPoint=new Map(plan.externalReferencesByLoadPoint);
  const optimizationUnassignedByLoadPoint=new Map(plan.optimizationUnassignedByLoadPoint);
  for (const {load_point_id,configuration} of solution.assignments) {
    if (!samePileConfiguration(selectedPileConfigurationsByLoadPoint.get(load_point_id),configuration)) externalReferencesByLoadPoint.delete(load_point_id);
    selectedPileConfigurationsByLoadPoint.set(load_point_id,{...configuration});
    optimizationUnassignedByLoadPoint.delete(load_point_id);
  }
  return {...plan,selectedPileConfigurationsByLoadPoint,externalReferencesByLoadPoint,optimizationUnassignedByLoadPoint,
    activePileSizes:[...new Set([...plan.activePileSizes,...solution.assignments.map(a=>a.configuration.pile_size_mm)])].sort((a,b)=>a-b),
    activePileTipLevelMms:[...new Set([...plan.activePileTipLevelMms,...solution.assignments.map(a=>a.configuration.pile_tip_level_mm)])].sort((a,b)=>b-a)};
}
export function canSkipUnsolvableIlpTargets(outcome: IlpOptimizationOutcome): boolean {
  return outcome.status==="blocked" && outcome.solvable_load_point_ids.length>0;
}
export function enableSkippingUnsolvableTargets(now: ProjectState, outcome: IlpOptimizationOutcome): ProjectState {
  if (!canSkipUnsolvableIlpTargets(outcome) || now.ilpOptimizationSettings.skip_unsolvable_units) return now;
  return {...now,ilpOptimizationSettings:{...now.ilpOptimizationSettings,skip_unsolvable_units:true}};
}
