import type { OptimizationStartOptions } from "../optimization/optimizationRunOptions.ts";
import type { McpSnapshot } from "./protocol.ts";
import { McpReadError } from "./readModel.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";

export function prepareOptimizationStart(snapshot:McpSnapshot,args:Record<string,unknown>,preferenceSeconds:number|null):OptimizationStartOptions {
  const {state}=snapshot;
  if(args.plan_id!==state.activePilePlanId)throw new McpReadError("wrong_active_plan");
  if(!state.loadPoints.length || snapshot.analysisReady===false || state.analysisError
    || state.defaultPileSelectionPending || state.cptSelectionEditDraft || state.loadPointLockDraft)
    throw new McpReadError("optimization_not_ready");
  requireCurrentGroups(snapshot.groups);
  if(state.ilpOptimizationSettings.candidate_source==="custom"
    && !state.ilpOptimizationSettings.custom_configurations?.length)throw new McpReadError("optimization_not_ready");
  const ids=args.target_load_point_ids;
  if(ids!==undefined){
    const known=new Set(state.loadPoints.map(point=>point.id));
    if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length
      ||ids.some(id=>!Number.isInteger(id)||!known.has(id)))throw new McpReadError("invalid_target_load_point_ids");
  }
  const seconds=Object.prototype.hasOwnProperty.call(args,"time_limit_seconds")?args.time_limit_seconds:preferenceSeconds;
  if(seconds!==null && (!Number.isInteger(seconds)||(seconds as number)<1||(seconds as number)>7200))
    throw new McpReadError("invalid_time_limit");
  const createNewPlan=args.create_new_plan===undefined?true:args.create_new_plan===true;
  const name=args.new_plan_name;
  if(name!==undefined && (typeof name!=="string"||!name.trim()||name.trim().length>120||!createNewPlan))
    throw new McpReadError("invalid_name");
  if(args.limit_scope!==undefined && args.limit_scope!=="target" && args.limit_scope!=="whole-plan")
    throw new McpReadError("invalid_limit_scope");
  return {targetLoadPointIds:ids as number[]|undefined,timeLimitSeconds:seconds as number|null,
    localOnly:args.local_only===true,createNewPlan,newPlanName:typeof name==="string"?name.trim():undefined,
    limitScope:args.limit_scope as OptimizationStartOptions["limitScope"],
    includeBoundaryTransitions:args.include_boundary_transitions as boolean|undefined};
}

export function requireMatchingRunId(requested:unknown,current:string|null):void {
  if(typeof requested!=="string"||!requested||requested!==current)throw new McpReadError("run_not_current");
}
