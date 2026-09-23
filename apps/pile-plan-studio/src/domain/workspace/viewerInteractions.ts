import {
  addLoadPointsToSelection,
  clearSelection,
  openCpt,
  selectLoadPoint,
  setLoadPointSelection,
  type SelectionState,
} from "./selectionState.ts";
import type { LegendSelectionFilter } from "../../viewer/legendSelection.ts";
import type { SelectedCpt } from "../.././core/projectTypes.ts";
import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import { expandSelectionToGroups } from "../../viewer/loadPointGroupSelection.ts";
import {
  transitionCptSettingsScope,
  type CptSelectionEditDraft,
  type ProjectState,
} from "../project/projectState.ts";

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
  groups: LoadPointGroup[] = [],
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(
    state,
    setLoadPointSelection(state, expandSelectionToGroups([loadPointId], groups)),
  ));
}

export function selectSingleLoadPointForInspection(
  state: ReactViewerSelectionState,
  loadPointId: number,
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(state, selectLoadPoint(state, loadPointId)));
}

export function toggleReactViewerLoadPoint(
  state: ReactViewerSelectionState,
  loadPointId: number,
  groups: LoadPointGroup[] = [],
): ReactViewerSelectionState {
  const involvedIds = expandSelectionToGroups([loadPointId], groups);
  const selected = new Set(state.selectedLoadPointIds);
  const nextIds = involvedIds.every((id) => selected.has(id))
    ? state.selectedLoadPointIds.filter((id) => !involvedIds.includes(id))
    : [...state.selectedLoadPointIds, ...involvedIds];
  return clearLegendSelection(applySelectionTransition(
    state,
    setLoadPointSelection(state, nextIds),
  ));
}

export function addReactViewerLoadPoints(
  state: ReactViewerSelectionState,
  loadPointIds: number[],
  groups: LoadPointGroup[] = [],
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(
    state,
    addLoadPointsToSelection(state, expandSelectionToGroups(loadPointIds, groups)),
  ));
}

export function setReactViewerLoadPoints(
  state: ReactViewerSelectionState,
  loadPointIds: number[],
  groups: LoadPointGroup[] = [],
): ReactViewerSelectionState {
  return clearLegendSelection(applySelectionTransition(
    state,
    setLoadPointSelection(state, expandSelectionToGroups(loadPointIds, groups)),
  ));
}

export function expandInitialReactViewerLoadPointGroup(
  state: ReactViewerSelectionState,
  initialLoadPointId: number | null,
  groups: LoadPointGroup[],
): ReactViewerSelectionState {
  if (
    initialLoadPointId === null
    || state.selectedLoadPointId !== initialLoadPointId
    || state.selectedLoadPointIds.length !== 1
    || state.selectedLoadPointIds[0] !== initialLoadPointId
  ) {
    return state;
  }
  const expandedIds = expandSelectionToGroups([initialLoadPointId], groups);
  return expandedIds.length > 1
    ? setReactViewerLoadPoints(state, expandedIds, groups)
    : state;
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
  return target.closest(".legend-item") === null
    && target.closest(".legend-control") === null
    && target.closest(".legend-editor-dialog") === null;
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
