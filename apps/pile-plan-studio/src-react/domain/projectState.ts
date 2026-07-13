import { createEmptyPileOptionFilters, type PileOptionFilterState } from "../../src/pileOptionTable.ts";
import type { PileOptionSortState } from "../../src/pileOptionTable.ts";
import { loadIfcppProjectData, type IfcppProject, type LoadedProjectData } from "../../src/projectFile.ts";
import type { RightPanelMode } from "../../src/selectionState.ts";
import { getProjectBounds } from "../../src/viewerGeometry.ts";
import type {
  CptBearingCapacityRow,
  PileConfigurationOption,
  ProjectBounds,
  SelectedCpt,
} from "../../src/projectTypes.ts";
import type { Viewport } from "../../src/viewport.ts";
import type { LegendSelectionFilter } from "../../src/legendSelection.ts";

export type InputSourceKind = "load_points" | "cpts" | "bearing_capacities";
export type InputSourceStatus = "snapshot-only" | "linked" | "missing" | "changed";

export type InputSource = {
  kind: InputSourceKind;
  label: string;
  status: InputSourceStatus;
  itemCount: number;
};

export type CptSettingsScope = "all" | "current";

export type CptSelectionEditDraft = {
  loadPointId: number;
  cptIds: Set<number>;
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
  analysisRequest: AnalysisRequest;
  analysisError: string | null;
  defaultPileSelectionPending: boolean;
  legendSelectionFilter: LegendSelectionFilter;
};

type InitialProjectStateOptions = {
  initializeDefaultPiles: boolean;
};

export function createInitialProjectState(
  input: string | IfcppProject,
  options: InitialProjectStateOptions,
): ProjectState {
  const projectData = loadIfcppProjectData(input);
  const firstLoadPointId = projectData.loadPoints[0]?.id ?? null;

  return {
    ...projectData,
    bounds: getProjectBounds(projectData.loadPoints, projectData.cpts),
    inputSources: [
      {
        kind: "load_points",
        label: "Load points",
        status: "snapshot-only",
        itemCount: projectData.loadPoints.length,
      },
      {
        kind: "cpts",
        label: "CPTs",
        status: "snapshot-only",
        itemCount: projectData.cpts.length,
      },
      {
        kind: "bearing_capacities",
        label: "Bearing capacities",
        status: "snapshot-only",
        itemCount: projectData.bearingCapacities.length,
      },
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
    cptSettingsScope: "all",
    cptSelectionEditDraft: null,
    analysisRequest: { revision: 0, loadPointIds: null },
    analysisError: null,
    defaultPileSelectionPending: options.initializeDefaultPiles,
    legendSelectionFilter: { pileSizes: [], pileTipLevels: [] },
  };
}
