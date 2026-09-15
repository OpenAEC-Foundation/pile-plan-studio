import initWasm, {
  aggregate_pile_options,
  assess_technical_assignment,
  build_load_point_topology,
  build_tip_level_region_topology,
  calculate_pile_option_analysis,
  calculate_pile_option_cost,
  choose_default_options,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toStringKeyedRecord, toWasmNumberKeyedMap } from "./coreSerialization.ts";
import {
  numericMap,
  pileOptionAnalysisResultFromCore,
  type CorePileOptionAnalysisResult,
} from "./pileOptionAnalysisResult.ts";
import type {
  BearingCapacity,
  Cpt,
  CptSelectionSettings,
  LoadPoint,
  PileConfigurationKey,
  PileConfigurationOption,
  PileCostSettings,
  PileOptionAnalysisResult,
} from "./projectTypes.ts";
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
import type { LoadPointGroup } from "./loadPointGroupContract.ts";
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
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";

type CoreCptSelectionSettings = {
  algorithm: CptSelectionSettings["algorithm"];
  max_distance_m: number;
  monopoly_distance_m: number;
  max_angle_degrees: number;
};

type CoreCptSelectionSettingsByLoadPoint = Record<string, CoreCptSelectionSettings>;
type CoreCptSelectionSettingsMapByLoadPoint = Map<number, CoreCptSelectionSettings>;
type ManualCptIdsByLoadPoint = Map<number, number[]>;

async function ensureWasm(): Promise<void> {
  return initializeWasm(() => initWasm());
}

export async function buildLoadPointTopologyCore(
  loadPoints: LoadPoint[],
): Promise<LoadPointTopology> {
  if (!isTauriRuntime()) {
    await ensureWasm();
    return build_load_point_topology({ load_points: loadPoints }) as LoadPointTopology;
  }

  return invokeDesktop<LoadPointTopology>("build_load_point_topology", {
    request: { load_points: loadPoints },
  });
}

export async function buildTipLevelRegionTopologyCore(input: {
  loadPointTopology: LoadPointTopology;
  selectedAssignments: Map<number, TipLevelRegionAssignment>;
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>;
}): Promise<TipLevelRegionTopology> {
  if (!isTauriRuntime()) {
    await ensureWasm();
    return build_tip_level_region_topology(
      toBrowserTipLevelRegionTopologyRequest(input),
    ) as TipLevelRegionTopology;
  }

  return invokeDesktop<TipLevelRegionTopology>("build_tip_level_region_topology", {
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
    await ensureWasm();
    result = calculate_pile_option_analysis(wasmRequest) as CorePileOptionAnalysisResult;
  } else {
    result = await invokeDesktop<CorePileOptionAnalysisResult>("calculate_pile_option_analysis", {
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
    await ensureWasm();
    const response = calculate_pile_option_cost({
      pile_size_mm: input.pileSizeMm,
      pile_tip_level_m: input.pileTipLevelM,
      pile_head_level_m: input.pileHeadLevelM,
      settings: input.settings,
    }) as { cost: number | null };
    return response.cost;
  }

  const response = await invokeDesktop<{ cost: number | null }>("calculate_pile_option_cost", {
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
    await ensureWasm();
    choices = choose_default_options(
      toBrowserDefaultPileSelectionRequest(input),
    ) as Map<number, PileConfigurationKey>;
  } else {
    choices = await invokeDesktop<Record<string, PileConfigurationKey>>("choose_default_options", {
      request: toDesktopDefaultPileSelectionRequest(input),
    });
  }

  return new Map([...numericMap(choices)].map(([loadPointId, key]) => [loadPointId, { ...key }]));
}

export async function aggregatePileOptionsCore(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): Promise<AggregatedPileConfiguration[]> {
  let result: CoreAggregatedPileConfiguration[];
  if (!isTauriRuntime()) {
    await ensureWasm();
    result = aggregate_pile_options(
      toBrowserAggregatePileOptionsRequest(optionsByLoadPoint),
    ) as CoreAggregatedPileConfiguration[];
  } else {
    result = await invokeDesktop<CoreAggregatedPileConfiguration[]>("aggregate_pile_options", {
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
    await ensureWasm();
    result = assess_technical_assignment(
      toBrowserTechnicalAssignmentRequest(input),
    ) as CoreTechnicalAssignmentAssessment;
  } else {
    result = await invokeDesktop<CoreTechnicalAssignmentAssessment>("assess_technical_assignment", {
      request: toDesktopTechnicalAssignmentRequest(input),
    });
  }

  return technicalAssignmentAssessmentFromCore(result);
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
  return toStringKeyedRecord(new Map(
    [...settingsByLoadPoint].map(([loadPointId, settings]) => [loadPointId, toCoreSettings(settings)]),
  ));
}

function toCoreSettingsMapByLoadPoint(
  settingsByLoadPoint: Map<number, CptSelectionSettings>,
): CoreCptSelectionSettingsMapByLoadPoint {
  return toWasmNumberKeyedMap(new Map(
    [...settingsByLoadPoint].map(([loadPointId, settings]) => [loadPointId, toCoreSettings(settings)]),
  ));
}
