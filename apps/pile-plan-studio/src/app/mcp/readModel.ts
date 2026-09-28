import type { PilePlanData } from "../../core/projectFile.ts";
import type { PileConfigurationOption } from "../../core/projectTypes.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";

export type ToolPayload = ProjectMarkerValue & { data: Record<string, any> };
export type PileToolName =
  | "pile_project_overview"
  | "pile_list_load_points"
  | "pile_get_load_point"
  | "pile_list_plans"
  | "pile_list_pile_options";

export class McpReadError extends Error {
  readonly code: string;
  readonly ids?: number[];

  constructor(code: string, ids?: number[]) {
    super(code);
    this.code = code;
    this.ids = ids;
  }
}

export function pageArgs(args: Record<string, unknown>): { limit: number; offset: number } {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  if (!Number.isInteger(limit) || !Number.isInteger(offset) || (limit as number) < 1
    || (limit as number) > 100 || (offset as number) < 0) throw new McpReadError("invalid_page");
  return { limit: limit as number, offset: offset as number };
}

export function page<T>(items: T[], args: Record<string, unknown>) {
  const { limit, offset } = pageArgs(args);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

export function requireNumberId(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new McpReadError("invalid_id");
  return value as number;
}

export function planForRead(state: ProjectState, args: Record<string, unknown>): PilePlanData {
  const id = args.plan_id ?? state.activePilePlanId;
  if (typeof id !== "string") throw new McpReadError("invalid_id");
  const plan = state.pilePlans.find((item) => item.id === id);
  if (!plan) throw new McpReadError("unknown_id");
  return plan;
}

export function assignmentsForPlan(state: ProjectState, plan: PilePlanData) {
  return plan.id === state.activePilePlanId
    ? state.selectedPileConfigurationsByLoadPoint
    : plan.selectedPileConfigurationsByLoadPoint;
}

export function requireCompletedOptions(state: ProjectState, id: number, analysisReady = true): PileConfigurationOption[] {
  if (state.analysisError) throw new McpReadError("analysis_failed");
  if (!analysisReady) throw new McpReadError("analysis_pending");
  const options = state.pileOptionsByLoadPointId.get(id);
  if (!options || !state.selectedCptsByLoadPointId.has(id)) throw new McpReadError("analysis_pending");
  return options;
}

export function readPileTool(
  state: ProjectState,
  marker: ProjectMarkerValue,
  name: PileToolName,
  rawArgs: unknown,
  analysisReady = true,
): ToolPayload {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  if (name === "pile_project_overview") {
    return { ...marker, data: {
      name: state.name,
      load_point_count: state.loadPoints.length,
      cpt_count: state.cpts.length,
      plan_count: state.pilePlans.length,
      active_plan_id: state.activePilePlanId,
      sources: state.inputSources.map(({ kind, status, itemCount, warnings }) => ({
        kind, status, item_count: itemCount, warning_count: warnings.length,
      })),
      analysis_status: state.analysisError ? "failed" : !analysisReady || state.pileOptionsByLoadPointId.size < state.loadPoints.length ? "pending" : "ready",
    } };
  }
  if (name === "pile_list_plans") {
    return { ...marker, data: page(state.pilePlans.map((plan) => ({
      id: plan.id, name: plan.name, active: plan.id === state.activePilePlanId,
      active_pile_sizes_mm: plan.activePileSizes,
      active_pile_tip_levels_mm: plan.activePileTipLevelMms,
      assignment_count: assignmentsForPlan(state, plan).size,
      lock_count: plan.lockedLoadPointIds.length,
    })).sort((a, b) => a.id.localeCompare(b.id)), args) };
  }
  const plan = planForRead(state, args);
  const assignments = assignmentsForPlan(state, plan);
  if (name === "pile_list_load_points") {
    return { ...marker, data: page(state.loadPoints.map((point) => ({
      id: point.id, name: point.name, x_mm: point.x_mm, y_mm: point.y_mm,
      design_load_kn: point.design_load_kn,
      assignment: assignments.get(point.id) ?? null,
      optimizer_unassigned_reason: plan.optimizationUnassignedByLoadPoint.get(point.id) ?? null,
    })).sort((a, b) => a.id - b.id), args) };
  }
  const id = requireNumberId(args.load_point_id);
  const point = state.loadPoints.find((item) => item.id === id);
  if (!point) throw new McpReadError("unknown_id");
  const options = requireCompletedOptions(state, id, analysisReady);
  if (name === "pile_list_pile_options") {
    return { ...marker, data: page([...options].sort((a, b) =>
      a.configuration.pile_size_mm - b.configuration.pile_size_mm
      || a.configuration.pile_tip_level_mm - b.configuration.pile_tip_level_mm), args) };
  }
  const assignment = assignments.get(id) ?? null;
  const assignedOption = assignment
    ? options.find((option) => option.configuration.pile_size_mm === assignment.pile_size_mm
      && option.configuration.pile_tip_level_mm === assignment.pile_tip_level_mm)
    : null;
  return { ...marker, data: {
    id: point.id, name: point.name, x_mm: point.x_mm, y_mm: point.y_mm,
    design_load_kn: point.design_load_kn,
    assignment,
    locked: plan.lockedLoadPointIds.includes(id),
    optimizer_unassigned_reason: plan.optimizationUnassignedByLoadPoint.get(id) ?? null,
    selected_cpts: state.selectedCptsByLoadPointId.get(id)!.map(({ cpt, distance_mm, quadrant }) => ({
      id: cpt.id, name: cpt.name, distance_mm, quadrant: quadrant ?? null,
    })),
    cpt_selection_override: state.cptSelectionSettingsByLoadPoint.get(id) ?? null,
    effective_cpt_selection_settings: state.cptSelectionSettingsByLoadPoint.get(id) ?? state.globalCptSelectionSettings,
    manual_cpt_ids: state.manualCptIdsByLoadPoint.get(id) ?? [],
    assigned_option: assignment ? assignedOption ?? { status: "option_unavailable" } : null,
  } };
}
