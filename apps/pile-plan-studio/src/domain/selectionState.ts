export type RightPanelMode = "load-point" | "cpts" | "cpt-settings" | "cost-settings" | "optimization-settings";

export type SelectionState = {
  selectedLoadPointId: number | null;
  selectedLoadPointIds: number[];
  selectedCptId: number | null;
  rightPanelMode: RightPanelMode;
};

export function returnToLoadPoint(state: SelectionState): SelectionState {
  return switchRightPanelMode(state, "load-point");
}

export function switchRightPanelMode(state: SelectionState, rightPanelMode: RightPanelMode): SelectionState {
  return {
    ...state,
    selectedCptId: rightPanelMode === "cpts" ? state.selectedCptId : null,
    rightPanelMode,
  };
}

export function selectLoadPoint(state: SelectionState, loadPointId: number): SelectionState {
  return {
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
    selectedLoadPointId,
    selectedLoadPointIds,
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

export function clearSelection(state: SelectionState): SelectionState {
  return {
    ...state,
    selectedLoadPointId: null,
    selectedLoadPointIds: [],
    selectedCptId: null,
    rightPanelMode: state.rightPanelMode,
  };
}

export function openCpt(state: SelectionState, cptId: number): SelectionState {
  return {
    ...state,
    selectedCptId: cptId,
    rightPanelMode: "cpts",
  };
}
