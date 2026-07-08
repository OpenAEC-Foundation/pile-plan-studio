import { invoke } from "@tauri-apps/api/core";
import initWasm, {
  calculate_pile_option_cost,
  calculate_pile_options,
  calculate_selected_cpts,
  choose_default_option,
  cpt_frd_rows,
  greedy_optimize,
  import_project_from_files,
  write_ifcpp_project,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";

import {
  type BearingCapacity,
  type CptBearingCapacityRow,
  type Cpt,
  type CptSelectionSettings,
  type GreedyOptimizationSettings,
  type GreedyOptimizedPileChoice,
  type LoadPoint,
  type PileConfigurationOption,
  type PileCostSettings,
  type SelectedCpt,
} from "./projectTypes";
import type { IfcppProject } from "./projectFile.ts";

type CorePileConfigurationOption = Omit<PileConfigurationOption, "isOption"> & {
  is_option: boolean;
};

type CoreCptSelectionSettings = {
  algorithm: CptSelectionSettings["algorithm"];
  max_distance_m: number;
  max_angle_degrees: number;
};

type CoreCptSelectionSettingsByLoadPoint = Record<string, CoreCptSelectionSettings>;
type CoreCptSelectionSettingsMapByLoadPoint = Map<number, CoreCptSelectionSettings>;
type ManualCptIdsByLoadPoint = Map<number, number[]>;

let wasmReady: Promise<void> | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function calculateSelectedCptsCore(input: {
  loadPoint: LoadPoint;
  cpts: Cpt[];
  settings: CptSelectionSettings;
  manualCptIds?: number[];
}): Promise<SelectedCpt[]> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    return calculate_selected_cpts({
      load_point: input.loadPoint,
      cpts: input.cpts,
      settings: toCoreSettings(input.settings),
      manual_cpt_ids: input.manualCptIds ?? null,
    }) as SelectedCpt[];
  }

  return invoke<SelectedCpt[]>("calculate_selected_cpts", {
    request: {
      load_point: input.loadPoint,
      cpts: input.cpts,
      settings: toCoreSettings(input.settings),
      manual_cpt_ids: input.manualCptIds ?? null,
    },
  });
}

export async function calculatePileOptionsCore(input: {
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalSettings: CptSelectionSettings;
  settingsByLoadPoint: Map<number, CptSelectionSettings>;
  manualCptIdsByLoadPoint: ManualCptIdsByLoadPoint;
}): Promise<Map<number, PileConfigurationOption[]>> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const result = calculate_pile_options({
      load_points: input.loadPoints,
      cpts: input.cpts,
      bearing_capacities: input.bearingCapacities,
      global_settings: toCoreSettings(input.globalSettings),
      settings_by_load_point: toCoreSettingsMapByLoadPoint(input.settingsByLoadPoint),
      manual_cpt_ids_by_load_point: toWasmNumberKeyedMap(input.manualCptIdsByLoadPoint),
    });

    return corePileOptionsMapToFrontend(result);
  }

  const result = await invoke<Record<string, CorePileConfigurationOption[]>>("calculate_pile_options", {
    request: {
      load_points: input.loadPoints,
      cpts: input.cpts,
      bearing_capacities: input.bearingCapacities,
      global_settings: toCoreSettings(input.globalSettings),
      settings_by_load_point: toCoreSettingsByLoadPoint(input.settingsByLoadPoint),
      manual_cpt_ids_by_load_point: toStringKeyedRecord(input.manualCptIdsByLoadPoint),
    },
  });

  return new Map(
    Object.entries(result).map(([loadPointId, options]) => [
      Number(loadPointId),
      options.map(fromCorePileOption),
    ]),
  );
}

export async function calculatePileCostCore(input: {
  pileSizeMm: number;
  pileTipLevelM: number;
  settings: PileCostSettings;
}): Promise<number | null> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const response = calculate_pile_option_cost({
      pile_size_mm: input.pileSizeMm,
      pile_tip_level_m: input.pileTipLevelM,
      settings: input.settings,
    }) as { cost_eur: number | null };

    return response.cost_eur;
  }

  const response = await invoke<{ cost_eur: number | null }>("calculate_pile_option_cost", {
    request: {
      pile_size_mm: input.pileSizeMm,
      pile_tip_level_m: input.pileTipLevelM,
      settings: input.settings,
    },
  });

  return response.cost_eur;
}

export async function chooseDefaultPileOptionCore(input: {
  options: PileConfigurationOption[];
  settings: PileCostSettings;
}): Promise<PileConfigurationOption | null> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const option = choose_default_option({
      options: input.options.map(toCorePileOption),
      settings: input.settings,
    }) as CorePileConfigurationOption | null;

    return option ? fromCorePileOption(option) : null;
  }

  const option = await invoke<CorePileConfigurationOption | null>("choose_default_option", {
    request: {
      options: input.options.map(toCorePileOption),
      settings: input.settings,
    },
  });

  return option ? fromCorePileOption(option) : null;
}

