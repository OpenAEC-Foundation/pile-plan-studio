import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { assessLoadPointGroupAssignmentsCore } from "../../core/coreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { LoadPointGroupSnapshot } from "../derived-state/loadPointGroupController.ts";
import type { TechnicalAssignmentSnapshot } from "../derived-state/technicalAssignmentController.ts";
import type { GroupAssignmentAssessmentSnapshot } from "../derived-state/groupAssignmentAssessmentController.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import { projectDraftFromState } from "../project/projectLifecycleController.ts";
import { McpReadError, assignmentsForPlan, page, planForRead, requireNumberId, type ToolPayload } from "./readModel.ts";

export type ProjectSourceToolName =
  | "pile_get_project_settings"
  | "pile_list_cpts"
  | "pile_get_cpt_advice"
  | "pile_list_groups"
  | "pile_get_technical_assessment";

export type SourceSnapshot = {
  state: ProjectState;
  marker: ProjectMarkerValue;
  defaultOptimizationTimeLimitSeconds?: number | null;
  analysisReady?: boolean;
  groups: LoadPointGroupSnapshot;
  technicalAssignment?: TechnicalAssignmentSnapshot;
  groupAssignmentAssessment?: GroupAssignmentAssessmentSnapshot;
  assessGroupAssignments?: typeof assessLoadPointGroupAssignmentsCore;
};

export function requireCurrentGroups(snapshot: LoadPointGroupSnapshot): LoadPointGroup[] {
  if (snapshot.error) throw new McpReadError("groups_failed");
  if (snapshot.pending || snapshot.topology === null) throw new McpReadError("groups_pending");
  return snapshot.groups;
}

function sectionPage<T>(items: T[], args: Record<string, unknown>, prefix: string) {
  return page(items, { limit: args[`${prefix}_limit`], offset: args[`${prefix}_offset`] });
}

export async function readProjectSourceTool(
  snapshot: SourceSnapshot,
  name: ProjectSourceToolName,
  rawArgs: unknown,
): Promise<ToolPayload> {
  const { state, marker } = snapshot;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  if (name === "pile_get_project_settings") {
    const legendSettings = projectDraftFromState(state).settings.pile_legend;
    return { ...marker, data: {
      project_properties: { name: state.name, pile_head_level_m: state.pileHeadLevelM,
        currency_code: state.currencyCode },
      global_cpt_selection: state.globalCptSelectionSettings,
      grouping: {
        automatic: state.loadPointGroupingSettings.automatic,
        max_edge_distance_m: state.loadPointGroupingSettings.maxEdgeDistanceM,
        manual_groups: sectionPage(state.loadPointGroupingSettings.manualGroups, args, "manual_groups"),
        separated_groups: sectionPage(state.loadPointGroupingSettings.ungroupedGroups, args, "separated_groups"),
      },
      pile_head_level_m: state.pileHeadLevelM,
      currency_code: state.currencyCode,
      cost_catalog: sectionPage(state.pileCostSettings.items, args, "cost_catalog"),
      cost_schema_version: state.pileCostSettings.schema_version,
      legend: {
        active_pile_sizes_mm: state.pilePlans.find((plan) => plan.id === state.activePilePlanId)?.activePileSizes ?? [],
        active_pile_tip_levels_mm: state.pilePlans.find((plan) => plan.id === state.activePilePlanId)?.activePileTipLevelMms ?? [],
        show_tip_level_regions: state.showTipLevelRegions,
        settings: legendSettings,
      },
      optimization: {
        settings: {
          ...state.ilpOptimizationSettings,
          custom_configurations: undefined,
          custom_configurations_page: sectionPage(state.ilpOptimizationSettings.custom_configurations ?? [], args, "custom_configurations"),
        },
        run_controls: {
          transient: true,
          default_time_limit_seconds: snapshot.defaultOptimizationTimeLimitSeconds ?? null,
          target_scope: state.ilpOptimizationTargetScope,
          selected_target_ids: state.ilpOptimizationTargetScope === "selected"
            ? sectionPage(state.selectedLoadPointIds, args, "selected_target_ids") : null,
          limit_scope: state.ilpOptimizationLimitScope,
          include_boundary_transitions: state.ilpIncludeBoundaryTransitions,
          creates_pile_plan: state.ilpOptimizationCreatesPilePlan,
        },
      },
    } };
  }
  if (name === "pile_list_cpts") {
    return { ...marker, data: page(state.cpts.map((cpt) => ({
      id: cpt.id, name: cpt.name, x_mm: cpt.x_mm, y_mm: cpt.y_mm,
      advice_row_count: state.bearingCapacities.filter((row) => row.cpt_id === cpt.id).length,
    })).sort((a, b) => a.id - b.id), args) };
  }
  if (name === "pile_get_cpt_advice") {
    const id = requireNumberId(args.cpt_id);
    if (!state.cpts.some((cpt) => cpt.id === id)) throw new McpReadError("unknown_id");
    const rows = state.bearingCapacities.filter((row) => row.cpt_id === id)
      .sort((a, b) => a.pile_size_mm - b.pile_size_mm || a.pile_tip_level_mm - b.pile_tip_level_mm);
    return { ...marker, data: { cpt_id: id, ...page(rows, args) } };
  }
  const groups = requireCurrentGroups(snapshot.groups);
  if (name === "pile_list_groups") {
    return { ...marker, data: page(groups.map((group) => ({
      origin: group.origin ?? "automatic", load_point_ids: group.load_point_ids,
    })).sort((a, b) => (a.load_point_ids[0] ?? 0) - (b.load_point_ids[0] ?? 0)), args) };
  }
  const plan = planForRead(state, args);
  if (state.analysisError) throw new McpReadError("technical_failed");
  if (state.cptSelectionEditDraft || snapshot.analysisReady === false) throw new McpReadError("technical_pending");
  const technical = snapshot.technicalAssignment;
  if (!technical || technical.status === "idle" || technical.status === "loading") throw new McpReadError("technical_pending");
  if (technical.status === "error" || technical.status === "unavailable" || !technical.assessment) {
    throw new McpReadError("technical_failed");
  }
  let conflicts;
  if (plan.id === state.activePilePlanId) {
    const assessment = snapshot.groupAssignmentAssessment;
    if (!assessment || assessment.pending) throw new McpReadError("group_assessment_pending");
    if (assessment.error) throw new McpReadError("group_assessment_failed");
    conflicts = assessment.conflicts;
  } else {
    if (!snapshot.assessGroupAssignments) throw new McpReadError("group_assessment_pending");
    conflicts = await snapshot.assessGroupAssignments({
      groups, assignments: assignmentsForPlan(state, plan), lockedLoadPointIds: plan.lockedLoadPointIds,
    });
  }
  return { ...marker, data: {
    plan_id: plan.id,
    availability: technical.assessment.availability,
    issues: sectionPage(technical.assessment.issues, args, "issues"),
    group_conflicts: sectionPage(conflicts, args, "group_conflicts"),
  } };
}
