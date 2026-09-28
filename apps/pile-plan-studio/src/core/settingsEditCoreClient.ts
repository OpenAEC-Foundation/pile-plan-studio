import initWasm, {
  evaluate_cpt_settings_edit,
  evaluate_load_point_grouping_settings,
  evaluate_pile_cost_catalog_edit,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";
import { derivedLoadPointGroupsFromCore, groupingSettingsFromCore, toDeriveLoadPointGroupsRequest,
  type DerivedLoadPointGroups } from "./loadPointGroupContract.ts";
import type { CptSelectionSettings, LoadPoint, LoadPointGroupingSettings, PileCostSettings,
  PileCostSettingsItem } from "./projectTypes.ts";

export type CptSettingsPatch = Partial<CptSelectionSettings>;
export type CptSettingsChange = { load_point_id: number; settings: CptSettingsPatch;
  overwrite_manual_selections?: boolean };
export type CptSettingsEditInput = {
  loadPointIds: number[];
  globalSettings: CptSelectionSettings;
  settingsByLoadPoint: Map<number, CptSelectionSettings>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
  globalPatch?: CptSettingsPatch;
  overwriteManualSelections?: boolean;
  changes?: CptSettingsChange[];
};
export type CptSettingsEditResult =
  | { status: "applied"; globalSettings: CptSelectionSettings;
    settingsByLoadPoint: Map<number, CptSelectionSettings>;
    manualCptIdsByLoadPoint: Map<number, number[]>;
    changedLoadPointIds: number[]; globalChanged: boolean; changed: boolean }
  | { status: "blocked"; reason: string; ids: number[] };

type CoreCptSettings = { algorithm: CptSelectionSettings["algorithm"];
  max_distance_m: number; monopoly_distance_m: number; max_angle_degrees: number };
type CoreCptResult =
  | { status: "applied"; global_settings: CoreCptSettings;
    settings_by_load_point: Array<{ load_point_id: number; settings: CoreCptSettings }>;
    manual_cpt_ids_by_load_point: Array<{ load_point_id: number; cpt_ids: number[] }>;
    changed_load_point_ids: number[]; global_changed: boolean; changed: boolean }
  | { status: "blocked"; reason: string; ids: number[] };

function toCoreSettings(settings: CptSelectionSettings): CoreCptSettings {
  return { algorithm: settings.algorithm, max_distance_m: settings.maxDistanceM,
    monopoly_distance_m: settings.monopolyDistanceM, max_angle_degrees: settings.maxAngleDegrees };
}
function fromCoreSettings(settings: CoreCptSettings): CptSelectionSettings {
  return { algorithm: settings.algorithm, maxDistanceM: settings.max_distance_m,
    monopolyDistanceM: settings.monopoly_distance_m, maxAngleDegrees: settings.max_angle_degrees };
}
function toCorePatch(patch: CptSettingsPatch) {
  return { ...(patch.algorithm !== undefined ? { algorithm: patch.algorithm } : {}),
    ...(patch.maxDistanceM !== undefined ? { max_distance_m: patch.maxDistanceM } : {}),
    ...(patch.monopolyDistanceM !== undefined ? { monopoly_distance_m: patch.monopolyDistanceM } : {}),
    ...(patch.maxAngleDegrees !== undefined ? { max_angle_degrees: patch.maxAngleDegrees } : {}) };
}

export async function evaluateCptSettingsEditCore(input: CptSettingsEditInput): Promise<CptSettingsEditResult> {
  const request = {
    load_point_ids: input.loadPointIds,
    global_settings: toCoreSettings(input.globalSettings),
    settings_by_load_point: [...input.settingsByLoadPoint].map(([load_point_id, settings]) =>
      ({ load_point_id, settings: toCoreSettings(settings) })),
    manual_cpt_ids_by_load_point: [...input.manualCptIdsByLoadPoint].map(([load_point_id, cpt_ids]) =>
      ({ load_point_id, cpt_ids })),
    global_patch: input.globalPatch ? toCorePatch(input.globalPatch) : null,
    overwrite_manual_selections: input.overwriteManualSelections ?? false,
    changes: (input.changes ?? []).map((change) => ({ load_point_id: change.load_point_id,
      settings: toCorePatch(change.settings), overwrite_manual_selections: change.overwrite_manual_selections ?? false })),
  };
  let result: CoreCptResult;
  if (isTauriRuntime()) result = await invokeDesktop<CoreCptResult>("evaluate_cpt_settings_edit", { request });
  else {
    await initializeWasm(() => initWasm());
    result = evaluate_cpt_settings_edit(request) as CoreCptResult;
  }
  if (result.status === "blocked") return result;
  return { status: "applied", globalSettings: fromCoreSettings(result.global_settings),
    settingsByLoadPoint: new Map(result.settings_by_load_point.map(({ load_point_id, settings }) =>
      [load_point_id, fromCoreSettings(settings)])),
    manualCptIdsByLoadPoint: new Map(result.manual_cpt_ids_by_load_point.map(({ load_point_id, cpt_ids }) =>
      [load_point_id, cpt_ids])),
    changedLoadPointIds: result.changed_load_point_ids, globalChanged: result.global_changed, changed: result.changed };
}

export type GroupingSettingsEditResult =
  | { status: "applied"; settings: LoadPointGroupingSettings; grouping: DerivedLoadPointGroups; changed: boolean }
  | { status: "blocked"; reason: string };

export async function evaluateLoadPointGroupingSettingsCore(input: {
  loadPoints: LoadPoint[]; settings: LoadPointGroupingSettings;
  automatic?: boolean; maxEdgeDistanceM?: number;
}): Promise<GroupingSettingsEditResult> {
  const request = { ...toDeriveLoadPointGroupsRequest(input.loadPoints, input.settings),
    automatic: input.automatic ?? null,
    max_edge_distance_mm: input.maxEdgeDistanceM === undefined ? null : input.maxEdgeDistanceM * 1_000 };
  type CoreResult = { status: "applied"; settings: Parameters<typeof groupingSettingsFromCore>[0];
    grouping: Parameters<typeof derivedLoadPointGroupsFromCore>[0]; changed: boolean }
    | { status: "blocked"; reason: string };
  let result: CoreResult;
  if (isTauriRuntime()) result = await invokeDesktop<CoreResult>("evaluate_load_point_grouping_settings", { request });
  else {
    await initializeWasm(() => initWasm());
    result = evaluate_load_point_grouping_settings(request) as CoreResult;
  }
  return result.status === "blocked" ? result : { status: "applied",
    settings: groupingSettingsFromCore(result.settings),
    grouping: derivedLoadPointGroupsFromCore(result.grouping), changed: result.changed };
}

export type CostCatalogAction =
  | { action: "add"; item: PileCostSettingsItem }
  | { action: "update"; pile_size_mm: number; shape?: "round" | "square"; cost_per_m3?: number }
  | { action: "remove"; pile_size_mm: number };
export type CostCatalogEditResult =
  | { status: "applied"; settings: PileCostSettings; changed_sizes_mm: number[]; changed: boolean }
  | { status: "blocked"; reason: string; pile_size_mm: number | null; action_index: number };

export async function evaluatePileCostCatalogEditCore(input: {
  settings: PileCostSettings; usedPileSizesMm: number[]; actions: CostCatalogAction[];
}): Promise<CostCatalogEditResult> {
  const request = { settings: input.settings, used_pile_sizes_mm: input.usedPileSizesMm, actions: input.actions };
  if (isTauriRuntime()) return invokeDesktop<CostCatalogEditResult>("evaluate_pile_cost_catalog_edit", { request });
  await initializeWasm(() => initWasm());
  return evaluate_pile_cost_catalog_edit(request) as CostCatalogEditResult;
}
