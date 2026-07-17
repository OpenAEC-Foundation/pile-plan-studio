import type {
  BearingCapacity,
  Cpt,
  CptSelectionAlgorithm,
  CptSelectionSettings,
  GreedyOptimizationSettings,
  LoadPoint,
  PileConfigurationKey,
  PileCostSettings,
} from "./projectTypes.ts";

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
  external_references: unknown[];
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
    pile_costs: PileCostSettings;
    optimization: GreedyOptimizationSettings;
    active_pile_sizes: number[];
    active_pile_tip_levels: number[];
  };
  user_state: {
    selected_piles: Record<string, IfcppSelectedPileChoice>;
      manual_cpt_selections: Record<string, number[]>;
  };
  import_log?: Array<{
    source_file?: string;
    warnings?: string[];
  }>;
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
  activePileSizes: number[];
  activePileTipLevels: number[];
  optimizationSettings: GreedyOptimizationSettings;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
};

export function loadIfcppProjectData(input: string | IfcppProject): LoadedProjectData {
  const project = typeof input === "string" ? JSON.parse(input) as IfcppProject : input;

  if (project.schema !== "IFCPP") {
    throw new Error(`Expected IFCPP project, got ${project.schema}`);
  }

  if (project.schema_version !== 1) {
    throw new Error(`Unsupported IFCPP schema version ${project.schema_version}`);
  }

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
    pileCostSettings: project.settings.pile_costs,
    activePileSizes: project.settings.active_pile_sizes,
    activePileTipLevels: project.settings.active_pile_tip_levels,
    optimizationSettings: project.settings.optimization,
    selectedPileOptionKeysByLoadPoint: new Map(
      numberKeyedEntries(project.user_state.selected_piles)
        .flatMap(([loadPointId, choice]) => {
          if (!choice.pile) {
            return [];
          }

          return [[loadPointId, pileConfigurationKeyToOptionKey(choice.pile)]];
        }),
    ),
    manualCptIdsByLoadPoint: new Map(
      numberKeyedEntries(project.user_state.manual_cpt_selections),
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
  optimizationSettings: GreedyOptimizationSettings;
  activePileSizes: number[];
  activePileTipLevels: number[];
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
  manualCptIdsByLoadPoint: Map<number, number[]>;
}): IfcppProject {
  return {
    schema: "IFCPP",
    schema_version: 1,
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
      costs: "EUR",
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
      optimization: input.optimizationSettings,
      active_pile_sizes: input.activePileSizes,
      active_pile_tip_levels: input.activePileTipLevels,
    },
    user_state: {
      selected_piles: Object.fromEntries(
        [...input.selectedPileOptionKeysByLoadPoint.entries()]
          .map(([loadPointId, optionKey]) => [String(loadPointId), {
            pile: optionKeyToPileConfigurationKey(optionKey),
            external_references: [],
          }]),
      ),
      manual_cpt_selections: Object.fromEntries(
        [...input.manualCptIdsByLoadPoint.entries()].map(([loadPointId, cptIds]) => [String(loadPointId), cptIds]),
      ),
    },
    import_log: [],
  };
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
