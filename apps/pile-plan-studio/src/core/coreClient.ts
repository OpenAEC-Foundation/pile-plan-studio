import { invoke } from "@tauri-apps/api/core";
import initWasm, {
  aggregate_pile_options,
  assess_technical_assignment,
  apply_load_point_group_assignment,
  build_load_point_topology,
  build_tip_level_region_topology,
  calculate_pile_option_cost,
  calculate_pile_option_analysis,
  choose_default_options,
  derive_load_point_groups,
  export_pile_plan_csv,
  export_pile_plan_xlsx,
  greedy_optimize,
  import_project_from_files,
  preview_import_file,
  preview_pile_plan_import_file,
  read_project_document,
  refresh_project_from_files,
  write_project_document,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toStringKeyedRecord, toWasmNumberKeyedMap, toWasmNumberKeyedRecord } from "./coreSerialization.ts";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import {
  numericMap,
  pileOptionAnalysisResultFromCore,
  type CorePileConfigurationOption,
  type CorePileOptionAnalysisResult,
} from "./pileOptionAnalysisResult.ts";

import {
  type BearingCapacity,
  type Cpt,
  type CptSelectionSettings,
  type GreedyOptimizationSettings,
  type GreedyOptimizationOutcome,
  type OptimizationLimitScope,
  type LoadPoint,
  type LoadPointGroupingSettings,
  type PileConfigurationOption,
  type PileConfigurationKey,
  type PilePlanExportInput,
  type PileCostSettings,
  type PileOptionAnalysisResult,
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
import {
  aggregatedPileConfigurationsFromCore,
  toBrowserAggregatePileOptionsRequest,
  toDesktopAggregatePileOptionsRequest,
  type AggregatedPileConfiguration,
  type CoreAggregatedPileConfiguration,
} from "./pileOptionAggregationContract.ts";
import {
  toBrowserTipLevelRegionTopologyRequest,
  toDesktopTipLevelRegionTopologyRequest,
  type LoadPointTopology,
  type TipLevelRegionAssignment,
  type TipLevelRegionTopology,
} from "./tipLevelRegionContract.ts";
import {
  loadPointGroupAssignmentResultFromCore,
  loadPointGroupsFromCore,
  toBrowserLoadPointGroupAssignmentRequest,
  toDeriveLoadPointGroupsRequest,
  toDesktopLoadPointGroupAssignmentRequest,
  type ApplyLoadPointGroupAssignmentResult,
  type LoadPointGroup,
  type LoadPointGroupAssignmentInput,
} from "./loadPointGroupContract.ts";
import {
  greedyOptimizationOutcomeFromCore,
  toBrowserGreedyOptimizationRequest,
  toDesktopGreedyOptimizationRequest,
  type GreedyOptimizationContractInput,
} from "./greedyOptimizationContract.ts";
import {
  toBrowserDefaultPileSelectionRequest,
  toDesktopDefaultPileSelectionRequest,
} from "./defaultPileSelectionContract.ts";
import {
  technicalAssignmentAssessmentFromCore,
  toBrowserTechnicalAssignmentRequest,
  toDesktopTechnicalAssignmentRequest,
  type CoreTechnicalAssignmentAssessment,
  type TechnicalAssignmentAssessment,
  type TechnicalAssignmentContractInput,
} from "./technicalAssignmentContract.ts";
import {
  projectDocumentErrorFromUnknown,
  projectDocumentOutcomeFromCore,
  toBrowserProjectDocumentDraft,
  toDesktopProjectDocumentDraft,
  type CoreValidatedProjectDocument,
  type ProjectDocumentDraft,
  type ProjectDocumentOutcome,
} from "./projectDocumentContract.ts";

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

export async function buildLoadPointTopologyCore(
  loadPoints: LoadPoint[],
): Promise<LoadPointTopology> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    return build_load_point_topology({ load_points: loadPoints }) as LoadPointTopology;
  }

  return invoke<LoadPointTopology>("build_load_point_topology", {
    request: { load_points: loadPoints },
  });
}

export async function buildTipLevelRegionTopologyCore(input: {
  loadPointTopology: LoadPointTopology;
  selectedAssignments: Map<number, TipLevelRegionAssignment>;
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
}): Promise<TipLevelRegionTopology> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    return build_tip_level_region_topology(
      toBrowserTipLevelRegionTopologyRequest(input),
    ) as TipLevelRegionTopology;
  }

  return invoke<TipLevelRegionTopology>("build_tip_level_region_topology", {
    request: toDesktopTipLevelRegionTopologyRequest(input),
  });
}

