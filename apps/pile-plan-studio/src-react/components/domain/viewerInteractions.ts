import {
  addLoadPointsToSelection,
  clearSelection,
  openCpt,
  selectLoadPoint,
  type SelectionState,
} from "../../../src/selectionState.ts";
import type { LegendSelectionFilter } from "../../../src/legendSelection.ts";
import type { SelectedCpt } from "../../../src/projectTypes.ts";
import type { CptSelectionEditDraft } from "../../domain/projectState.ts";

type ReactViewerSelectionState = SelectionState & {
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
  return clearLegendSelection({ ...state, ...selectLoadPoint(state, loadPointId) });
}

export function toggleReactViewerLoadPoint(
  state: ReactViewerSelectionState,
  loadPointId: number,
): ReactViewerSelectionState {
  return clearLegendSelection({ ...state, ...addLoadPointsToSelection(state, [loadPointId], { toggle: true }) });
}

export function addReactViewerLoadPoints(
  state: ReactViewerSelectionState,
  loadPointIds: number[],
): ReactViewerSelectionState {
  return clearLegendSelection({ ...state, ...addLoadPointsToSelection(state, loadPointIds) });
}

export function clearReactViewerSelection(state: ReactViewerSelectionState): ReactViewerSelectionState {
  return clearLegendSelection({ ...state, ...clearSelection(state) });
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
  const draft = state.cptSelectionEditDraft;
  if (draft && state.selectedLoadPointIds.includes(draft.loadPointId)) {
    return [...draft.cptIds].sort((left, right) => left - right);
  }

  const selectedIds = new Set<number>();

  state.selectedLoadPointIds.forEach((loadPointId) => {
    (state.selectedCptsByLoadPointId.get(loadPointId) ?? []).forEach((selection) => {
      selectedIds.add(selection.cpt.id);
    });
  });

  if (state.selectedCptId !== null) {
    selectedIds.add(state.selectedCptId);
  }

  return [...selectedIds].sort((left, right) => left - right);
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
