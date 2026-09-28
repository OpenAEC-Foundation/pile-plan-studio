import { applyLoadPointGroupEditCore, evaluateCptSettingsEditCore,
  evaluateLoadPointGroupingSettingsCore, evaluatePileCostCatalogEditCore,
  type CostCatalogAction, type CptSettingsPatch } from "../../core/coreClient.ts";
import { applyValidatedCptSettingsEdit } from "../../domain/cpt-selection/cptSettingsModel.ts";
import type { PileCostSettingsItem } from "../../core/projectTypes.ts";
import { McpReadError } from "./readModel.ts";
import { requireCurrentGroups } from "./projectSettingsSources.ts";
import type { McpSnapshot, PileMcpWriteToolName } from "./protocol.ts";
import type { PreparedMcpWrite } from "./writeModel.ts";

function cptPatch(raw: Record<string, unknown>): CptSettingsPatch {
  return {
    ...(raw.algorithm !== undefined ? { algorithm: raw.algorithm as CptSettingsPatch["algorithm"] } : {}),
    ...(raw.max_distance_m !== undefined ? { maxDistanceM: raw.max_distance_m as number } : {}),
    ...(raw.monopoly_distance_m !== undefined ? { monopolyDistanceM: raw.monopoly_distance_m as number } : {}),
    ...(raw.max_angle_degrees !== undefined ? { maxAngleDegrees: raw.max_angle_degrees as number } : {}),
  };
}

export async function prepareSettingsWrite(
  snapshot: McpSnapshot, name: PileMcpWriteToolName, args: Record<string, unknown>,
): Promise<PreparedMcpWrite> {
  const { state } = snapshot;
  if (name === "pile_set_cpt_selection_settings" || name === "pile_set_cpt_selection_settings_bulk") {
    if (state.cptSelectionEditDraft) throw new McpReadError("editing_in_progress");
    const global = name === "pile_set_cpt_selection_settings";
    const changes = global ? [] : (args.changes as Array<Record<string, unknown>>).map((entry) => ({
      load_point_id: entry.load_point_id as number,
      settings: cptPatch(entry.settings as Record<string, unknown>),
      overwrite_manual_selections: entry.overwrite_manual_selections as boolean | undefined,
    }));
    const result = await evaluateCptSettingsEditCore({
      loadPointIds: state.loadPoints.map((point) => point.id),
      globalSettings: state.globalCptSelectionSettings,
      settingsByLoadPoint: state.cptSelectionSettingsByLoadPoint,
      manualCptIdsByLoadPoint: state.manualCptIdsByLoadPoint,
      ...(global ? { globalPatch: cptPatch(args.settings as Record<string, unknown>),
        overwriteManualSelections: args.overwrite_manual_selections as boolean | undefined } : { changes }),
    });
    if (result.status === "blocked") throw new McpReadError(result.reason, result.ids);
    return { mode: "history", changed: result.changed,
      data: { scope: global ? "project" : "load_points", submitted_count: global ? state.loadPoints.length : changes.length,
        changed_count: result.changedLoadPointIds.length, changed_load_point_ids: result.changedLoadPointIds,
        changed: result.changed, analysis_requested: result.changed },
      update: (current) => applyValidatedCptSettingsEdit(current, result) };
  }

  if (name === "pile_set_grouping_settings") {
    const result = await evaluateLoadPointGroupingSettingsCore({
      loadPoints: state.loadPoints, settings: state.loadPointGroupingSettings,
      automatic: args.automatic as boolean | undefined,
      maxEdgeDistanceM: args.max_edge_distance_m as number | undefined,
    });
    if (result.status === "blocked") throw new McpReadError(result.reason);
    return { mode: "history", changed: result.changed,
      data: { changed: result.changed, effective_group_count: result.grouping.groups.length,
        group_assessment_status: result.changed ? "pending" : "unchanged" },
      update: (current) => result.changed ? { ...current, loadPointGroupingSettings: result.settings } : current };
  }

  if (name === "pile_reset_group_overrides") {
    requireCurrentGroups(snapshot.groups);
    if (state.loadPointGroupingSettings.manualGroups.length === 0
      && state.loadPointGroupingSettings.ungroupedGroups.length === 0) {
      return { mode: "history", changed: false,
        data: { changed: false, cleared_manual_count: 0, cleared_separated_count: 0 }, update: (current) => current };
    }
    const result = await applyLoadPointGroupEditCore({ loadPoints: state.loadPoints,
      settings: state.loadPointGroupingSettings, selectedLoadPointIds: [], action: "reset_overrides" });
    if (result.status === "blocked") throw new McpReadError(result.reason);
    return { mode: "history", changed: true,
      data: { changed: true, cleared_manual_count: state.loadPointGroupingSettings.manualGroups.length,
        cleared_separated_count: state.loadPointGroupingSettings.ungroupedGroups.length,
        group_assessment_status: "pending" },
      update: (current) => ({ ...current, loadPointGroupingSettings: result.settings }) };
  }

  let actions: CostCatalogAction[];
  if (name === "pile_add_cost_item") actions = [{ action: "add", item: args.item as PileCostSettingsItem }];
  else if (name === "pile_update_cost_item") actions = [{ action: "update", pile_size_mm: args.pile_size_mm as number,
    ...(args.shape !== undefined ? { shape: args.shape as "round" | "square" } : {}),
    ...(args.cost_per_m3 !== undefined ? { cost_per_m3: args.cost_per_m3 as number } : {}) }];
  else if (name === "pile_remove_cost_item") actions = [{ action: "remove", pile_size_mm: args.pile_size_mm as number }];
  else if (name === "pile_edit_cost_catalog_bulk") actions = args.actions as CostCatalogAction[];
  else throw new McpReadError("unknown_tool");
  const result = await evaluatePileCostCatalogEditCore({ settings: state.pileCostSettings,
    usedPileSizesMm: [...new Set(state.bearingCapacities.map((row) => row.pile_size_mm))], actions });
  if (result.status === "blocked") throw new McpReadError(result.reason,
    result.pile_size_mm === null ? undefined : [result.pile_size_mm]);
  return { mode: "history", changed: result.changed,
    data: { submitted_count: actions.length, changed_count: result.changed_sizes_mm.length,
      changed_pile_sizes_mm: result.changed_sizes_mm, changed: result.changed },
    update: (current) => result.changed ? { ...current, pileCostSettings: result.settings } : current };
}
