import { applyLoadPointGroupAssignmentCore, applyLoadPointGroupEditCore } from "../../core/coreClient.ts";
import { samePileConfiguration } from "../../core/pileConfigurationKey.ts";
import type { PileConfigurationKey } from "../../core/projectTypes.ts";
import { getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";
import { duplicatePilePlan, renamePilePlan, synchronizeActivePilePlan, type PilePlanLanguage } from "../../domain/pile-plans/pilePlanManagement.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { McpReadError, requireCompletedOptions } from "./readModel.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";
import { preparePlanWrite } from "./planWrites.ts";
import { prepareCptWrite } from "./cptWrites.ts";
import { prepareGroupWrite } from "./groupWrites.ts";
import { prepareBulkWrite, type BulkWriteDependencies } from "./bulkWrites.ts";
import { prepareSettingsWrite } from "./settingsWrites.ts";
import { prepareProjectEditWrite } from "./projectEdits.ts";
import type { McpSnapshot, PileMcpWriteToolName } from "./protocol.ts";

export type PreparedMcpWrite = {
  mode?: "history" | "navigation";
  changed: boolean;
  data: Record<string, unknown>;
  update: (current: ProjectState) => ProjectState;
};

type McpWriteDependencies = BulkWriteDependencies & {
  applyAssignment?: typeof applyLoadPointGroupAssignmentCore;
  applyGroupEdit?: typeof applyLoadPointGroupEditCore;
  language?: PilePlanLanguage;
};

function requirePlan(snapshot: McpSnapshot, id: unknown) {
  const plan = snapshot.state.pilePlans.find((item) => item.id === id);
  if (!plan) throw new McpReadError("unknown_id");
  return plan;
}

export async function prepareMcpWrite(
  snapshot: McpSnapshot,
  name: PileMcpWriteToolName,
  args: Record<string, unknown>,
  dependencies: McpWriteDependencies = {},
): Promise<PreparedMcpWrite> {
  if (name === "pile_set_optimization_settings" || name === "pile_set_active_configurations"
    || name === "pile_set_legend_settings" || name === "pile_set_project_properties"
    || name === "pile_edit_load_points_bulk" || name === "pile_edit_cpts_bulk"
    || name === "pile_edit_foundation_advice_bulk") {
    return prepareProjectEditWrite(snapshot, name, args);
  }
  if (name === "pile_set_cpt_selection_settings" || name === "pile_set_cpt_selection_settings_bulk"
    || name === "pile_set_grouping_settings" || name === "pile_reset_group_overrides"
    || name === "pile_add_cost_item" || name === "pile_update_cost_item"
    || name === "pile_remove_cost_item" || name === "pile_edit_cost_catalog_bulk") {
    return prepareSettingsWrite(snapshot, name, args);
  }
  if (name === "pile_set_assignments_bulk" || name === "pile_set_load_point_locks_bulk"
    || name === "pile_set_cpt_selections_bulk" || name === "pile_ungroup_load_points_bulk") {
    return prepareBulkWrite(snapshot, name, args, dependencies);
  }
  if (name === "pile_activate_plan" || name === "pile_delete_plan" || name === "pile_set_load_point_lock") {
    return preparePlanWrite(snapshot, name, args);
  }
  if (name === "pile_set_manual_cpts" || name === "pile_use_automatic_cpts") {
    return prepareCptWrite(snapshot, name, args);
  }
  if (name === "pile_group_load_points" || name === "pile_ungroup_load_points") {
    return prepareGroupWrite(snapshot, name, args, dependencies.applyGroupEdit);
  }
  const { state } = snapshot;
  const plan = requirePlan(snapshot, args.plan_id);
  if (name === "pile_rename_plan") {
    const nextName = (args.name as string).trim();
    if (!nextName || nextName.length > 120) throw new McpReadError("invalid_name");
    const changed = plan.name !== nextName;
    return {
      changed,
      data: { plan_id: plan.id, name: nextName, changed },
      update: (current) => changed ? {
        ...current,
        pilePlans: renamePilePlan(synchronizeActivePilePlan(current.pilePlans, current.activePilePlanId,
          current.selectedPileConfigurationsByLoadPoint), plan.id, nextName),
      } : current,
    };
  }
  if (name === "pile_duplicate_plan") {
    const transition = duplicatePilePlan({
      ...state, sourcePilePlanId: plan.id, language: dependencies.language ?? "nl",
    });
    return {
      changed: true,
      data: { plan_id: transition.activePilePlanId, name: transition.pilePlans[transition.pilePlans.length - 1].name, source_plan_id: plan.id, changed: true },
      update: (current) => ({ ...current, ...duplicatePilePlan({
        ...current, sourcePilePlanId: plan.id, language: dependencies.language ?? "nl",
      }) }),
    };
  }
  if (plan.id !== state.activePilePlanId) throw new McpReadError("plan_not_active");
  const loadPointId = args.load_point_id as number;
  if (!state.loadPoints.some((point) => point.id === loadPointId)) throw new McpReadError("unknown_id");
  const groups = requireCurrentGroups(snapshot.groups);
  const requestedConfiguration: PileConfigurationKey | null = name === "pile_assign_configuration"
    ? { pile_size_mm: args.pile_size_mm as number, pile_tip_level_mm: args.pile_tip_level_mm as number }
    : null;
  if (requestedConfiguration) {
    const options = requireCompletedOptions(state, loadPointId, snapshot.analysisReady);
    if (!options.some((option) => samePileConfiguration(option.configuration, requestedConfiguration))) {
      throw new McpReadError("unknown_configuration");
    }
  }
  const applyAssignment = dependencies.applyAssignment ?? applyLoadPointGroupAssignmentCore;
  const result = await applyAssignment({
    selectedLoadPointIds: [loadPointId], groups,
    requestedConfiguration, currentAssignments: state.selectedPileConfigurationsByLoadPoint,
    lockedLoadPointIds: getActiveLockedLoadPointIds(state.pilePlans, plan.id),
  });
  if (result.status === "blocked") throw new McpReadError("locked_load_points");
  const changes = result.changes;
  return {
    changed: changes.length > 0,
    data: { plan_id: plan.id, changed: changes.length > 0, changed_load_point_ids: changes.map((change) => change.load_point_id) },
    update: (current) => {
      if (changes.length === 0) return current;
      const nextAssignments = new Map(current.selectedPileConfigurationsByLoadPoint);
      for (const change of changes) {
        if (change.configuration) nextAssignments.set(change.load_point_id, { ...change.configuration });
        else nextAssignments.delete(change.load_point_id);
      }
      return {
        ...current,
        selectedPileConfigurationsByLoadPoint: nextAssignments,
        pilePlans: synchronizeActivePilePlan(current.pilePlans, current.activePilePlanId, nextAssignments),
      };
    },
  };
}
