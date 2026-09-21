import { toCorePileOptionsByLoadPoint } from "./pileOptionAggregationContract.ts";
import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import type { IlpRunRequest, IlpOptimizationOutcome } from "./ilpOptimizationTypes.ts";

function requestBody(request: IlpRunRequest) {
  const i = structuredClone(request.input);
  delete i.settings.transition_weights.both_milli;
  return { run_id: request.runId, time_limit_ms: request.timeLimitMs, local_only: request.localOnly ?? false, input: {
    load_points: i.loadPoints, groups: i.groups, target_load_point_ids: i.targetLoadPointIds,
    locked_load_point_ids: i.lockedLoadPointIds, limit_scope: i.limitScope, pile_head_level_m: i.pileHeadLevelM,
    cost_settings: i.costSettings, candidate_configurations: i.candidateConfigurations, settings: i.settings,
    include_boundary_transitions: i.includeBoundaryTransitions,
  } };
}
export function toBrowserIlpOptimizationRequest(request: IlpRunRequest) {
  const base = requestBody(request);
  return { ...base, input: { ...base.input,
    options_by_load_point: toWasmNumberKeyedMap(toCorePileOptionsByLoadPoint(request.input.optionsByLoadPoint)),
    current_assignments: toWasmNumberKeyedMap(structuredClone(request.input.currentAssignments)),
  } };
}
export function toDesktopIlpOptimizationRequest(request: IlpRunRequest) {
  const base = requestBody(request);
  return { ...base, input: { ...base.input,
    options_by_load_point: toStringKeyedRecord(toCorePileOptionsByLoadPoint(request.input.optionsByLoadPoint)),
    current_assignments: toStringKeyedRecord(structuredClone(request.input.currentAssignments)),
  } };
}
export function ilpOptimizationOutcomeFromCore(value: unknown): IlpOptimizationOutcome {
  if (!isRecord(value) || !["solved","blocked","infeasible","no_solution","cancelled","failed"].includes(String(value.status))) {
    return { status: "failed", code: "invalid_contract" };
  }
  if (value.status === "solved") {
    const s = value.solution;
    if (!isRecord(s) || !Array.isArray(s.assignments) || !isRecord(s.reference)
      || !["optimal","feasible"].includes(String(s.proof)) || !["optimal","feasible"].includes(String(s.reference.proof))
      || !safe(s.cost) || !safe(s.budget) || !safe(s.score_milli) || !safe(s.reference.cost)
      || s.cost > s.budget || !validAssignments(s.assignments) || !validCounts(s.counts)
      || !isRecord(s.transitions) || ![s.transitions.tip_only,s.transitions.size_only,s.transitions.both].every(safe)
      || !["completed","time_limit","stopped"].includes(String(s.termination))
      || !["completed","time_limit"].includes(String(s.reference.termination))) return {status:"failed",code:"invalid_contract"};
  }
  if (["solved","blocked","infeasible"].includes(String(value.status))
    && (!Array.isArray(value.diagnostics) || !value.diagnostics.every(d => isRecord(d)
      && typeof d.code === "string" && typeof d.blocking === "boolean" && Array.isArray(d.load_point_ids) && d.load_point_ids.every(safe)))) return {status:"failed",code:"invalid_contract"};
  if (value.status === "blocked" && (!Array.isArray(value.solvable_load_point_ids) || !value.solvable_load_point_ids.every(safe))) return {status:"failed",code:"invalid_contract"};
  if (value.status === "no_solution" && (!["preparation","cost_reference","spatial","limit_diagnosis"].includes(String(value.phase))
    || !["completed","time_limit","stopped","cancelled","solver_error"].includes(String(value.termination)))) return {status:"failed",code:"invalid_contract"};
  if (value.status === "failed" && typeof value.code !== "string") return {status:"failed",code:"invalid_contract"};
  if (value.status === "infeasible" && value.proposal !== null) {
    const p=value.proposal;
    if (!isRecord(p) || !validCounts(p.required_limits) || !validCounts(p.increases)
      || typeof p.minimality_proven !== "boolean" || !validAssignments(p.witness)) return {status:"failed",code:"invalid_contract"};
  }
  return structuredClone(value) as IlpOptimizationOutcome;
}
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null; }
function safe(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function validCounts(v: unknown) { return isRecord(v) && [v.tip_levels,v.pile_sizes,v.configurations].every(safe); }
function validAssignments(v: unknown) { return Array.isArray(v) && v.every(a => isRecord(a) && safe(a.load_point_id)
  && isRecord(a.configuration) && safe(a.configuration.pile_size_mm) && Number.isSafeInteger(a.configuration.pile_tip_level_mm)); }
