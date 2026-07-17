import type { CptSettingsScope, ProjectState } from "../../domain/projectState.ts";
import type { CptSelectionSettings } from "../.././core/projectTypes.ts";

export type CptSelectionSettingsPatch = Partial<CptSelectionSettings>;

export type CptSelectionSettingsAggregate = {
  [K in keyof CptSelectionSettings]: CptSelectionSettings[K] | null;
};

export function getActiveCptSelectionSettings(state: ProjectState): CptSelectionSettings {
  const loadPointId = state.selectedLoadPointId;
  if (state.cptSettingsScope === "selected" && loadPointId !== null) {
    return state.cptSelectionSettingsByLoadPoint.get(loadPointId) ?? state.globalCptSelectionSettings;
  }
  return state.globalCptSelectionSettings;
}

export function getCptSelectionSettingsAggregate(state: ProjectState): CptSelectionSettingsAggregate {
  const targetIds = getTargetLoadPointIds(state, resolveCptSettingsScope(state));
  const settings = targetIds.map((loadPointId) => getSettingsForLoadPoint(state, loadPointId));
  return {
    algorithm: getCommonValue(settings, "algorithm"),
    maxDistanceM: getCommonValue(settings, "maxDistanceM"),
    monopolyDistanceM: getCommonValue(settings, "monopolyDistanceM"),
    maxAngleDegrees: getCommonValue(settings, "maxAngleDegrees"),
  };
}

export function applyCptSelectionSettings(
  state: ProjectState,
  settings: CptSelectionSettings,
): ProjectState {
  return applyCptSelectionSettingsPatch(state, settings);
}

export function applyCptSelectionSettingsPatch(
  state: ProjectState,
  patch: CptSelectionSettingsPatch,
  overwriteManualSelections = false,
): ProjectState {
  const scope = resolveCptSettingsScope(state);
  const targetIds = getTargetLoadPointIds(state, scope);
  const targetIdSet = new Set(targetIds);
  const settingsByLoadPoint = new Map(state.cptSelectionSettingsByLoadPoint);
  const manualCptIdsByLoadPoint = new Map(state.manualCptIdsByLoadPoint);

  if (scope === "all") {
    for (const [loadPointId, settings] of settingsByLoadPoint) {
      if (targetIdSet.has(loadPointId) && (overwriteManualSelections || !manualCptIdsByLoadPoint.has(loadPointId))) {
        settingsByLoadPoint.set(loadPointId, patchSettings(settings, patch));
      }
    }
  } else {
    for (const loadPointId of targetIds) {
      if (overwriteManualSelections || !manualCptIdsByLoadPoint.has(loadPointId)) {
        settingsByLoadPoint.set(loadPointId, patchSettings(getSettingsForLoadPoint(state, loadPointId), patch));
      }
    }
  }

  if (overwriteManualSelections) {
    for (const loadPointId of targetIds) {
      manualCptIdsByLoadPoint.delete(loadPointId);
    }
  }

  const nextState: ProjectState = {
    ...state,
    cptSettingsScope: scope,
    cptSelectionSettingsByLoadPoint: settingsByLoadPoint,
    globalCptSelectionSettings: scope === "all"
      ? patchSettings(state.globalCptSelectionSettings, patch)
      : state.globalCptSelectionSettings,
    manualCptIdsByLoadPoint,
  };
  return requestAnalysis(nextState, scope === "all" ? null : targetIds);
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

function resolveCptSettingsScope(state: ProjectState): CptSettingsScope {
  return state.selectedLoadPointIds.length === 0 ? "all" : state.cptSettingsScope;
}

function getTargetLoadPointIds(state: ProjectState, scope: CptSettingsScope): number[] {
  return scope === "all"
    ? state.loadPoints.map((loadPoint) => loadPoint.id)
    : state.selectedLoadPointIds;
}

function getSettingsForLoadPoint(state: ProjectState, loadPointId: number): CptSelectionSettings {
  return state.cptSelectionSettingsByLoadPoint.get(loadPointId) ?? state.globalCptSelectionSettings;
}

function patchSettings(settings: CptSelectionSettings, patch: CptSelectionSettingsPatch): CptSelectionSettings {
  return { ...settings, ...patch };
}

function getCommonValue<K extends keyof CptSelectionSettings>(
  settings: CptSelectionSettings[],
  field: K,
): CptSelectionSettings[K] | null {
  const firstValue = settings[0]?.[field];
  return settings.every((value) => value[field] === firstValue) ? firstValue ?? null : null;
}