export async function calculatePileOptionAnalysisCore(input: {
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalSettings: CptSelectionSettings;
  settingsByLoadPoint: Map<number, CptSelectionSettings>;
  manualCptIdsByLoadPoint: ManualCptIdsByLoadPoint;
  includeCptFrdRows: boolean;
}): Promise<PileOptionAnalysisResult> {
  const wasmRequest = {
    load_points: input.loadPoints,
    cpts: input.cpts,
    bearing_capacities: input.bearingCapacities,
    global_settings: toCoreSettings(input.globalSettings),
    settings_by_load_point: toCoreSettingsMapByLoadPoint(input.settingsByLoadPoint),
    manual_cpt_ids_by_load_point: toWasmNumberKeyedMap(input.manualCptIdsByLoadPoint),
    include_cpt_frd_rows: input.includeCptFrdRows,
  };
  let result: CorePileOptionAnalysisResult;
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = calculate_pile_option_analysis(wasmRequest) as CorePileOptionAnalysisResult;
  } else {
    result = await invoke<CorePileOptionAnalysisResult>("calculate_pile_option_analysis", {
      request: {
        ...wasmRequest,
        settings_by_load_point: toCoreSettingsByLoadPoint(input.settingsByLoadPoint),
        manual_cpt_ids_by_load_point: toStringKeyedRecord(input.manualCptIdsByLoadPoint),
      },
    });
  }

  return pileOptionAnalysisResultFromCore(result);
}

export async function calculatePileCostCore(input: {
  pileSizeMm: number;
  pileTipLevelM: number;
  pileHeadLevelM: number;
  settings: PileCostSettings;
}): Promise<number | null> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const response = calculate_pile_option_cost({
      pile_size_mm: input.pileSizeMm,
      pile_tip_level_m: input.pileTipLevelM,
      pile_head_level_m: input.pileHeadLevelM,
      settings: input.settings,
    }) as { cost: number | null };

    return response.cost;
  }

  const response = await invoke<{ cost: number | null }>("calculate_pile_option_cost", {
    request: {
      pile_size_mm: input.pileSizeMm,
      pile_tip_level_m: input.pileTipLevelM,
      pile_head_level_m: input.pileHeadLevelM,
      settings: input.settings,
    },
  });

  return response.cost;
}

export async function chooseDefaultPileOptionsCore(input: {
  groups: LoadPointGroup[];
  optionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  pileHeadLevelM: number;
  costSettings: PileCostSettings;
}): Promise<Map<number, PileConfigurationKey>> {
  let choices: Map<number, PileConfigurationKey> | Record<string, PileConfigurationKey>;

  if (!isTauriRuntime()) {
    await initializeWasm();
    choices = choose_default_options(
      toBrowserDefaultPileSelectionRequest(input),
    ) as Map<number, PileConfigurationKey>;
  } else {
    choices = await invoke<Record<string, PileConfigurationKey>>("choose_default_options", {
      request: toDesktopDefaultPileSelectionRequest(input),
    });
  }

  return new Map(
    [...numericMap(choices)].map(([loadPointId, key]) => [loadPointId, { ...key }]),
  );
}

export async function deriveLoadPointGroupsCore(
  loadPoints: LoadPoint[],
  settings: LoadPointGroupingSettings,
): Promise<LoadPointGroup[]> {
  const request = toDeriveLoadPointGroupsRequest(loadPoints, settings);
  let result: LoadPointGroup[];
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = derive_load_point_groups(request) as LoadPointGroup[];
  } else {
    result = await invoke<LoadPointGroup[]>("derive_load_point_groups", { request });
  }

  return loadPointGroupsFromCore(result);
}

export async function applyLoadPointGroupAssignmentCore(
  input: LoadPointGroupAssignmentInput,
): Promise<ApplyLoadPointGroupAssignmentResult> {
  let result: ApplyLoadPointGroupAssignmentResult;
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = apply_load_point_group_assignment(
      toBrowserLoadPointGroupAssignmentRequest(input),
    ) as ApplyLoadPointGroupAssignmentResult;
  } else {
    result = await invoke<ApplyLoadPointGroupAssignmentResult>(
      "apply_load_point_group_assignment",
      { request: toDesktopLoadPointGroupAssignmentRequest(input) },
    );
  }

  return loadPointGroupAssignmentResultFromCore(result);
}

export async function aggregatePileOptionsCore(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): Promise<AggregatedPileConfiguration[]> {
  let result: CoreAggregatedPileConfiguration[];
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = aggregate_pile_options(
      toBrowserAggregatePileOptionsRequest(optionsByLoadPoint),
    ) as CoreAggregatedPileConfiguration[];
  } else {
    result = await invoke<CoreAggregatedPileConfiguration[]>("aggregate_pile_options", {
      request: toDesktopAggregatePileOptionsRequest(optionsByLoadPoint),
    });
  }

  return aggregatedPileConfigurationsFromCore(result);
}

export async function assessTechnicalAssignmentCore(
  input: TechnicalAssignmentContractInput,
): Promise<TechnicalAssignmentAssessment> {
  let result: CoreTechnicalAssignmentAssessment;
  if (!isTauriRuntime()) {
    await initializeWasm();
    result = assess_technical_assignment(
      toBrowserTechnicalAssignmentRequest(input),
    ) as CoreTechnicalAssignmentAssessment;
  } else {
    result = await invoke<CoreTechnicalAssignmentAssessment>("assess_technical_assignment", {
      request: toDesktopTechnicalAssignmentRequest(input),
    });
  }

  return technicalAssignmentAssessmentFromCore(result);
}

