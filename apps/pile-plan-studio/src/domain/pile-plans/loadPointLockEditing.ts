import type { ProjectState } from "../project/projectState.ts";
import { applyLoadPointLockDraft, getActiveLockedLoadPointIds, startLoadPointLockDraft } from "./loadPointLocking.ts";

export function beginLoadPointLockEditing(state: ProjectState): ProjectState {
  return {
    ...state,
    cptSelectionEditDraft: null,
    loadPointLockDraft: startLoadPointLockDraft(state.pilePlans, state.activePilePlanId, state.selectedLoadPointIds),
    loadPointLockSelectionSnapshot: {
      selectedLoadPointIds: [...state.selectedLoadPointIds],
      selectedLoadPointId: state.selectedLoadPointId,
      selectedCptId: state.selectedCptId,
    },
    selectedLoadPointIds: [],
    selectedLoadPointId: null,
    selectedCptId: null,
  };
}

export function cancelLoadPointLockEditing(state: ProjectState): ProjectState {
  const snapshot = state.loadPointLockSelectionSnapshot;
  if (snapshot === null) return { ...state, loadPointLockDraft: null };
  return {
    ...state,
    loadPointLockDraft: null,
    loadPointLockSelectionSnapshot: null,
    selectedLoadPointIds: snapshot.selectedLoadPointIds,
    selectedLoadPointId: snapshot.selectedLoadPointId,
    selectedCptId: snapshot.selectedCptId,
  };
}

export function clearLoadPointLockDraft(state: ProjectState): ProjectState {
  return state.loadPointLockDraft === null ? state : { ...state, loadPointLockDraft: new Set() };
}

export function finishLoadPointLockEditing(state: ProjectState): ProjectState {
  const draft = state.loadPointLockDraft;
  if (draft === null) return state;
  const previous = getActiveLockedLoadPointIds(state.pilePlans, state.activePilePlanId);
  const changed = previous.length !== draft.size || previous.some(id => !draft.has(id));
  if (!changed) {
    return { ...state, loadPointLockDraft: null, loadPointLockSelectionSnapshot: null };
  }
  const selectedLoadPointIds = state.selectedLoadPointIds.filter(id => !draft.has(id));
  const selectedLoadPointId = selectedLoadPointIds.includes(state.selectedLoadPointId ?? -1)
    ? state.selectedLoadPointId : selectedLoadPointIds[0] ?? null;
  return {
    ...state,
    pilePlans: applyLoadPointLockDraft(state.pilePlans, state.activePilePlanId, draft),
    loadPointLockDraft: null,
    loadPointLockSelectionSnapshot: null,
    selectedLoadPointIds,
    selectedLoadPointId,
    selectedCptId: null,
  };
}
