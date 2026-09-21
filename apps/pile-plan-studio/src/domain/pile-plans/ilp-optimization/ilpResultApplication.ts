import type { PilePlanData } from "../../../core/projectFile.ts";
import type { IlpSolution, IlpOptimizationOutcome } from "../../../core/ilpOptimizationTypes.ts";
import { samePileConfiguration } from "../../../core/pileConfigurationKey.ts";
import type { ProjectState } from "../../project/projectState.ts";
import { createOptimizationPilePlan } from "../pilePlanManagement.ts";

export function applyIlpSolutionToState(now: ProjectState, solution: IlpSolution, language: "nl" | "en"): ProjectState {
  const active = now.pilePlans.find(p => p.id === now.activePilePlanId);
  if (!active) return now;
  const patched = applyIlpSolutionToPlan({ ...active, selectedPileConfigurationsByLoadPoint: now.selectedPileConfigurationsByLoadPoint }, solution);
  const transition = now.ilpOptimizationCreatesPilePlan
    ? createOptimizationPilePlan({ ...now, optimizedChoices: patched.selectedPileConfigurationsByLoadPoint,
      resolvedCandidateConfigurations: [...patched.selectedPileConfigurationsByLoadPoint.values()],
      optimizationUnassignedByLoadPoint: patched.optimizationUnassignedByLoadPoint, language })
    : { pilePlans: now.pilePlans.map(p => p.id === active.id ? patched : p),
      selectedPileConfigurationsByLoadPoint: patched.selectedPileConfigurationsByLoadPoint };
  // Selection belongs to the workspace and survives creating/updating a pile plan.
  return { ...now, ...transition, selectedLoadPointIds: now.selectedLoadPointIds, selectedLoadPointId: now.selectedLoadPointId };
}
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
