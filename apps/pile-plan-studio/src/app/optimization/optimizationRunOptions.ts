import type { ProjectState } from "../../domain/project/projectState.ts";
import type { OptimizationLimitScope } from "../../core/projectTypes.ts";

export type OptimizationStartOptions = {
  targetLoadPointIds?: number[];
  timeLimitSeconds: number | null;
  localOnly: boolean;
  createNewPlan?: boolean;
  newPlanName?: string;
  limitScope?: OptimizationLimitScope;
  includeBoundaryTransitions?: boolean;
};

export type ResolvedOptimizationRunOptions = {
  targetLoadPointIds: number[];
  timeLimitMs: number | null;
  createNewPlan: boolean;
  newPlanName?: string;
  limitScope: OptimizationLimitScope;
  includeBoundaryTransitions: boolean;
};

export function resolveOptimizationRunOptions(state: ProjectState, options: OptimizationStartOptions): ResolvedOptimizationRunOptions {
  const ids = options.targetLoadPointIds ?? state.loadPoints.map(point => point.id);
  const known = new Set(state.loadPoints.map(point => point.id));
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !Number.isInteger(id) || !known.has(id))) {
    throw new Error("invalid_target_load_point_ids");
  }
  const seconds = options.timeLimitSeconds;
  if (seconds !== null && (!Number.isInteger(seconds) || seconds < 1 || seconds > 7200)) throw new Error("invalid_time_limit");
  return {
    targetLoadPointIds: [...ids], timeLimitMs: seconds === null ? null : seconds * 1000,
    createNewPlan: options.createNewPlan ?? true,
    newPlanName: options.newPlanName?.trim(),
    limitScope: options.limitScope ?? state.ilpOptimizationLimitScope,
    includeBoundaryTransitions: options.includeBoundaryTransitions ?? state.ilpIncludeBoundaryTransitions,
  };
}
