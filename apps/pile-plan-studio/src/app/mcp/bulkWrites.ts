import {
  applyLoadPointGroupAssignmentBatchCore, applyLoadPointGroupUngroupBatchCore,
  validateManualCptSelectionBatchCore, validateLoadPointLockBatchCore,
} from "../../core/coreClient.ts";
import type {
  LoadPointGroupAssignmentBatchInput, LoadPointGroupUngroupBatchInput,
} from "../../core/loadPointGroupContract.ts";
import { samePileConfiguration } from "../../core/pileConfigurationKey.ts";
import { applyManualCptSelectionUpdates } from "../../domain/cpt-selection/cptSettingsModel.ts";
import { applyLoadPointLockDraft, getActiveLockedLoadPointIds } from "../../domain/pile-plans/loadPointLocking.ts";
import { synchronizeActivePilePlan } from "../../domain/pile-plans/pilePlanManagement.ts";
import { McpReadError, requireCompletedOptions } from "./readModel.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";
import type { WriteOperation, McpSnapshot } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

export type BulkWriteDependencies = {
  applyAssignmentBatch?: typeof applyLoadPointGroupAssignmentBatchCore;
  applyUngroupBatch?: typeof applyLoadPointGroupUngroupBatchCore;
  validateCptBatch?: typeof validateManualCptSelectionBatchCore;
  validateLockBatch?: typeof validateLoadPointLockBatchCore;
};

function activePlan(snapshot: McpSnapshot, id: unknown) {
  const plan = snapshot.state.pilePlans.find((item) => item.id === id);
  if (!plan) throw new McpReadError("unknown_id");
  if (plan.id !== snapshot.state.activePilePlanId) throw new McpReadError("plan_not_active");
  return plan;
}

