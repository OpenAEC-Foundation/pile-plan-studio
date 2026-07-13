import type { ProjectState } from "../../domain/projectState.ts";
import type { CptSelectionSettings } from "../.././core/projectTypes.ts";

export function getActiveCptSelectionSettings(state: ProjectState): CptSelectionSettings {
  const loadPointId = state.selectedLoadPointId;
  if (state.cptSettingsScope === "current" && loadPointId !== null) {
    return state.cptSelectionSettingsByLoadPoint.get(loadPointId) ?? state.globalCptSelectionSettings;
  }
  return state.globalCptSelectionSettings;
}

export function applyCptSelectionSettings(
  state: ProjectState,
  settings: CptSelectionSettings,
): ProjectState {
  if (state.cptSettingsScope === "current" && state.selectedLoadPointId !== null) {
    const settingsByLoadPoint = new Map(state.cptSelectionSettingsByLoadPoint);
    settingsByLoadPoint.set(state.selectedLoadPointId, settings);
    return requestAnalysis({ ...state, cptSelectionSettingsByLoadPoint: settingsByLoadPoint }, [state.selectedLoadPointId]);
  }

  return requestAnalysis({ ...state, globalCptSelectionSettings: settings }, null);
}

export function beginManualCptSelection(state: ProjectState, selectedCptIds: number[]): ProjectState {
  if (state.selectedLoadPointId === null) {
    return state;
  }
  return {
    ...state,
    cptSelectionEditDraft: {
      loadPointId: state.selectedLoadPointId,
      cptIds: new Set(selectedCptIds),
    },
  };
}

export function toggleManualCpt(state: ProjectState, cptId: number): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft || draft.loadPointId !== state.selectedLoadPointId) {
    return state;
  }
  const cptIds = new Set(draft.cptIds);
  cptIds.has(cptId) ? cptIds.delete(cptId) : cptIds.add(cptId);
  return { ...state, cptSelectionEditDraft: { ...draft, cptIds } };
}

export function saveManualCptSelection(state: ProjectState): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft || draft.loadPointId !== state.selectedLoadPointId) {
    return state;
  }
  const manualSelections = new Map(state.manualCptIdsByLoadPoint);
  manualSelections.set(draft.loadPointId, [...draft.cptIds].sort((left, right) => left - right));
  return requestAnalysis({
    ...state,
    manualCptIdsByLoadPoint: manualSelections,
    cptSelectionEditDraft: null,
  }, [draft.loadPointId]);
}

export function cancelManualCptSelection(state: ProjectState): ProjectState {
  return { ...state, cptSelectionEditDraft: null };
}

export function clearManualCptSelection(state: ProjectState): ProjectState {
  if (state.selectedLoadPointId === null) {
    return state;
  }
  const manualSelections = new Map(state.manualCptIdsByLoadPoint);
  manualSelections.delete(state.selectedLoadPointId);
  return requestAnalysis({
    ...state,
    manualCptIdsByLoadPoint: manualSelections,
    cptSelectionEditDraft: null,
  }, [state.selectedLoadPointId]);
}

function requestAnalysis(state: ProjectState, loadPointIds: number[] | null): ProjectState {
  return {
    ...state,
    analysisRequest: {
      revision: state.analysisRequest.revision + 1,
      loadPointIds,
    },
  };
}
