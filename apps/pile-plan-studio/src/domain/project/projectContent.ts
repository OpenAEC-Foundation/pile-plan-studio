import type {
  IfcppLegendValueStyle,
  IfcppPilePlan,
  IfcppProjectLegend,
} from "../../core/projectFile.ts";
import type { CptSelectionSettings, LegendItems } from "../../core/projectTypes.ts";
import type { ProjectDocumentDraft } from "../../core/projectDocumentContract.ts";
import { getProjectBounds } from "../../viewer/viewerGeometry.ts";
import type { ProjectState } from "./projectState.ts";

export type ProjectContent = Pick<ProjectState,
  | "metadata"
  | "units"
  | "name"
  | "loadPoints"
  | "cpts"
  | "bearingCapacities"
  | "globalCptSelectionSettings"
  | "cptSelectionSettingsByLoadPoint"
  | "loadPointGroupingSettings"
  | "pileCostSettings"
  | "pileHeadLevelM"
  | "currencyCode"
  | "optimizationSettings"
  | "viewerUtilizationSettings"
  | "pileLegend"
  | "symbolScalePercent"
  | "foregroundLayer"
  | "showGrid"
  | "showTipLevelRegions"
  | "pilePlans"
  | "manualCptIdsByLoadPoint"
  | "importLog"
>;

export type AnalysisInvalidation = "none" | "all" | number[];

export type RestoredProjectContent = {
  state: ProjectState;
  analysisScope: AnalysisInvalidation;
};

const PROJECT_CONTENT_KEYS = [
  "metadata",
  "units",
  "name",
  "loadPoints",
  "cpts",
  "bearingCapacities",
  "globalCptSelectionSettings",
  "cptSelectionSettingsByLoadPoint",
  "loadPointGroupingSettings",
  "pileCostSettings",
  "pileHeadLevelM",
  "currencyCode",
  "optimizationSettings",
  "viewerUtilizationSettings",
  "pileLegend",
  "symbolScalePercent",
  "foregroundLayer",
  "showGrid",
  "showTipLevelRegions",
  "pilePlans",
  "manualCptIdsByLoadPoint",
  "importLog",
] as const satisfies readonly (keyof ProjectContent)[];

export function normalizeProjectContentState(state: ProjectState): ProjectState {
  const active = state.pilePlans.find((plan) => plan.id === state.activePilePlanId);
  if (!active || active.selectedPileConfigurationsByLoadPoint === state.selectedPileConfigurationsByLoadPoint) {
    return state;
  }

  return {
    ...state,
    pilePlans: state.pilePlans.map((plan) => plan.id === state.activePilePlanId
      ? { ...plan, selectedPileConfigurationsByLoadPoint: state.selectedPileConfigurationsByLoadPoint }
      : plan),
  };
}

export function captureProjectContent(state: ProjectState): ProjectContent {
  const content = {} as ProjectContent;
  for (const key of PROJECT_CONTENT_KEYS) {
    Object.assign(content, { [key]: state[key] });
  }
  return content;
}

export function projectContentEquals(left: ProjectContent, right: ProjectContent): boolean {
  return PROJECT_CONTENT_KEYS.every((key) => left[key] === right[key]);
}

export function restoreProjectContent(
  current: ProjectState,
  content: ProjectContent,
  options: {
    activatePilePlanId?: string | null;
    fallbackPilePlanId?: string | null;
  } = {},
): RestoredProjectContent {
  const requested = content.pilePlans.find((plan) => plan.id === options.activatePilePlanId);
  const currentActive = content.pilePlans.find((plan) => plan.id === current.activePilePlanId);
  const fallback = content.pilePlans.find((plan) => plan.id === options.fallbackPilePlanId);
  const active = requested ?? currentActive ?? fallback ?? content.pilePlans[0];
  const analysisScope = analysisInvalidation(captureProjectContent(current), content);
  const validLoadPointIds = new Set(content.loadPoints.map(({ id }) => id));
  const validCptIds = new Set(content.cpts.map(({ id }) => id));
  const filteredLoadPointIds = current.selectedLoadPointIds.filter((id) => validLoadPointIds.has(id));
  const selectedLoadPointIds = filteredLoadPointIds.length === current.selectedLoadPointIds.length
    ? current.selectedLoadPointIds
    : filteredLoadPointIds;
  const selectedLoadPointId = selectedLoadPointIds.includes(current.selectedLoadPointId ?? -1)
    ? current.selectedLoadPointId
    : selectedLoadPointIds[0] ?? null;

  return {
    state: {
      ...current,
      ...content,
      bounds: getProjectBounds(content.loadPoints, content.cpts),
      inputSources: current.inputSources.map((source) => ({
        ...source,
        itemCount: source.kind === "load_points"
          ? content.loadPoints.length
          : source.kind === "cpts"
            ? content.cpts.length
            : content.bearingCapacities.length,
      })),
      activePilePlanId: active?.id ?? current.activePilePlanId,
      selectedPileConfigurationsByLoadPoint: active?.selectedPileConfigurationsByLoadPoint ?? new Map(),
      selectedLoadPointIds,
      selectedLoadPointId,
      selectedCptId: current.selectedCptId !== null && validCptIds.has(current.selectedCptId)
        ? current.selectedCptId
        : null,
    },
    analysisScope,
  };
}

