import type {
  BearingCapacity,
  Cpt,
  CptSelectionAlgorithm,
  CptSelectionSettings,
  GreedyOptimizationSettings,
  GreedyUnassignedReason,
  LegendColorScheme,
  LegendItems,
  LoadPoint,
  PileConfigurationKey,
  PileCostSettings,
  PileCostSettingsItem,
  ViewerUtilizationSettings,
} from "./projectTypes.ts";
import {
  reconcileProjectLegend,
  type LegendImportWarning,
} from "../viewer/legend.ts";

type IfcppGreedyOptimizationSettings = Omit<GreedyOptimizationSettings, "max_utilization"> & {
  max_utilization?: number;
};

type IfcppApplication = {
  name: string;
  version: string;
};

type IfcppCptSelectionSettings = {
  algorithm: CptSelectionAlgorithm;
  max_distance_m: number;
  monopoly_distance_m?: number;
  max_angle_degrees: number;
};

type IfcppSelectedPileChoice = {
  pile: PileConfigurationKey | null;
  external_references?: unknown[];
};

type IfcppPileSymbol = {
  base_shape: unknown;
  fill_pattern: unknown;
};

type IfcppLegendValueStyle = {
  value: number;
  symbol: IfcppPileSymbol;
  color: unknown;
  symbol_automatic?: unknown;
  color_automatic?: unknown;
};

