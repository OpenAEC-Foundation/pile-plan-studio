import { invoke } from "@tauri-apps/api/core";
import initWasm, {
  calculate_pile_option_cost,
  calculate_pile_options,
  calculate_project_analysis,
  calculate_selected_cpts,
  choose_default_option,
  choose_default_options,
  cpt_frd_rows,
  export_pile_plan_csv,
  export_pile_plan_xlsx,
  greedy_optimize,
  import_project_from_files,
  preview_import_file,
  preview_pile_plan_import_file,
  refresh_project_from_files,
  write_ifcpp_project,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toStringKeyedRecord, toWasmNumberKeyedMap, toWasmNumberKeyedRecord } from "./coreSerialization.ts";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import {
  corePileOptionsMapToFrontend,
  fromCorePileOption,
  numericMap,
  projectAnalysisResultFromCore,
  type CorePileConfigurationOption,
  type CoreProjectAnalysisResult,
} from "./projectAnalysisResult.ts";

import {
  type BearingCapacity,
  type CptBearingCapacityRow,
  type Cpt,
  type CptSelectionSettings,
  type GreedyOptimizationSettings,
  type GreedyOptimizedPileChoice,
  type LoadPoint,
  type PileConfigurationOption,
  type PileConfigurationKey,
  type PilePlanExportInput,
  type PileCostSettings,
  type ProjectAnalysisResult,
  type SelectedCpt,
} from "./projectTypes";
import type { IfcppProject } from "./projectFile.ts";
import {
  fromCoreImportSourcePreview,
  toCoreImportSource,
  type ImportSourceInput,
  type ImportSourcePreview,
} from "./coreImportContract.ts";
import {
  fromCorePilePlanImportPreview,
  toCorePilePlanImportRequest,
  type PilePlanImportPreview,
  type PilePlanImportRequest,
} from "./pilePlanImportContract.ts";

type CoreCptSelectionSettings = {
  algorithm: CptSelectionSettings["algorithm"];
  max_distance_m: number;
  monopoly_distance_m: number;
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

export async function calculateProjectAnalysisCore(input: {
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalSettings: CptSelectionSettings;
  settingsByLoadPoint: Map<number, CptSelectionSettings>;
  manualCptIdsByLoadPoint: ManualCptIdsByLoadPoint;
  includeCptFrdRows: boolean;
}): Promise<ProjectAnalysisResult> {
  const wasmRequest = {
    load_points: input.loadPoints,
    cpts: input.cpts,
    bearing_capacities: input.bearingCapacities,
    global_settings: toCoreSettings(input.globalSettings),
    settings_by_load_point: toCoreSettingsMapByLoadPoint(input.settingsByLoadPoint),
    manual_cpt_ids_by_load_point: toWasmNumberKeyedMap(input.manualCptIdsByLoadPoint),
    include_cpt_frd_rows: input.includeCptFrdRows,
  };
  let result: CoreProjectAnalysisResult;
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = calculate_project_analysis(wasmRequest) as CoreProjectAnalysisResult;
  } else {
    result = await invoke<CoreProjectAnalysisResult>("calculate_project_analysis", {
      request: {
        ...wasmRequest,
        settings_by_load_point: toCoreSettingsByLoadPoint(input.settingsByLoadPoint),
        manual_cpt_ids_by_load_point: toStringKeyedRecord(input.manualCptIdsByLoadPoint),
      },
    });
  }

  return projectAnalysisResultFromCore(result);
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

export async function chooseDefaultPileOptionsCore(input: {
  optionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  costSettings: PileCostSettings;
}): Promise<Map<number, string>> {
  const coreOptions = toCorePileOptionsByLoadPoint(input.optionsByLoadPointId);
  let choices: Map<number, PileConfigurationKey> | Record<string, PileConfigurationKey>;

  if (!isTauriRuntime()) {
    await initializeWasm();
    choices = choose_default_options({
      options_by_load_point: toWasmNumberKeyedMap(coreOptions),
      cost_settings: input.costSettings,
    }) as Map<number, PileConfigurationKey>;
  } else {
    choices = await invoke<Record<string, PileConfigurationKey>>("choose_default_options", {
      request: {
        options_by_load_point: toStringKeyedRecord(coreOptions),
        cost_settings: input.costSettings,
      },
    });
  }

  return new Map(
    [...numericMap(choices)].map(([loadPointId, key]) => [
      loadPointId,
      `${key.pile_size_mm}|${key.pile_tip_level_m_key / 1000}`,
    ]),
  );
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
  sources: ImportSourceInput[];
}): Promise<IfcppProject> {
  const request = {
    project_name: input.projectName,
    sources: input.sources.map(toCoreImportSource),
  };
  if (!isTauriRuntime()) {
    await initializeWasm();
    return import_project_from_files(request) as IfcppProject;
  }
  return invoke<IfcppProject>("import_project_from_files", { request });
}