export async function prepareBulkWrite(snapshot: McpSnapshot, operation: WriteOperation, dependencies: BulkWriteDependencies = {}): Promise<PreparedMcpWrite> {
  const { name, args } = operation;
  const { state } = snapshot;
  if (name === "pile_set_assignments_bulk") {
    const plan = activePlan(snapshot, args.plan_id);
    const groups = requireCurrentGroups(snapshot.groups);
    const changes = args.changes;
    const known = new Set(state.loadPoints.map((point) => point.id));
    for (const change of changes) {
      if (!known.has(change.load_point_id)) throw new McpReadError("unknown_id");
      if (change.configuration) {
        const options = requireCompletedOptions(state, change.load_point_id, snapshot.analysisReady);
        if (!options.some((option) => samePileConfiguration(option.configuration, change.configuration!))) {
          throw new McpReadError("unknown_configuration");
        }
      }
    }
    const input: LoadPointGroupAssignmentBatchInput = {
      changes, groups, currentAssignments: state.selectedPileConfigurationsByLoadPoint,
      lockedLoadPointIds: getActiveLockedLoadPointIds(state.pilePlans, plan.id),
    };
    const result = await (dependencies.applyAssignmentBatch ?? applyLoadPointGroupAssignmentBatchCore)(input);
    if (result.status === "blocked") throw new McpReadError(result.reason, result.load_point_ids);
    const changed = result.changes.length > 0;
    return {
      mode: "history", changed,
      data: { plan_id: plan.id, submitted_count: changes.length, changed_count: result.changes.length,
        changed_load_point_ids: result.changes.map((item) => item.load_point_id), changed },
      update: (current) => {
        if (!changed) return current;
        const assignments = new Map(current.selectedPileConfigurationsByLoadPoint);
        for (const change of result.changes) {
          if (change.configuration) assignments.set(change.load_point_id, { ...change.configuration });
          else assignments.delete(change.load_point_id);
        }
        return { ...current, selectedPileConfigurationsByLoadPoint: assignments,
          pilePlans: synchronizeActivePilePlan(current.pilePlans, current.activePilePlanId, assignments) };
      },
    };
  }
  if (name === "pile_ungroup_load_points_bulk") {
    const groups = requireCurrentGroups(snapshot.groups);
    const ids = args.load_point_ids;
    const input: LoadPointGroupUngroupBatchInput = {
      loadPoints: state.loadPoints, settings: state.loadPointGroupingSettings, selectedLoadPointIds: ids,
    };
    const result = await (dependencies.applyUngroupBatch ?? applyLoadPointGroupUngroupBatchCore)(input);
    if (result.status === "blocked") throw new McpReadError(result.reason, result.load_point_ids);
    const changed = JSON.stringify(result.settings) !== JSON.stringify(state.loadPointGroupingSettings);
    const selected = new Set(ids);
    const affectedIds = changed ? [...new Set(groups.filter((group) => group.load_point_ids.some((id) => selected.has(id)))
      .flatMap((group) => group.load_point_ids))].sort((left, right) => left - right) : [];
    return { mode: "history", changed,
      data: { submitted_count: ids.length, changed_count: affectedIds.length,
        submitted_load_point_ids: ids, changed_load_point_ids: affectedIds,
        changed, group_assessment_status: changed ? "pending" : "unchanged" },
      update: (current) => changed ? { ...current, loadPointGroupingSettings: result.settings } : current };
  }
  if (name === "pile_set_load_point_locks_bulk") {
    const plan = activePlan(snapshot, args.plan_id);
    const changes = args.changes;
    const result = await (dependencies.validateLockBatch ?? validateLoadPointLockBatchCore)({
      loadPointIds: state.loadPoints.map((point) => point.id), changes,
    });
    if (result.status === "blocked") throw new McpReadError(result.reason, result.ids);
    const draft = new Set(getActiveLockedLoadPointIds(state.pilePlans, plan.id));
    const changedIds: number[] = [];
    for (const change of result.changes) {
      if (draft.has(change.load_point_id) === change.locked) continue;
      changedIds.push(change.load_point_id);
      if (change.locked) draft.add(change.load_point_id);
      else draft.delete(change.load_point_id);
    }
    const changed = changedIds.length > 0;
    return { mode: "history", changed,
      data: { plan_id: plan.id, submitted_count: changes.length, changed_count: changedIds.length,
        changed_load_point_ids: changedIds, changed },
      update: (current) => {
        if (!changed) return current;
        const selectedLoadPointIds = current.selectedLoadPointIds.filter((id) => !draft.has(id));
        return { ...current, pilePlans: applyLoadPointLockDraft(current.pilePlans, plan.id, draft),
          selectedLoadPointIds,
          selectedLoadPointId: selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
            ? current.selectedLoadPointId : selectedLoadPointIds[0] ?? null,
          selectedCptId: null };
      } };
  }
  if (name === "pile_set_cpt_selections_bulk") {
    if (state.cptSelectionEditDraft) throw new McpReadError("editing_in_progress");
    const changes = args.changes;
    const result = await (dependencies.validateCptBatch ?? validateManualCptSelectionBatchCore)({
      loadPointIds: state.loadPoints.map((point) => point.id), cptIds: state.cpts.map((cpt) => cpt.id), changes,
    });
    if (result.status === "blocked") throw new McpReadError(result.reason, result.ids);
    const updates = new Map(result.changes.map((change) => [change.load_point_id, change.cpt_ids] as const));
    const next = applyManualCptSelectionUpdates(state, updates);
    const changed = next !== state;
    const changedIds = result.changes.filter((change) => {
      const previous = state.manualCptIdsByLoadPoint.get(change.load_point_id);
      return change.cpt_ids === null ? previous !== undefined
        : previous === undefined || JSON.stringify(previous) !== JSON.stringify(change.cpt_ids);
    }).map((change) => change.load_point_id);
    return { mode: "history", changed,
      data: { submitted_count: changes.length, changed_count: changedIds.length,
        changed_load_point_ids: changedIds, changed, analysis_requested: changed },
      update: (current) => changed ? applyManualCptSelectionUpdates(current, updates) : current };
  }
  throw new McpReadError("unknown_tool");
}