type IfcppProjectLegend = {
  encoding_mode: unknown;
  color_scheme?: unknown;
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

export type IfcppPilePlan = {
  id: string;
  name: string;
  selected_piles: Record<string, IfcppSelectedPileChoice>;
  locked_load_point_ids: number[];
  optimization_unassigned?: Record<string, GreedyUnassignedReason>;
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
    bearing_capacities: BearingCapacity[];
  };
  settings: {
    global_cpt_selection: IfcppCptSelectionSettings;
    cpt_selection_by_load_point: Record<string, IfcppCptSelectionSettings>;
    pile_costs: IfcppPileCostSettings;
    pile_head_level_m?: number | null;
    optimization: IfcppGreedyOptimizationSettings;
    viewer_utilization?: ViewerUtilizationSettings;
    active_pile_sizes: number[];
    active_pile_tip_levels: number[];
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
  name: string;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalCptSelectionSettings: CptSelectionSettings;
  cptSelectionSettingsByLoadPoint: Map<number, CptSelectionSettings>;
  pileCostSettings: PileCostSettings;
  pileHeadLevelM: number | null;
  currencyCode: string;
  symbolScalePercent: number;
  foregroundLayer: "load-points" | "cpts";
  showGrid: boolean;
  showTipLevelRegions: boolean;
  activePileSizes: number[];
  activePileTipLevels: number[];
  pileLegend: LegendItems;
  legendImportWarnings: LegendImportWarning[];
  optimizationSettings: GreedyOptimizationSettings;
  viewerUtilizationSettings: ViewerUtilizationSettings;
  pilePlans: PilePlanData[];
  activePilePlanId: string;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
  importLog: IfcppImportLogEntry[];
};

export type PilePlanData = {
  id: string;
  name: string;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  externalReferencesByLoadPoint: Map<number, unknown[]>;
  lockedLoadPointIds: number[];
  optimizationUnassignedByLoadPoint: Map<number, GreedyUnassignedReason>;
};

export function loadIfcppProjectData(input: string | IfcppProject): LoadedProjectData {
  const project = typeof input === "string" ? JSON.parse(input) as IfcppProject : input;

  if (project.schema !== "IFCPP") {
    throw new Error(`Expected IFCPP project, got ${project.schema}`);
  }

  if (![1, 2, 3].includes(project.schema_version)) {
    throw new Error(`Unsupported IFCPP schema version ${project.schema_version}`);
  }

  const { pilePlans, activePilePlanId } = loadPilePlans(project);
  const activePilePlan = pilePlans.find((plan) => plan.id === activePilePlanId) ?? pilePlans[0];
  const { legend: pileLegend, warnings: legendImportWarnings } = reconcileProjectLegend(
    fromIfcppProjectLegend(project.settings.pile_legend),
    project.inputs.bearing_capacities,
  );

  return {
    name: project.metadata.name,
    loadPoints: project.inputs.load_points,
    cpts: project.inputs.cpts,
    bearingCapacities: project.inputs.bearing_capacities,
    globalCptSelectionSettings: fromIfcppCptSelectionSettings(project.settings.global_cpt_selection),
    cptSelectionSettingsByLoadPoint: new Map(
      numberKeyedEntries(project.settings.cpt_selection_by_load_point)
        .map(([loadPointId, settings]) => [loadPointId, fromIfcppCptSelectionSettings(settings)]),
    ),
    pileCostSettings: normalizePileCostSettings(project.settings.pile_costs),
    pileHeadLevelM: normalizePileHeadLevel(project),
    currencyCode: normalizeCurrencyCode(project.units?.costs),
    ...normalizeProjectViewerSettings(project.settings.viewer),
    activePileSizes: project.settings.active_pile_sizes,
    activePileTipLevels: project.settings.active_pile_tip_levels,
    pileLegend,
    legendImportWarnings,
    optimizationSettings: {
      ...project.settings.optimization,
      max_utilization: clampUnitInterval(project.settings.optimization.max_utilization ?? 1),
    },
    viewerUtilizationSettings: normalizeViewerUtilizationSettings(
      project.settings.viewer_utilization,
    ),
    pilePlans,
    activePilePlanId,
    selectedPileOptionKeysByLoadPoint: new Map(activePilePlan.selectedPileOptionKeysByLoadPoint),
    manualCptIdsByLoadPoint: new Map(
      numberKeyedEntries(project.user_state.manual_cpt_selections),
    ),
    importLog: project.import_log ?? [],
  };
}

function loadPilePlans(project: IfcppProject): {
  pilePlans: PilePlanData[];
  activePilePlanId: string;
} {
  const wirePlans = project.schema_version >= 2
    ? (project.user_state.pile_plans ?? [])
    : [{
        id: "pile-plan-1",
        name: "Pile plan 1",
        selected_piles: project.user_state.selected_piles ?? {},
        locked_load_point_ids: [],
      }];
  const normalizedWirePlans = wirePlans.length > 0
    ? wirePlans
    : [{
        id: "pile-plan-1",
        name: "Pile plan 1",
        selected_piles: {},
        locked_load_point_ids: [],
      }];
  const seenIds = new Set<string>();
  for (const plan of normalizedWirePlans) {
    if (seenIds.has(plan.id)) {
      throw new Error(`Duplicate pile plan id '${plan.id}'`);
    }
    seenIds.add(plan.id);
  }

  const pilePlans = normalizedWirePlans.map((plan) => pilePlanDataFromWire(plan));
  const requestedActiveId = project.schema_version >= 2
    ? project.user_state.active_pile_plan_id
    : "pile-plan-1";
  const activePilePlanId = pilePlans.some((plan) => plan.id === requestedActiveId)
    ? requestedActiveId!
    : pilePlans[0].id;

  return { pilePlans, activePilePlanId };
}

function pilePlanDataFromWire(plan: IfcppPilePlan): PilePlanData {
  const selectedEntries = numberKeyedEntries(plan.selected_piles)
    .flatMap(([loadPointId, choice]) => choice.pile
      ? [[loadPointId, pileConfigurationKeyToOptionKey(choice.pile)] as const]
      : []);

  return {
    id: plan.id,
    name: plan.name,
    selectedPileOptionKeysByLoadPoint: new Map(selectedEntries),
    externalReferencesByLoadPoint: new Map(
      numberKeyedEntries(plan.selected_piles)
        .map(([loadPointId, choice]) => [loadPointId, choice.external_references ?? []]),
    ),
    lockedLoadPointIds: [...(plan.locked_load_point_ids ?? [])],
    optimizationUnassignedByLoadPoint: new Map(
      numberKeyedEntries(plan.optimization_unassigned ?? {}),
    ),
  };
}

function numberKeyedEntries<T>(values: Record<string, T> | Map<number, T>): Array<[number, T]> {
  if (values instanceof Map) {
    return [...values.entries()].map(([key, value]) => [Number(key), value]);
  }

  return Object.entries(values).map(([key, value]) => [Number(key), value]);
}

export function createIfcppProject(input: {
  name: string;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  globalCptSelectionSettings: CptSelectionSettings;
  cptSelectionSettingsByLoadPoint: Map<number, CptSelectionSettings>;
  pileCostSettings: PileCostSettings;
  pileHeadLevelM: number | null;
  currencyCode: string;
  symbolScalePercent: number;
  foregroundLayer: "load-points" | "cpts";
  showGrid: boolean;
  showTipLevelRegions: boolean;
  optimizationSettings: GreedyOptimizationSettings;
  viewerUtilizationSettings: ViewerUtilizationSettings;
  activePileSizes: number[];
  activePileTipLevels: number[];
  pileLegend: LegendItems;
  pilePlans?: PilePlanData[];
  activePilePlanId?: string;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
  importLog: IfcppImportLogEntry[];
}): IfcppProject {
  const sourcePlans = input.pilePlans?.length
    ? input.pilePlans
    : [{
        id: "pile-plan-1",
        name: "Pile plan 1",
        selectedPileOptionKeysByLoadPoint: input.selectedPileOptionKeysByLoadPoint,
        externalReferencesByLoadPoint: new Map<number, unknown[]>(),
        lockedLoadPointIds: [],
        optimizationUnassignedByLoadPoint: new Map(),
      }];
  const activePilePlanId = sourcePlans.some((plan) => plan.id === input.activePilePlanId)
    ? input.activePilePlanId!
    : sourcePlans[0].id;

  return {
    schema: "IFCPP",
    schema_version: 3,
    application: {
      name: "Pile Plan Studio",
      version: "0.1.0-alpha",
    },
    metadata: {
      name: input.name,
      author: null,
      organization: null,
      created_at: null,
      modified_at: null,
      description: null,
      external_references: [],
    },
    units: {
      coordinates: "mm",
      design_loads: "kN",
      pile_tip_levels: "m",
      bearing_capacities: "kN",
      costs: normalizeCurrencyCode(input.currencyCode),
    },
    inputs: {
      load_points: input.loadPoints,
      cpts: input.cpts,
      bearing_capacities: input.bearingCapacities,
    },
    settings: {
      global_cpt_selection: toIfcppCptSelectionSettings(input.globalCptSelectionSettings),
      cpt_selection_by_load_point: Object.fromEntries(
        [...input.cptSelectionSettingsByLoadPoint.entries()]
          .map(([loadPointId, settings]) => [String(loadPointId), toIfcppCptSelectionSettings(settings)]),
      ),
      pile_costs: input.pileCostSettings,
      pile_head_level_m: input.pileHeadLevelM,
      optimization: input.optimizationSettings,
      viewer_utilization: normalizeViewerUtilizationSettings(input.viewerUtilizationSettings),
      active_pile_sizes: input.activePileSizes,
      active_pile_tip_levels: input.activePileTipLevels,
      pile_legend: toIfcppProjectLegend(input.pileLegend),
      viewer: {
        symbol_scale_percent: input.symbolScalePercent,
        foreground_layer: input.foregroundLayer,
        show_grid: input.showGrid,
        show_tip_level_regions: input.showTipLevelRegions,
      },
    },
    user_state: {
      pile_plans: sourcePlans.map((plan) => {
        const selectedPiles = plan.id === activePilePlanId
          ? input.selectedPileOptionKeysByLoadPoint
          : plan.selectedPileOptionKeysByLoadPoint;
        return {
          id: plan.id,
          name: plan.name,
          selected_piles: Object.fromEntries(
            [...selectedPiles.entries()].map(([loadPointId, optionKey]) => [String(loadPointId), {
              pile: optionKeyToPileConfigurationKey(optionKey),
              external_references: plan.id !== activePilePlanId ||
                plan.selectedPileOptionKeysByLoadPoint.get(loadPointId) === optionKey
                ? (plan.externalReferencesByLoadPoint.get(loadPointId) ?? [])
                : [],
            }]),
          ),
          locked_load_point_ids: [...plan.lockedLoadPointIds],
          optimization_unassigned: Object.fromEntries(
            plan.optimizationUnassignedByLoadPoint,
          ),
        };
      }),
      active_pile_plan_id: activePilePlanId,
      manual_cpt_selections: Object.fromEntries(
        [...input.manualCptIdsByLoadPoint.entries()].map(([loadPointId, cptIds]) => [String(loadPointId), cptIds]),
      ),
    },
    import_log: input.importLog,
  };
}

function fromIfcppProjectLegend(legend: IfcppProjectLegend | null | undefined): unknown {
  if (!legend || typeof legend !== "object") return null;
  return {
    encodingMode: legend.encoding_mode,
    colorScheme: legend.color_scheme,
    pileSizes: fromIfcppLegendValues(legend.pile_sizes),
    pileTipLevels: fromIfcppLegendValues(legend.pile_tip_levels),
  };
}

function fromIfcppLegendValues(values: unknown): unknown[] {
  if (!Array.isArray(values)) return [];
  return values.map((item) => {
    const value = item as Partial<IfcppLegendValueStyle>;
    return {
      value: value.value,
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

function toIfcppProjectLegend(legend: LegendItems): IfcppProjectLegend {
  return {
    encoding_mode: legend.encodingMode,
    color_scheme: legend.colorScheme,
    pile_sizes: legend.pileSizes.map(toIfcppLegendValue),
    pile_tip_levels: legend.pileTipLevels.map(toIfcppLegendValue),
  };
}

function toIfcppLegendValue(item: LegendItems["pileSizes"][number]): IfcppLegendValueStyle {
  return {
    value: item.value,
    symbol: {
      base_shape: item.symbol.baseShape,
      fill_pattern: item.symbol.fillPattern,
    },
    color: item.color,
    symbol_automatic: item.symbolAutomatic,
    color_automatic: item.colorAutomatic,
  };
}

function normalizeViewerUtilizationSettings(
  settings: ViewerUtilizationSettings | undefined,
): ViewerUtilizationSettings {
  const minimum = clampUnitInterval(settings?.minimum ?? 0);
  const maximum = clampUnitInterval(settings?.maximum ?? 1);
  return {
    minimum: Math.min(minimum, maximum),
    maximum: Math.max(minimum, maximum),
  };
}

function normalizePileCostSettings(settings: IfcppPileCostSettings): PileCostSettings {
  return {
    schema_version: settings.schema_version,
    items: settings.items.map((item) => ({
      pile_size_mm: item.pile_size_mm,
      shape: item.shape,
      cost_per_m3: Number.isFinite(item.cost_per_m3)
        ? item.cost_per_m3
        : (item.cost_per_m3_eur ?? 0),
    })),
  };
}

function normalizePileHeadLevel(project: IfcppProject): number | null {
  const value = project.settings.pile_head_level_m ?? project.settings.pile_costs.pile_head_level_m;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCurrencyCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase()
    : "EUR";
}

function normalizeProjectViewerSettings(
  settings: IfcppViewerSettings | undefined,
): {
  symbolScalePercent: number;
  foregroundLayer: "load-points" | "cpts";
  showGrid: boolean;
  showTipLevelRegions: boolean;
} {
  const scale = typeof settings?.symbol_scale_percent === "number"
    ? settings.symbol_scale_percent
    : 100;
  return {
    symbolScalePercent: Math.round(Math.max(10, Math.min(200, scale))),
    foregroundLayer: settings?.foreground_layer === "cpts" ? "cpts" : "load-points",
    showGrid: settings?.show_grid !== false,
    showTipLevelRegions: settings?.show_tip_level_regions === true,
  };
}

function clampUnitInterval(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

export function applyDefaultPileCostSettings(
  project: IfcppProject,
  defaultPileCostSettings: PileCostSettings,
): IfcppProject {
  if (project.settings.pile_costs.items.length > 0) {
    return project;
  }

  return {
    ...project,
    settings: {
      ...project.settings,
      pile_costs: structuredClone(defaultPileCostSettings),
    },
  };
}

function fromIfcppCptSelectionSettings(settings: IfcppCptSelectionSettings): CptSelectionSettings {
  return {
    algorithm: settings.algorithm,
    maxDistanceM: settings.max_distance_m,
    monopolyDistanceM: settings.monopoly_distance_m ?? 1,
    maxAngleDegrees: settings.max_angle_degrees,
  };
}

function toIfcppCptSelectionSettings(settings: CptSelectionSettings): IfcppCptSelectionSettings {
  return {
    algorithm: settings.algorithm,
    max_distance_m: settings.maxDistanceM,
    monopoly_distance_m: settings.monopolyDistanceM,
    max_angle_degrees: settings.maxAngleDegrees,
  };
}

function pileConfigurationKeyToOptionKey(key: PileConfigurationKey): string {
  return `${key.pile_size_mm}|${key.pile_tip_level_m_key / 1000}`;
}

function optionKeyToPileConfigurationKey(optionKey: string): PileConfigurationKey | null {
  const [pileSize, pileTipLevel] = optionKey.split("|").map(Number);

  if (!Number.isFinite(pileSize) || !Number.isFinite(pileTipLevel)) {
    return null;
  }

  return {
    pile_size_mm: pileSize,
    pile_tip_level_m_key: Math.round(pileTipLevel * 1000),
  };
}