export function projectDocumentDraftFromContent(
  content: ProjectContent,
  activePilePlanId: string,
): ProjectDocumentDraft {
  const active = content.pilePlans.find((plan) => plan.id === activePilePlanId)
    ?? content.pilePlans[0];
  return {
    metadata: { ...content.metadata, name: content.name },
    units: { ...content.units, costs: content.currencyCode },
    inputs: {
      load_points: content.loadPoints.map((loadPoint) => ({ ...loadPoint })),
      cpts: content.cpts.map((cpt) => ({ ...cpt })),
      bearing_capacities: content.bearingCapacities.map(
        ({ pile_tip_level_mm: _, ...capacity }) => ({ ...capacity }),
      ),
    },
    settings: {
      global_cpt_selection: cptSelectionSettingsToDocument(
        content.globalCptSelectionSettings,
      ),
      cpt_selection_by_load_point: Object.fromEntries(
        [...content.cptSelectionSettingsByLoadPoint].map(([loadPointId, settings]) => [
          String(loadPointId),
          cptSelectionSettingsToDocument(settings),
        ]),
      ),
      load_point_grouping: {
        automatic: content.loadPointGroupingSettings.automatic,
        max_edge_distance_mm: content.loadPointGroupingSettings.maxEdgeDistanceM * 1_000,
      },
      pile_costs: structuredClone(content.pileCostSettings),
      pile_head_level_m: content.pileHeadLevelM,
      optimization: structuredClone(content.optimizationSettings),
      viewer_utilization: { ...content.viewerUtilizationSettings },
      pile_legend: projectLegendToDocument(content.pileLegend),
      viewer: {
        symbol_scale_percent: content.symbolScalePercent,
        foreground_layer: content.foregroundLayer,
        show_grid: content.showGrid,
        show_tip_level_regions: content.showTipLevelRegions,
      },
    },
    user_state: {
      pile_plans: content.pilePlans.map(pilePlanToDocument),
      active_pile_plan_id: active?.id ?? "",
      manual_cpt_selections: Object.fromEntries(
        [...content.manualCptIdsByLoadPoint].map(([loadPointId, cptIds]) => [
          String(loadPointId),
          [...cptIds],
        ]),
      ),
    },
    active_selected_piles: Object.fromEntries(
      active?.selectedPileConfigurationsByLoadPoint ?? [],
    ),
    import_log: structuredClone(content.importLog) as ProjectDocumentDraft["import_log"],
  };
}

function cptSelectionSettingsToDocument(settings: CptSelectionSettings) {
  return {
    algorithm: settings.algorithm,
    max_distance_m: settings.maxDistanceM,
    monopoly_distance_m: settings.monopolyDistanceM,
    max_angle_degrees: settings.maxAngleDegrees,
  };
}

function pilePlanToDocument(plan: ProjectContent["pilePlans"][number]): IfcppPilePlan {
  return {
    id: plan.id,
    name: plan.name,
    active_pile_sizes: [...plan.activePileSizes],
    active_pile_tip_levels: plan.activePileTipLevelMms.map((value) => value / 1_000),
    selected_piles: Object.fromEntries(
      [...plan.selectedPileConfigurationsByLoadPoint].map(([loadPointId, pile]) => [
        String(loadPointId),
        {
          pile: {
            pile_size_mm: pile.pile_size_mm,
            pile_tip_level_m_key: pile.pile_tip_level_mm,
          },
          external_references: structuredClone(
            plan.externalReferencesByLoadPoint.get(loadPointId) ?? [],
          ),
        },
      ]),
    ),
    locked_load_point_ids: [...plan.lockedLoadPointIds],
    optimization_unassigned: Object.fromEntries(plan.optimizationUnassignedByLoadPoint),
  };
}

function projectLegendToDocument(legend: LegendItems): IfcppProjectLegend {
  const colorScheme = legend.encodingMode === "size-symbol"
    ? legend.pileTipLevelColorScheme
    : legend.pileSizeColorScheme;
  return {
    encoding_mode: legend.encodingMode,
    color_scheme: colorScheme,
    pile_size_color_scheme: legend.pileSizeColorScheme,
    pile_tip_level_color_scheme: legend.pileTipLevelColorScheme,
    pile_sizes: legend.pileSizes.map(legendValueToDocument),
    pile_tip_levels: legend.pileTipLevels.map((item) => legendValueToDocument({
      ...item,
      value: item.value / 1_000,
    })),
  };
}

function legendValueToDocument(item: LegendItems["pileSizes"][number]): IfcppLegendValueStyle {
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

function analysisInvalidation(
  before: ProjectContent,
  after: ProjectContent,
): AnalysisInvalidation {
  if (
    before.loadPoints !== after.loadPoints
    || before.cpts !== after.cpts
    || before.bearingCapacities !== after.bearingCapacities
    || before.globalCptSelectionSettings !== after.globalCptSelectionSettings
  ) {
    return "all";
  }

  const changedIds = new Set<number>();
  collectChangedMapKeys(
    before.cptSelectionSettingsByLoadPoint,
    after.cptSelectionSettingsByLoadPoint,
    changedIds,
  );
  collectChangedMapKeys(
    before.manualCptIdsByLoadPoint,
    after.manualCptIdsByLoadPoint,
    changedIds,
  );
  return changedIds.size === 0 ? "none" : [...changedIds].sort((left, right) => left - right);
}

function collectChangedMapKeys<T>(
  before: Map<number, T>,
  after: Map<number, T>,
  changedIds: Set<number>,
): void {
  if (before === after) return;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) !== after.get(key) || before.has(key) !== after.has(key)) {
      changedIds.add(key);
    }
  }
}
