import type { IfcppProject } from "../core/projectFile.ts";
import { createIfcppProject } from "../core/projectFile.ts";
import { getProjectBounds } from "../viewer/viewerGeometry.ts";
import type { ProjectState } from "./projectState.ts";

export type ProjectContent = Pick<ProjectState,
  | "name"
  | "loadPoints"
  | "cpts"
  | "bearingCapacities"
  | "globalCptSelectionSettings"
  | "cptSelectionSettingsByLoadPoint"
  | "pileCostSettings"
  | "optimizationSettings"
  | "viewerUtilizationSettings"
  | "activePileSizes"
  | "activePileTipLevels"
  | "pileLegend"
  | "pilePlans"
  | "manualCptIdsByLoadPoint"
>;

export type AnalysisInvalidation = "none" | "all" | number[];

export type RestoredProjectContent = {
  state: ProjectState;
  analysisScope: AnalysisInvalidation;
};

const PROJECT_CONTENT_KEYS = [
  "name",
  "loadPoints",
  "cpts",
  "bearingCapacities",
  "globalCptSelectionSettings",
  "cptSelectionSettingsByLoadPoint",
  "pileCostSettings",
  "optimizationSettings",
  "viewerUtilizationSettings",
  "activePileSizes",
  "activePileTipLevels",
  "pileLegend",
  "pilePlans",
  "manualCptIdsByLoadPoint",
] as const satisfies readonly (keyof ProjectContent)[];

export function normalizeProjectContentState(state: ProjectState): ProjectState {
  const active = state.pilePlans.find((plan) => plan.id === state.activePilePlanId);
  if (!active || active.selectedPileOptionKeysByLoadPoint === state.selectedPileOptionKeysByLoadPoint) {
    return state;
  }

  return {
    ...state,
    pilePlans: state.pilePlans.map((plan) => plan.id === state.activePilePlanId
      ? { ...plan, selectedPileOptionKeysByLoadPoint: state.selectedPileOptionKeysByLoadPoint }
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
      selectedPileOptionKeysByLoadPoint: active?.selectedPileOptionKeysByLoadPoint ?? new Map(),
      selectedLoadPointIds,
      selectedLoadPointId,
      selectedCptId: current.selectedCptId !== null && validCptIds.has(current.selectedCptId)
        ? current.selectedCptId
        : null,
    },
    analysisScope,
  };
}

export function projectFromContent(
  content: ProjectContent,
  activePilePlanId: string,
): IfcppProject {
  const active = content.pilePlans.find((plan) => plan.id === activePilePlanId)
    ?? content.pilePlans[0];
  return createIfcppProject({
    ...content,
    activePilePlanId: active?.id,
    selectedPileOptionKeysByLoadPoint: active?.selectedPileOptionKeysByLoadPoint ?? new Map(),
  });
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
