import type { LoadPoint } from "../../core/projectTypes.ts";

export type LoadPointSelectionContext = { loadPoints: readonly LoadPoint[]; ids: number[] };

export type RightPanelMode = "load-point" | "cpts" | "combined" | "cpt-settings" | "cost-settings";

export type SelectionState = {
  selectedLoadPointId: number | null;
  selectedLoadPointIds: number[];
  loadPointSelectionContext?: LoadPointSelectionContext;
  selectedCptId: number | null;
  rightPanelMode: RightPanelMode;
};

export function switchRightPanelMode(state: SelectionState, rightPanelMode: RightPanelMode): SelectionState {
  return {
    ...state,
    selectedCptId: rightPanelMode === "cpts" || rightPanelMode === "combined" ? state.selectedCptId : null,
    rightPanelMode,
  };
}

export function selectLoadPoint(state: SelectionState, loadPointId: number): SelectionState {
  return {
    ...clearedInspectionContext(state),
    selectedLoadPointId: loadPointId,
    selectedLoadPointIds: [loadPointId],
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

export function addLoadPointsToSelection(
  state: SelectionState,
  loadPointIds: number[],
  options: { toggle?: boolean } = {},
): SelectionState {
  const selected = new Set(state.selectedLoadPointIds);

  loadPointIds.forEach((loadPointId) => {
    if (options.toggle && selected.has(loadPointId)) {
      selected.delete(loadPointId);
    } else {
      selected.add(loadPointId);
    }
  });

  const selectedLoadPointIds = [...selected];
  const selectedLoadPointId = selected.has(state.selectedLoadPointId ?? -1)
    ? state.selectedLoadPointId
    : selectedLoadPointIds[0] ?? null;

  return {
    ...clearedInspectionContext(state),
    selectedLoadPointId,
    selectedLoadPointIds,
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

export function setLoadPointSelection(
  state: SelectionState,
  loadPointIds: number[],
  options: { context?: LoadPointSelectionContext } = {},
): SelectionState {
  const selectedLoadPointIds = [...new Set(loadPointIds)];
  return {
    ...clearedInspectionContext(state),
    ...(options.context ? { loadPointSelectionContext: options.context } : {}),
    selectedLoadPointId: selectedLoadPointIds[0] ?? null,
    selectedLoadPointIds,
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

export function clearSelection(state: SelectionState): SelectionState {
  return {
    ...state,
    ...clearedInspectionContext(state),
    selectedLoadPointId: null,
    selectedLoadPointIds: [],
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

function clearedInspectionContext(state: SelectionState): Pick<SelectionState, "loadPointSelectionContext"> {
  return state.loadPointSelectionContext === undefined ? {} : { loadPointSelectionContext: undefined };
}

export function openCpt(state: SelectionState, cptId: number): SelectionState {
  return {
    ...state,
    selectedCptId: cptId,
    rightPanelMode: state.rightPanelMode === "combined" ? "combined" : "cpts",
  };
}
