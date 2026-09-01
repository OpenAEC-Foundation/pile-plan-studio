import { createEmptyPileOptionFilters, type PileOptionFilterState } from "./pileOptionTable.ts";
import type { PileOptionSortState } from "./pileOptionTable.ts";
import { loadIfcppProjectData, type IfcppProject, type LoadedProjectData } from ".././core/projectFile.ts";
import type { RightPanelMode } from ".././domain/selectionState.ts";
import { getProjectBounds } from "../viewer/viewerGeometry.ts";
import type {
  CptBearingCapacityRow,
  PileConfigurationOption,
  ProjectBounds,
  SelectedCpt,
} from ".././core/projectTypes.ts";
import type { Viewport } from "../viewer/viewport.ts";
import type { LegendSelectionFilter } from "../viewer/legendSelection.ts";
import type { OptimizationRunSummary } from "./optimizationSummary.ts";
import type { OptimizationLimitScope, OptimizationTargetScope } from "../components/domain/optimizationPanelModel.ts";
import type { ForegroundLayer } from "./viewerPreferences.ts";
import type { LoadPointLockDraft } from "./loadPointLocking.ts";

export type InputSourceKind = "load_points" | "cpts" | "bearing_capacities";
export type InputSourceStatus = "snapshot-only" | "linked" | "missing" | "changed";

export type InputSource = {
  kind: InputSourceKind;
  label: string;
  status: InputSourceStatus;
  itemCount: number;
  fileName: string | null;
  profile: string | null;
  warnings: string[];
};

export type CptSettingsScope = "all" | "selected";

export type CptSelectionEditDraft = {
  loadPointIds: number[];
  cptIdsByLoadPoint: Map<number, Set<number>>;
};

export type CptSelectionPreview =
  | { draft: CptSelectionEditDraft; status: "analyzing" }
  | { draft: CptSelectionEditDraft; status: "failed"; error: string }
  | {
      draft: CptSelectionEditDraft;
      status: "ready";
      pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
    };

export type LoadPointLockSelectionSnapshot = {
  selectedLoadPointIds: number[];
  selectedLoadPointId: number | null;
  selectedCptId: number | null;
};

export type AnalysisRequest = {
  revision: number;
  loadPointIds: number[] | null;
};

export type ProjectState = LoadedProjectData & {
  bounds: ProjectBounds;
  inputSources: InputSource[];
  selectedLoadPointId: number | null;
  selectedLoadPointIds: number[];
  selectedCptId: number | null;
  rightPanelMode: RightPanelMode;
  viewport: Viewport;
  pileOptionFilters: PileOptionFilterState;
  pileOptionSort: PileOptionSortState;
  pileOptionsByLoadPointId: Map<number, PileConfigurationOption[]>;
  pileCostByOptionKey: Map<string, number | null>;
  selectedCptsByLoadPointId: Map<number, SelectedCpt[]>;
  cptFrdRowsByCptId: Map<number, CptBearingCapacityRow[]>;
  cptSettingsScope: CptSettingsScope;
  cptSelectionEditDraft: CptSelectionEditDraft | null;
  cptSelectionPreview?: CptSelectionPreview | null;
  loadPointLockDraft: LoadPointLockDraft | null;
  loadPointLockSelectionSnapshot: LoadPointLockSelectionSnapshot | null;
  analysisRequest: AnalysisRequest;
  analysisError: string | null;
  defaultPileSelectionPending: boolean;
  legendSelectionFilter: LegendSelectionFilter;
  optimizationTargetScope: OptimizationTargetScope;
  optimizationLimitScope: OptimizationLimitScope;
  optimizationCreatesPilePlan: boolean;
  optimizationRunning: boolean;
  optimizationError: string | null;
  optimizationSummary: OptimizationRunSummary | null;
  symbolScalePercent: number;
  foregroundLayer: ForegroundLayer;
  showGrid: boolean;
};

type InitialProjectStateOptions = {
  initializeDefaultPiles: boolean;
  defaultPilePlanName?: string;
};

export function createInitialProjectState(
  input: string | IfcppProject,
  options: InitialProjectStateOptions,
): ProjectState {
  const projectData = loadIfcppProjectData(input);
  const pilePlans = options.defaultPilePlanName && projectData.pilePlans.length === 1
    ? [{ ...projectData.pilePlans[0], name: options.defaultPilePlanName }]
    : projectData.pilePlans;
  const activePilePlan = pilePlans.find((plan) => plan.id === projectData.activePilePlanId) ?? pilePlans[0];
  const lockedLoadPointIds = new Set(activePilePlan?.lockedLoadPointIds ?? []);
  const firstLoadPointId = projectData.loadPoints.find((loadPoint) => !lockedLoadPointIds.has(loadPoint.id))?.id ?? null;

  return {
    ...projectData,
    pilePlans,
    bounds: getProjectBounds(projectData.loadPoints, projectData.cpts),
    inputSources: [
      sourceSummary(projectData, {
        kind: "load_points",
        label: "Load points",
        itemCount: projectData.loadPoints.length,
      }),
      sourceSummary(projectData, {
        kind: "cpts",
        label: "CPTs",
        itemCount: projectData.cpts.length,
      }),
      sourceSummary(projectData, {
        kind: "bearing_capacities",
        label: "Bearing capacities",
        itemCount: projectData.bearingCapacities.length,
      }),
    ],
    selectedLoadPointId: firstLoadPointId,
    selectedLoadPointIds: firstLoadPointId === null ? [] : [firstLoadPointId],
    selectedCptId: null,
    rightPanelMode: "load-point",
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    pileOptionFilters: createEmptyPileOptionFilters(),
    pileOptionSort: null,
    pileOptionsByLoadPointId: new Map(),
    pileCostByOptionKey: new Map(),
    selectedCptsByLoadPointId: new Map(),
    cptFrdRowsByCptId: new Map(),
    cptSettingsScope: firstLoadPointId === null ? "all" : "selected",
    cptSelectionEditDraft: null,
    cptSelectionPreview: null,
    loadPointLockDraft: null,
    loadPointLockSelectionSnapshot: null,
    analysisRequest: { revision: 0, loadPointIds: null },
    analysisError: null,
    defaultPileSelectionPending: options.initializeDefaultPiles,
    legendSelectionFilter: { pileSizes: [], pileTipLevels: [] },
    optimizationTargetScope: "all",
    optimizationLimitScope: "target",
    optimizationCreatesPilePlan: true,
    optimizationRunning: false,
    optimizationError: null,
    optimizationSummary: null,
  };
}

function sourceSummary(
  project: LoadedProjectData,
  source: Pick<InputSource, "kind" | "label" | "itemCount">,
): InputSource {
  const entries = project.importLog.filter((entry) => entry.source_role === source.kind);
  const latest = entries[entries.length - 1];
  return {
    ...source,
    status: "snapshot-only",
    fileName: latest?.source_file ?? null,
    profile: latest?.source_profile ?? null,
    warnings: entries.flatMap((entry) => entry.warnings ?? []),
  };
}

export function transitionCptSettingsScope(
  scope: CptSettingsScope,
  previousSelectedLoadPointIds: number[],
  selectedLoadPointIds: number[],
): CptSettingsScope {
  if (selectedLoadPointIds.length === 0) {
    return "all";
  }
  if (previousSelectedLoadPointIds.length === 0) {
    return "selected";
  }
  return scope;
}