export async function getBearingCapacityRowsForCptCore(input: {
  bearingCapacities: BearingCapacity[];
  cptId: number;
}): Promise<CptBearingCapacityRow[]> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    return cpt_frd_rows({
      bearing_capacities: input.bearingCapacities,
      cpt_id: input.cptId,
    }) as CptBearingCapacityRow[];
  }

  return invoke<CptBearingCapacityRow[]>("cpt_frd_rows", {
    request: {
      bearing_capacities: input.bearingCapacities,
      cpt_id: input.cptId,
    },
  });
}

export async function greedyOptimizeCore(input: {
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
  costSettings: PileCostSettings;
  settings: GreedyOptimizationSettings;
}): Promise<GreedyOptimizedPileChoice[]> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const request = {
      options_by_load_point: toWasmNumberKeyedMap(toCorePileOptionsByLoadPoint(input.optionsByLoadPoint)),
      cost_settings: input.costSettings,
      settings: input.settings,
    };

    return greedy_optimize(request) as GreedyOptimizedPileChoice[];
  }

  const request = {
    options_by_load_point: toStringKeyedRecord(toCorePileOptionsByLoadPoint(input.optionsByLoadPoint)),
    cost_settings: input.costSettings,
    settings: input.settings,
  };

  return invoke<GreedyOptimizedPileChoice[]>("greedy_optimize", { request });
}

export async function importProjectFromFilesCore(input: {
  projectName: string;
  loadPointsCsv: string;
  cptsXlsx: Uint8Array;
  bearingCapacitiesXlsx: Uint8Array;
}): Promise<IfcppProject> {
  await initializeWasm();
  return import_project_from_files({
    project_name: input.projectName,
    load_points_csv: input.loadPointsCsv,
    cpts_xlsx: input.cptsXlsx,
    bearing_capacities_xlsx: input.bearingCapacitiesXlsx,
  }) as IfcppProject;
}

export async function writeIfcppProjectCore(project: IfcppProject): Promise<string> {
  await initializeWasm();
  return write_ifcpp_project(project);
}

function initializeWasm(): Promise<void> {
  wasmReady ??= initWasm().then(() => undefined);
  return wasmReady;
}

function corePileOptionsMapToFrontend(value: unknown): Map<number, PileConfigurationOption[]> {
  const entries =
    value instanceof Map
      ? [...value.entries()]
      : Object.entries(value as Record<string, CorePileConfigurationOption[]>);

  return new Map(
    entries.map(([loadPointId, options]) => [
      Number(loadPointId),
      (options as CorePileConfigurationOption[]).map(fromCorePileOption),
    ]),
  );
}

function toCorePileOptionsByLoadPoint(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): Map<number, CorePileConfigurationOption[]> {
  return new Map(
    [...optionsByLoadPoint.entries()].map(([loadPointId, options]) => [
      loadPointId,
      options.map(toCorePileOption),
    ]),
  );
}

function toCoreSettings(settings: CptSelectionSettings): CoreCptSelectionSettings {
  return {
    algorithm: settings.algorithm,
    max_distance_m: settings.maxDistanceM,
    max_angle_degrees: settings.maxAngleDegrees,
  };
}

function toCoreSettingsByLoadPoint(
  settingsByLoadPoint: Map<number, CptSelectionSettings>,
): CoreCptSelectionSettingsByLoadPoint {
  return toStringKeyedRecord(
    new Map(
      [...settingsByLoadPoint.entries()].map(([loadPointId, settings]) => [
        loadPointId,
        toCoreSettings(settings),
      ]),
    ),
  );
}

function toCoreSettingsMapByLoadPoint(
  settingsByLoadPoint: Map<number, CptSelectionSettings>,
): CoreCptSelectionSettingsMapByLoadPoint {
  return toWasmNumberKeyedMap(
    new Map(
      [...settingsByLoadPoint.entries()].map(([loadPointId, settings]) => [
        loadPointId,
        toCoreSettings(settings),
      ]),
    ),
  );
}

function fromCorePileOption(option: CorePileConfigurationOption): PileConfigurationOption {
  return {
    pile_size_mm: option.pile_size_mm,
    pile_tip_level_m: option.pile_tip_level_m,
    isOption: option.is_option,
    governing_cpt_id: normalizeOptionalNumber(option.governing_cpt_id),
    governing_frd_kn: normalizeOptionalNumber(option.governing_frd_kn),
    utilization: normalizeOptionalNumber(option.utilization),
    missing_cpt_ids: option.missing_cpt_ids,
  };
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  return value === undefined || value === null || !Number.isFinite(value) ? null : value;
}

function toCorePileOption(option: PileConfigurationOption): CorePileConfigurationOption {
  return {
    pile_size_mm: option.pile_size_mm,
    pile_tip_level_m: option.pile_tip_level_m,
    is_option: option.isOption,
    governing_cpt_id: option.governing_cpt_id,
    governing_frd_kn: option.governing_frd_kn,
    utilization: option.utilization,
    missing_cpt_ids: option.missing_cpt_ids,
  };
}
