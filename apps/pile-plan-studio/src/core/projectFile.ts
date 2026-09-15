import type {
  BearingCapacity,
  Cpt,
  CptSelectionAlgorithm,
  CptSelectionSettings,
  GreedyOptimizationSettings,
  OptimizationUnassignedReason,
  LegendItems,
  LoadPoint,
  LoadPointGroupingSettings,
  IfcppPileConfigurationKey,
  PileConfigurationKey,
  PileCostSettings,
  PileCostSettingsItem,
  ViewerUtilizationSettings,
} from "./projectTypes.ts";
import {
  reconcileProjectLegend,
  type LegendImportWarning,
} from "../viewer/legend.ts";
import type { ProjectTipLevelKeys } from "./projectDocumentContract.ts";

type IfcppBearingCapacity = Omit<BearingCapacity, "pile_tip_level_mm">;

type IfcppGreedyOptimizationSettings = Omit<
  GreedyOptimizationSettings,
  "max_utilization" | "candidate_source"
> & {
  max_utilization?: number;
  candidate_source?: unknown;
  enabled_pile_sizes?: number[];
  enabled_pile_tip_levels?: number[];
};

type IfcppApplication = {
  name: string;
  version: string;
};

export type IfcppCptSelectionSettings = {
  algorithm: CptSelectionAlgorithm;
  max_distance_m: number;
  monopoly_distance_m?: number;
  max_angle_degrees: number;
};

export type IfcppSelectedPileChoice = {
  pile: IfcppPileConfigurationKey | null;
  external_references?: unknown[];
};

export type IfcppPileSymbol = {
  base_shape: unknown;
  fill_pattern: unknown;
};

export type IfcppLegendValueStyle = {
  value: number;
  symbol: IfcppPileSymbol;
  color: unknown;
  symbol_automatic?: unknown;
  color_automatic?: unknown;
};

export type IfcppProjectLegend = {
  encoding_mode: unknown;
  color_scheme?: unknown;
  pile_size_color_scheme?: unknown;
  pile_tip_level_color_scheme?: unknown;
  pile_sizes: IfcppLegendValueStyle[];
  pile_tip_levels: IfcppLegendValueStyle[];
};

type IfcppPileCostSettings = Omit<PileCostSettings, "items"> & {
  pile_head_level_m?: number;
  items: Array<PileCostSettingsItem & { cost_per_m3_eur?: number }>;
};

type IfcppViewerSettings = {
  symbol_scale_percent?: number;
  foreground_layer?: unknown;
  show_grid?: boolean;
  show_tip_level_regions?: boolean;
};

type IfcppLoadPointGroupingSettings = {
  automatic?: unknown;
  max_edge_distance_mm?: unknown;
};

export type IfcppPilePlan = {
  id: string;
  name: string;
  active_pile_sizes?: number[];
  active_pile_tip_levels?: number[];
  selected_piles: Record<string, IfcppSelectedPileChoice>;
  locked_load_point_ids: number[];
  optimization_unassigned?: Record<string, unknown>;
};

export type IfcppImportLogEntry = {
  source_file?: string;
  warnings?: string[];
  source_role?: "load_points" | "cpts" | "bearing_capacities";
  source_format?: string;
  source_profile?: string;
  profile_details?: Record<string, string>;
};

export type IfcppProject = {
  schema: "IFCPP";
  schema_version: number;
  application?: IfcppApplication;
  metadata: {
    name: string;
    author?: string | null;
    organization?: string | null;
    created_at?: string | null;
    modified_at?: string | null;
    description?: string | null;
    external_references?: unknown[];
  };
  units?: {
    coordinates: string;
    design_loads: string;
    pile_tip_levels: string;
    bearing_capacities: string;
    costs: string;
  };
  inputs: {
    load_points: LoadPoint[];
    cpts: Cpt[];
    bearing_capacities: IfcppBearingCapacity[];
  };
  settings: {
    global_cpt_selection: IfcppCptSelectionSettings;
    cpt_selection_by_load_point: Record<string, IfcppCptSelectionSettings>;
    load_point_grouping?: IfcppLoadPointGroupingSettings;
    pile_costs: IfcppPileCostSettings;
    pile_head_level_m?: number | null;
    optimization: IfcppGreedyOptimizationSettings;
    viewer_utilization?: ViewerUtilizationSettings;
    active_pile_sizes?: number[];
    active_pile_tip_levels?: number[];
    pile_legend?: IfcppProjectLegend | null;
    viewer?: IfcppViewerSettings;
  };
  user_state: {
    selected_piles?: Record<string, IfcppSelectedPileChoice>;
    pile_plans?: IfcppPilePlan[];
    active_pile_plan_id?: string;
    manual_cpt_selections: Record<string, number[]>;
  };
  import_log?: IfcppImportLogEntry[];
};

export type ImportSummary = {
  loadPointCount: number;
  cptCount: number;
  bearingCapacityCount: number;
  warnings: string[];
};

