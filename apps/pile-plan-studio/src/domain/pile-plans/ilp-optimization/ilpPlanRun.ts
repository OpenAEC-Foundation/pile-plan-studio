import type {ProjectState} from "../../project/projectState.ts";
import type {PilePlanData} from "../../../core/projectFile.ts";
import type {IlpOptimizationOutcome,IlpSolution} from "../../../core/ilpOptimizationTypes.ts";
import {createOptimizationPilePlan,synchronizeActivePilePlan} from "../pilePlanManagement.ts";
import {applyIlpSolutionToPlan} from "./ilpResultApplication.ts";

// A stable content fingerprint is presentation metadata, not an engineering decision.
// Sort object keys and map entries so saving/reloading or switching plans cannot stale a result.
const canonicalCache=new WeakMap<object,unknown>();
function canonical(value:unknown):unknown {
  if(!value || typeof value!=="object")return value;
  const cached=canonicalCache.get(value);if(cached!==undefined)return cached;
  const normalized=normalizeCanonical(value);canonicalCache.set(value,normalized);return normalized;
}
function normalizeCanonical(value:object):unknown {
  if(value instanceof Map)return [...value].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canonical(v)]);
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
function fingerprint(value:unknown):string {
  const text=JSON.stringify(canonical(value));let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
  return `v1:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
function basis(state:ProjectState,plan:PilePlanData) {
  return {loadPoints:state.loadPoints,cpts:state.cpts,bearingCapacities:state.bearingCapacities,
    globalCptSelectionSettings:state.globalCptSelectionSettings,cptSelectionSettingsByLoadPoint:state.cptSelectionSettingsByLoadPoint,
    manualCptIdsByLoadPoint:state.manualCptIdsByLoadPoint,loadPointGroupingSettings:state.loadPointGroupingSettings,
    pileCostSettings:state.pileCostSettings,pileHeadLevelM:state.pileHeadLevelM,currencyCode:state.currencyCode,
    assignments:plan.selectedPileConfigurationsByLoadPoint};
}
function currentSource(state:ProjectState,id:string) {
  const plan=state.pilePlans.find(p=>p.id===id);
  return plan && (state.activePilePlanId===id?{...plan,selectedPileConfigurationsByLoadPoint:state.selectedPileConfigurationsByLoadPoint}:plan);
}
function runFingerprint(state:ProjectState,plan:PilePlanData) {
  return fingerprint({basis:basis(state,plan),name:plan.name,references:plan.externalReferencesByLoadPoint,unassigned:plan.optimizationUnassignedByLoadPoint,locked:plan.lockedLoadPointIds,sizes:plan.activePileSizes,tips:plan.activePileTipLevelMms,
    settings:state.ilpOptimizationSettings,scope:state.ilpOptimizationLimitScope,boundary:state.ilpIncludeBoundaryTransitions});
}
export function createIlpPlanRun(state:ProjectState,language:"nl"|"en",localOnly:boolean,newPlanName?:string) {
  const source=currentSource(state,state.activePilePlanId)!;
  const transition=state.ilpOptimizationCreatesPilePlan?createOptimizationPilePlan({...state,
    optimizedChoices:source.selectedPileConfigurationsByLoadPoint,resolvedCandidateConfigurations:[...source.selectedPileConfigurationsByLoadPoint.values()],
    optimizationUnassignedByLoadPoint:source.optimizationUnassignedByLoadPoint,language}):null;
  const generated=transition?transition.pilePlans.find(p=>p.id===transition.activePilePlanId)!:source;
  const target=transition && newPlanName?.trim()?{...generated,name:newPlanName.trim()}:generated;
  const settings=structuredClone(state.ilpOptimizationSettings);
  delete settings.transition_weights.both_milli;
  return {sourceId:source.id,target,fingerprint:runFingerprint(state,source),settings,
    wholePlanLimits:state.ilpOptimizationLimitScope==="whole-plan",boundaryTransitions:state.ilpIncludeBoundaryTransitions,localOnly,currencyCode:state.currencyCode};
}
export type IlpPlanRun=ReturnType<typeof createIlpPlanRun>;
export function isIlpPlanRunCurrent(state:ProjectState,run:IlpPlanRun) {
  if(run.target.id!==run.sourceId && state.pilePlans.some(p=>p.id===run.target.id))return false;
  const source=currentSource(state,run.sourceId);
  return !!source && !state.cptSelectionEditDraft && !state.loadPointLockDraft && runFingerprint(state,source)===run.fingerprint;
}
export function isIlpResultStale(state:ProjectState,plan:PilePlanData) {
  return !!plan.ilpResult && fingerprint(basis(state,plan))!==plan.ilpResult.basis_fingerprint;
}
function installPlan(state:ProjectState,plan:PilePlanData,viewTarget:boolean):ProjectState {
  const plans=synchronizeActivePilePlan(state.pilePlans,state.activePilePlanId,state.selectedPileConfigurationsByLoadPoint);
  const pilePlans=plans.some(p=>p.id===plan.id)?plans.map(p=>p.id===plan.id?plan:p):[...plans,plan];
  const activePilePlanId=viewTarget?plan.id:state.activePilePlanId;
  return {...state,pilePlans,activePilePlanId,selectedPileConfigurationsByLoadPoint:activePilePlanId===plan.id?plan.selectedPileConfigurationsByLoadPoint:state.selectedPileConfigurationsByLoadPoint};
}
export function displayIlpPlanRun(state:ProjectState,run:IlpPlanRun,solution:IlpSolution,viewTarget:boolean) {
  return installPlan(state,applyIlpSolutionToPlan(run.target,solution),viewTarget);
}
export function completeIlpPlanRun(state:ProjectState,run:IlpPlanRun,outcome:Extract<IlpOptimizationOutcome,{status:"solved"}>,viewTarget:boolean) {
  if(!isIlpPlanRunCurrent(state,run))return state;
  const plan=applyIlpSolutionToPlan(run.target,outcome.solution);
  plan.ilpResult={solution:outcome.solution,diagnostics:outcome.diagnostics,settings:run.settings,
    whole_plan_limits:run.wholePlanLimits,boundary_transitions:run.boundaryTransitions,local_only:run.localOnly,
    currency_code:run.currencyCode,basis_fingerprint:fingerprint(basis(state,plan))};
  return installPlan(state,plan,viewTarget);
}
