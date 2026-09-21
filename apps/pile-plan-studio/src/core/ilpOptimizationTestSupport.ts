import fixture from "../../../../tests/fixtures/ilp-contract/request.json" with {type:"json"};
import type { toDesktopIlpOptimizationRequest } from "./ilpOptimizationContract.ts";
import type { IlpRunRequest, IlpOptimizationOutcome } from "./ilpOptimizationTypes.ts";
export function ilpRequestForTest(): IlpRunRequest {
  const r={local_only:false,...structuredClone(fixture)} as ReturnType<typeof toDesktopIlpOptimizationRequest>;
  const i=r.input;
  return {runId:r.run_id,timeLimitMs:r.time_limit_ms,input:{loadPoints:i.load_points,groups:i.groups,
    optionsByLoadPoint:new Map(Object.entries(i.options_by_load_point).map(([id,opts])=>[Number(id),opts.map(({is_option,technical_status,...o})=>({...o,isOption:is_option,technicalStatus:technical_status}))])),
    currentAssignments:new Map(Object.entries(i.current_assignments).map(([id,c])=>[Number(id),c])),
    targetLoadPointIds:i.target_load_point_ids,lockedLoadPointIds:i.locked_load_point_ids,candidateConfigurations:i.candidate_configurations,
    costSettings:i.cost_settings,pileHeadLevelM:i.pile_head_level_m,settings:i.settings,limitScope:i.limit_scope,includeBoundaryTransitions:i.include_boundary_transitions}};
}
export const ilpSolvedForTest:IlpOptimizationOutcome={status:"solved",diagnostics:[],solution:{
  assignments:[1,2].map(load_point_id=>({load_point_id,configuration:{pile_size_mm:1000,pile_tip_level_mm:-11000}})),
  cost:22,budget:22,reference:{cost:21,proof:"optimal",termination:"completed"},counts:{tip_levels:1,pile_sizes:1,configurations:1},
  transitions:{tip_only:0,size_only:0,both:0},score_milli:0,proof:"optimal",termination:"completed",
}};