export function getImportSummary(project: IfcppProject): ImportSummary {
  return {
    loadPointCount: project.inputs.load_points.length,
    cptCount: project.inputs.cpts.length,
    bearingCapacityCount: project.inputs.bearing_capacities.length,
    warnings: (project.import_log ?? []).flatMap((entry) => entry.warnings ?? []),
  };
}

export type LoadedProjectData = {
  metadata: IfcppProject["metadata"];
  units: NonNullable<IfcppProject["units"]>;
  name: string;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalCptSelectionSettings: CptSelectionSettings;
  cptSelectionSettingsByLoadPoint: Map<number, CptSelectionSettings>;
  loadPointGroupingSettings: LoadPointGroupingSettings;
  pileCostSettings: PileCostSettings;
  pileHeadLevelM: number | null;
  currencyCode: string;
  symbolScalePercent: number;
  foregroundLayer: "load-points" | "cpts";
  showGrid: boolean;
  showTipLevelRegions: boolean;
  pileLegend: LegendItems;
  legendImportWarnings: LegendImportWarning[];
  optimizationSettings: GreedyOptimizationSettings;
  viewerUtilizationSettings: ViewerUtilizationSettings;
  pilePlans: PilePlanData[];
  activePilePlanId: string;
  selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
  importLog: IfcppImportLogEntry[];
};

export type PilePlanData = {
  id: string;
  name: string;
  activePileSizes: number[];
  activePileTipLevelMms: number[];
  selectedPileConfigurationsByLoadPoint: Map<number, PileConfigurationKey>;
  externalReferencesByLoadPoint: Map<number, unknown[]>;
  lockedLoadPointIds: number[];
  optimizationUnassignedByLoadPoint: Map<number, OptimizationUnassignedReason>;
};

function assertTipLevelKeyContract(
  project: IfcppProject,
  keys: ProjectTipLevelKeys,
): void {
  if (keys.bearingCapacities.length !== project.inputs.bearing_capacities.length) {
    throw new Error("Pile-tip-level key contract does not match bearing capacities");
  }
  const wirePlans = project.user_state.pile_plans ?? [];
  if (wirePlans.length > 0 && (
    keys.pilePlans.length !== wirePlans.length
    || wirePlans.some((plan, index) => (
      keys.pilePlans[index]?.id !== plan.id
      || keys.pilePlans[index].active.length
        !== (plan.active_pile_tip_levels ?? project.settings.active_pile_tip_levels ?? []).length
    ))
  )) {
    throw new Error("Pile-tip-level key contract does not match pile plans");
  }
  const legendLength = project.settings.pile_legend?.pile_tip_levels.length ?? 0;
  if (keys.legend.length !== legendLength) {
    throw new Error("Pile-tip-level key contract does not match the legend");
  }
}

export function hydrateProjectState(
  project: IfcppProject,
  keys: ProjectTipLevelKeys,
): LoadedProjectData {

  assertTipLevelKeyContract(project, keys);
  const bearingCapacities = project.inputs.bearing_capacities.map((capacity, index) => ({
    ...capacity,
    pile_tip_level_mm: keys.bearingCapacities[index],
  }));
  const { pilePlans, activePilePlanId } = loadPilePlans(project, keys);
  const activePilePlan = pilePlans.find((plan) => plan.id === activePilePlanId) ?? pilePlans[0];
  const { legend: pileLegend, warnings: legendImportWarnings } = reconcileProjectLegend(
    fromIfcppProjectLegend(project.settings.pile_legend, keys.legend),
    bearingCapacities,
  );

  return {
    metadata: structuredClone(project.metadata),
    units: structuredClone(project.units!),
    name: project.metadata.name,
    loadPoints: project.inputs.load_points.map((loadPoint) => ({ ...loadPoint })),
    cpts: project.inputs.cpts.map((cpt) => ({ ...cpt })),
    bearingCapacities,
    globalCptSelectionSettings: fromIfcppCptSelectionSettings(project.settings.global_cpt_selection),
    cptSelectionSettingsByLoadPoint: new Map(
      numberKeyedEntries(project.settings.cpt_selection_by_load_point)
        .map(([loadPointId, settings]) => [loadPointId, fromIfcppCptSelectionSettings(settings)]),
    ),
    loadPointGroupingSettings: {
      automatic: Boolean(project.settings.load_point_grouping!.automatic),
      maxEdgeDistanceM: Number(project.settings.load_point_grouping!.max_edge_distance_mm) / 1_000,
    },
    pileCostSettings: structuredClone(project.settings.pile_costs),
    pileHeadLevelM: project.settings.pile_head_level_m ?? null,
    currencyCode: project.units!.costs,
    symbolScalePercent: project.settings.viewer!.symbol_scale_percent!,
    foregroundLayer: project.settings.viewer!.foreground_layer === "cpts"
      ? "cpts"
      : "load-points",
    showGrid: project.settings.viewer!.show_grid!,
    showTipLevelRegions: project.settings.viewer!.show_tip_level_regions!,
    pileLegend,
    legendImportWarnings,
    optimizationSettings: {
      max_pile_sizes: project.settings.optimization.max_pile_sizes,
      max_pile_tip_levels: project.settings.optimization.max_pile_tip_levels,
      max_pile_configurations: project.settings.optimization.max_pile_configurations,
      max_utilization: project.settings.optimization.max_utilization!,
      candidate_source: project.settings.optimization.candidate_source as
        | "active_legend"
        | "all_available",
    },
    viewerUtilizationSettings: { ...project.settings.viewer_utilization! },
    pilePlans,
    activePilePlanId,
    selectedPileConfigurationsByLoadPoint: clonePileConfigurationMap(
      activePilePlan.selectedPileConfigurationsByLoadPoint,
    ),
    manualCptIdsByLoadPoint: new Map(
      numberKeyedEntries(project.user_state.manual_cpt_selections),
    ),
    importLog: project.import_log!.map((entry) => structuredClone(entry)),
  };
}

