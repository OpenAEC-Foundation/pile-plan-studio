import {
  addLoadPointsToSelection,
  clearSelection,
  openCpt,
  selectLoadPoint,
  type SelectionState,
} from "../.././domain/selectionState.ts";
import type { LegendSelectionFilter } from "../../viewer/legendSelection.ts";
import type { SelectedCpt } from "../.././core/projectTypes.ts";
import {
  transitionCptSettingsScope,
  type CptSelectionEditDraft,
  type ProjectState,
} from "../../domain/projectState.ts";

type ReactViewerSelectionState = SelectionState & Pick<ProjectState, "cptSettingsScope"> & {
  legendSelectionFilter: LegendSelectionFilter;
};

const EMPTY_LEGEND_SELECTION_FILTER: LegendSelectionFilter = {
  pileSizes: [],
  pileTipLevels: [],
};

export function selectReactViewerLoadPoint(
  state: ReactViewerSelectionState,
  loadPointId: number,
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(state, selectLoadPoint(state, loadPointId)));
}

export function toggleReactViewerLoadPoint(
  state: ReactViewerSelectionState,
  loadPointId: number,
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(
    state,
    addLoadPointsToSelection(state, [loadPointId], { toggle: true }),
  ));
}

export function addReactViewerLoadPoints(
  state: ReactViewerSelectionState,
  loadPointIds: number[],
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(state, addLoadPointsToSelection(state, loadPointIds)));
}

export function clearReactViewerSelection(state: ReactViewerSelectionState): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(state, clearSelection(state)));
}

export function openReactViewerCpt(state: ReactViewerSelectionState, cptId: number): ReactViewerSelectionState {
  return clearLegendSelection({ ...state, ...openCpt(state, cptId) });
}

export function getReactViewerSelectedCptIds(state: {
  cptSelectionEditDraft?: CptSelectionEditDraft | null;
  selectedCptId: number | null;
  selectedLoadPointIds: number[];
  selectedCptsByLoadPointId: Map<number, SelectedCpt[]>;
}): number[] {
  const selectedIds = new Set(getReactViewerContextCptIds(state));

  if (state.selectedCptId !== null) {
    selectedIds.add(state.selectedCptId);
  }

  return [...selectedIds].sort((left, right) => left - right);
}

export function getReactViewerContextCptIds(state: {
  cptSelectionEditDraft?: CptSelectionEditDraft | null;
  selectedLoadPointIds: number[];
  selectedCptsByLoadPointId: Map<number, SelectedCpt[]>;
}): number[] {
  const draft = state.cptSelectionEditDraft;
  if (draft) {
    const draftCptIds = new Set<number>();
    draft.loadPointIds.forEach((loadPointId) => {
      (draft.cptIdsByLoadPoint.get(loadPointId) ?? new Set()).forEach((cptId) => draftCptIds.add(cptId));
    });
    return [...draftCptIds].sort((left, right) => left - right);
  }

  const selectedIds = new Set<number>();

  state.selectedLoadPointIds.forEach((loadPointId) => {
    (state.selectedCptsByLoadPointId.get(loadPointId) ?? []).forEach((selection) => {
      selectedIds.add(selection.cpt.id);
    });
  });

  return [...selectedIds].sort((left, right) => left - right);
}

export function isReactViewerCptSelectionEditing(state: {
  cptSelectionEditDraft?: CptSelectionEditDraft | null;
}): boolean {
  return state.cptSelectionEditDraft !== null && state.cptSelectionEditDraft !== undefined;
}

export type ViewerSelectionAction = "cpt" | "load-point" | "background" | "lasso";

export function isViewerSelectionActionAllowed(
  isEditingCptSelection: boolean,
  action: ViewerSelectionAction,
): boolean {
  return !isEditingCptSelection || action === "cpt";
}

export function clearLegendSelection<T extends ReactViewerSelectionState>(state: T): T {
  return {
    ...state,
    legendSelectionFilter: EMPTY_LEGEND_SELECTION_FILTER,
  };
}

export function shouldClearLegendSelectionFromPointerTarget(target: Element): boolean {
  return target.closest(".legend-item") === null;
}

export function shouldRaiseCptMarker(isSelected: boolean, isEditing: boolean): boolean {
  return isSelected || isEditing;
}

function applySelectionTransition(
  state: ReactViewerSelectionState,
  selection: SelectionState,
): ReactViewerSelectionState {
  return {
    ...state,
    ...selection,
    cptSettingsScope: transitionCptSettingsScope(
      state.cptSettingsScope,
      state.selectedLoadPointIds,
      selection.selectedLoadPointIds,
    ),
  };
}