export async function greedyOptimizeCore(
  input: GreedyOptimizationContractInput,
): Promise<GreedyOptimizationOutcome> {
  if (!isTauriRuntime()) {
    await initializeWasm();
    const outcome = greedy_optimize(
      toBrowserGreedyOptimizationRequest(input),
    ) as GreedyOptimizationOutcome;
    return greedyOptimizationOutcomeFromCore(outcome);
  }

  const outcome = await invoke<GreedyOptimizationOutcome>("greedy_optimize", {
    request: toDesktopGreedyOptimizationRequest(input),
  });
  return greedyOptimizationOutcomeFromCore(outcome);
}

export async function importProjectFromFilesCore(input: {
  projectName: string;
  pileHeadLevelM: number;
  currencyCode: string;
  sources: ImportSourceInput[];
}): Promise<Extract<ProjectDocumentOutcome, { status: "valid" }>> {
  const request = {
    project_name: input.projectName,
    pile_head_level_m: input.pileHeadLevelM,
    currency_code: input.currencyCode,
    sources: input.sources.map(toCoreImportSource),
  };
  if (!isTauriRuntime()) {
    await initializeWasm();
    return validProjectDocumentFromCore(
      import_project_from_files(request) as CoreValidatedProjectDocument,
    );
  }
  return validProjectDocumentFromCore(
    await invoke<CoreValidatedProjectDocument>("import_project_from_files", { request }),
  );
}

export async function refreshProjectFromFilesCore(input: {
  currentProject: IfcppProject;
  sources: ImportSourceInput[];
}): Promise<Extract<ProjectDocumentOutcome, { status: "valid" }>> {
  const sources = input.sources.map(toCoreImportSource);
  if (!isTauriRuntime()) {
    await initializeWasm();
    return validProjectDocumentFromCore(
      refresh_project_from_files({
        current_project: toWasmIfcppProject(input.currentProject),
        sources,
      }) as CoreValidatedProjectDocument,
    );
  }
  return validProjectDocumentFromCore(
    await invoke<CoreValidatedProjectDocument>("refresh_project_from_files", {
      request: {
        current_project: input.currentProject,
        sources,
      },
    }),
  );
}

function validProjectDocumentFromCore(
  result: CoreValidatedProjectDocument,
): Extract<ProjectDocumentOutcome, { status: "valid" }> {
  const outcome = projectDocumentOutcomeFromCore({ status: "valid", ...result });
  if (outcome.status !== "valid") {
    throw new Error("A validated project unexpectedly produced an invalid document outcome.");
  }
  return outcome;
}

export async function readProjectDocumentCore(
  contents: string,
): Promise<ProjectDocumentOutcome> {
  try {
    let result: CoreValidatedProjectDocument;
    if (!isTauriRuntime()) {
      await initializeWasm();
      result = read_project_document({ contents }) as CoreValidatedProjectDocument;
    } else {
      result = await invoke<CoreValidatedProjectDocument>("read_project_document", {
        request: { contents },
      });
    }
    return projectDocumentOutcomeFromCore({ status: "valid", ...result });
  } catch (error) {
    const projectError = projectDocumentErrorFromUnknown(error);
    if (!projectError) throw error;
    return { status: "invalid", error: projectError };
  }
}

export async function writeProjectDocumentCore(
  draft: ProjectDocumentDraft,
): Promise<string> {
  try {
    if (!isTauriRuntime()) {
      await initializeWasm();
      return write_project_document({
        draft: toBrowserProjectDocumentDraft(draft),
      });
    }
    return await invoke<string>("write_project_document", {
      request: { draft: toDesktopProjectDocumentDraft(draft) },
    });
  } catch (error) {
    const projectError = projectDocumentErrorFromUnknown(error);
    if (!projectError) throw error;
    throw projectError;
  }
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

function toWasmIfcppProject(project: IfcppProject) {
  const userState = project.schema_version >= 2
    ? {
        pile_plans: (project.user_state.pile_plans ?? []).map((plan) => ({
          ...plan,
          selected_piles: toWasmNumberKeyedRecord(plan.selected_piles),
          optimization_unassigned: toWasmNumberKeyedRecord(
            plan.optimization_unassigned ?? {},
          ),
        })),
        active_pile_plan_id: project.user_state.active_pile_plan_id,
        manual_cpt_selections: toWasmNumberKeyedRecord(project.user_state.manual_cpt_selections),
      }
    : {
        selected_piles: toWasmNumberKeyedRecord(project.user_state.selected_piles ?? {}),
        manual_cpt_selections: toWasmNumberKeyedRecord(project.user_state.manual_cpt_selections),
      };

  return {
    ...project,
    settings: {
      ...project.settings,
      cpt_selection_by_load_point: toWasmNumberKeyedRecord(project.settings.cpt_selection_by_load_point),
    },
    user_state: userState,
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
    configuration: { ...option.configuration },
    pile_size_mm: option.pile_size_mm,
    pile_tip_level_m: option.pile_tip_level_m,
    is_option: option.isOption,
    governing_cpt_id: option.governing_cpt_id,
    governing_frd_kn: option.governing_frd_kn,
    utilization: option.utilization,
    missing_cpt_ids: [...option.missing_cpt_ids],
    technical_status: option.technicalStatus,
  };
}