export async function refreshProjectFromFilesCore(input: {
  currentProject: IfcppProject;
  sources: ImportSourceInput[];
}): Promise<IfcppProject> {
  const sources = input.sources.map(toCoreImportSource);
  if (!isTauriRuntime()) {
    await initializeWasm();
    return refresh_project_from_files({
      current_project: toWasmIfcppProject(input.currentProject),
      sources,
    }) as IfcppProject;
  }
  return invoke<IfcppProject>("refresh_project_from_files", {
    request: {
      current_project: input.currentProject,
      sources,
    },
  });
}

export async function previewImportSourceCore(
  source: ImportSourceInput,
): Promise<ImportSourcePreview> {
  const request = { source: toCoreImportSource(source) };
  if (!isTauriRuntime()) {
    await initializeWasm();
    return fromCoreImportSourcePreview(preview_import_file(request));
  }
  return fromCoreImportSourcePreview(
    await invoke("preview_import_file", { request }),
  );
}

export async function previewPilePlanImportCore(
  input: PilePlanImportRequest,
): Promise<PilePlanImportPreview> {
  const request = toCorePilePlanImportRequest(input);
  if (!isTauriRuntime()) {
    await initializeWasm();
    return fromCorePilePlanImportPreview(preview_pile_plan_import_file(request));
  }
  return fromCorePilePlanImportPreview(
    await invoke("preview_pile_plan_import_file", { request }),
  );
}

export async function exportPilePlanCsvCore(input: PilePlanExportInput): Promise<Uint8Array> {
  return exportPilePlanCore("csv", input);
}

export async function exportPilePlanXlsxCore(input: PilePlanExportInput): Promise<Uint8Array> {
  return exportPilePlanCore("xlsx", input);
}

export async function writeIfcppProjectCore(project: IfcppProject): Promise<string> {
  await initializeWasm();
  return write_ifcpp_project(toWasmIfcppProject(project));
}

function toWasmIfcppProject(project: IfcppProject) {
  return {
    ...project,
    settings: {
      ...project.settings,
      cpt_selection_by_load_point: toWasmNumberKeyedRecord(project.settings.cpt_selection_by_load_point),
    },
    user_state: {
      ...project.user_state,
      selected_piles: toWasmNumberKeyedRecord(project.user_state.selected_piles),
      manual_cpt_selections: toWasmNumberKeyedRecord(project.user_state.manual_cpt_selections),
    },
  };
}

async function exportPilePlanCore(
  format: "csv" | "xlsx",
  input: PilePlanExportInput,
): Promise<Uint8Array> {
  const wasmRequest = {
    load_points: input.loadPoints,
    selected_piles: toWasmNumberKeyedMap(input.selectedPiles),
    selected_cpts: toWasmNumberKeyedMap(input.selectedCpts),
  };

  if (!isTauriRuntime()) {
    await initializeWasm();
    return binaryResultToUint8Array(
      format === "csv"
        ? export_pile_plan_csv(wasmRequest)
        : export_pile_plan_xlsx(wasmRequest),
    );
  }

  const result = await invoke<number[]>(`export_pile_plan_${format}`, {
    request: {
      load_points: input.loadPoints,
      selected_piles: toStringKeyedRecord(input.selectedPiles),
      selected_cpts: toStringKeyedRecord(input.selectedCpts),
    },
  });
  return binaryResultToUint8Array(result);
}

function initializeWasm(): Promise<void> {
  wasmReady ??= initWasm().then(() => undefined);
  return wasmReady;
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
    monopoly_distance_m: settings.monopolyDistanceM,
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