function loadPilePlans(project: IfcppProject, keys: ProjectTipLevelKeys): {
  pilePlans: PilePlanData[];
  activePilePlanId: string;
} {
  const wirePlans = project.user_state.pile_plans ?? [];
  const pilePlans = wirePlans.map((plan) => pilePlanDataFromWire(
    plan,
    keys.pilePlans.find(({ id }) => id === plan.id)?.active ?? [],
  ));
  const activePilePlanId = project.user_state.active_pile_plan_id!;

  return { pilePlans, activePilePlanId };
}

function pilePlanDataFromWire(
  plan: IfcppPilePlan,
  activePileTipLevelMms: number[],
): PilePlanData {
  const selectedEntries = numberKeyedEntries(plan.selected_piles)
    .flatMap(([loadPointId, choice]) => choice.pile
      ? [[loadPointId, pileConfigurationKeyFromWire(choice.pile)] as const]
      : []);

  return {
    id: plan.id,
    name: plan.name,
    activePileSizes: [...plan.active_pile_sizes!],
    activePileTipLevelMms: [...activePileTipLevelMms],
    selectedPileConfigurationsByLoadPoint: new Map(selectedEntries),
    externalReferencesByLoadPoint: new Map(
      numberKeyedEntries(plan.selected_piles)
        .map(([loadPointId, choice]) => [loadPointId, choice.external_references ?? []]),
    ),
    lockedLoadPointIds: [...(plan.locked_load_point_ids ?? [])],
    optimizationUnassignedByLoadPoint: new Map(
      numberKeyedEntries(plan.optimization_unassigned ?? {})
        .filter((entry): entry is [number, OptimizationUnassignedReason] => (
          entry[1] === "optimization_constraints" || entry[1] === "configuration_limits"
        )),
    ),
  };
}

function numberKeyedEntries<T>(values: Record<string, T> | Map<number, T>): Array<[number, T]> {
  if (values instanceof Map) {
    return [...values.entries()].map(([key, value]) => [Number(key), value]);
  }

  return Object.entries(values).map(([key, value]) => [Number(key), value]);
}

function fromIfcppProjectLegend(
  legend: IfcppProjectLegend | null | undefined,
  pileTipLevelMms: number[],
): unknown {
  if (!legend || typeof legend !== "object") return null;
  return {
    encodingMode: legend.encoding_mode,
    colorScheme: legend.color_scheme,
    pileSizeColorScheme: legend.pile_size_color_scheme,
    pileTipLevelColorScheme: legend.pile_tip_level_color_scheme,
    pileSizes: fromIfcppLegendValues(legend.pile_sizes),
    pileTipLevels: fromIfcppLegendValues(legend.pile_tip_levels, pileTipLevelMms),
  };
}

function fromIfcppLegendValues(values: unknown, replacementValues?: number[]): unknown[] {
  if (!Array.isArray(values)) return [];
  return values.map((item, index) => {
    const value = item as Partial<IfcppLegendValueStyle>;
    return {
      value: replacementValues?.[index] ?? value.value,
      symbol: {
        baseShape: value.symbol?.base_shape,
        fillPattern: value.symbol?.fill_pattern,
      },
      color: value.color,
      symbolAutomatic: typeof value.symbol_automatic === "boolean" ? value.symbol_automatic : true,
      colorAutomatic: typeof value.color_automatic === "boolean" ? value.color_automatic : true,
    };
  });
}

function fromIfcppCptSelectionSettings(settings: IfcppCptSelectionSettings): CptSelectionSettings {
  return {
    algorithm: settings.algorithm,
    maxDistanceM: settings.max_distance_m,
    monopolyDistanceM: settings.monopoly_distance_m!,
    maxAngleDegrees: settings.max_angle_degrees,
  };
}

function pileConfigurationKeyFromWire(key: IfcppPileConfigurationKey): PileConfigurationKey {
  return {
    pile_size_mm: key.pile_size_mm,
    pile_tip_level_mm: key.pile_tip_level_m_key,
  };
}

function clonePileConfigurationMap(
  values: Map<number, PileConfigurationKey>,
): Map<number, PileConfigurationKey> {
  return new Map([...values].map(([loadPointId, key]) => [loadPointId, { ...key }]));
}
