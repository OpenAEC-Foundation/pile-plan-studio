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
  const settingsByLoadPoint = new Map(state.cptSelectionSettingsByLoadPoint);
  const manualCptIdsByLoadPoint = new Map(state.manualCptIdsByLoadPoint);

  if (scope === "all") {
    for (const loadPointId of targetIds) {
      if (!overwriteManualSelections && manualCptIdsByLoadPoint.has(loadPointId)) {
        if (!settingsByLoadPoint.has(loadPointId)) {
          settingsByLoadPoint.set(loadPointId, { ...getSettingsForLoadPoint(state, loadPointId) });
        }
      } else if (settingsByLoadPoint.has(loadPointId)) {
        settingsByLoadPoint.set(loadPointId, patchSettings(getSettingsForLoadPoint(state, loadPointId), patch));
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

export function beginManualCptSelection(state: ProjectState, _legacySelectedCptIds?: number[]): ProjectState {
  const loadPointIds = [...state.selectedLoadPointIds];
  if (loadPointIds.length === 0) {
    return state;
  }

  const cptIdsByLoadPoint = new Map<number, Set<number>>();
  for (const loadPointId of loadPointIds) {
    const cptIds = state.manualCptIdsByLoadPoint.has(loadPointId)
      ? state.manualCptIdsByLoadPoint.get(loadPointId) ?? []
      : (state.selectedCptsByLoadPointId.get(loadPointId) ?? []).map((selection) => selection.cpt.id);
    cptIdsByLoadPoint.set(loadPointId, new Set(cptIds));
  }

  return {
    ...state,
    cptSelectionEditDraft: {
      loadPointIds,
      cptIdsByLoadPoint,
    },
  };
}

export function startManualCptSelectionEdit(state: ProjectState): ProjectState {
  const editingState = beginManualCptSelection(state);
  return {
    ...editingState,
    rightPanelMode: "cpts",
    selectedCptId: null,
  };
}

export function toggleManualCpt(state: ProjectState, cptId: number): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }

  const removeFromAll = draft.loadPointIds.every((loadPointId) => draft.cptIdsByLoadPoint.get(loadPointId)?.has(cptId));
  return updateManualCptDraft(state, (cptIds) => {
    removeFromAll ? cptIds.delete(cptId) : cptIds.add(cptId);
  });
}

export function removeManualCpt(state: ProjectState, cptId: number): ProjectState {
  return updateManualCptDraft(state, (cptIds) => cptIds.delete(cptId));
}

export function selectOnlyNearestCpts(state: ProjectState): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }

  const cptIdsByLoadPoint = new Map<number, Set<number>>();
  for (const loadPointId of draft.loadPointIds) {
    const loadPoint = state.loadPoints.find((item) => item.id === loadPointId);
    const maxDistanceMm = getSettingsForLoadPoint(state, loadPointId).maxDistanceM * 1000;
    const nearestCpt = loadPoint
      ? state.cpts.reduce<typeof state.cpts[number] | null>((nearest, cpt) => {
        const distanceMm = Math.hypot(cpt.x_mm - loadPoint.x_mm, cpt.y_mm - loadPoint.y_mm);
        if (distanceMm > maxDistanceMm) {
          return nearest;
        }
        if (!nearest) {
          return cpt;
        }
        const nearestDistanceMm = Math.hypot(nearest.x_mm - loadPoint.x_mm, nearest.y_mm - loadPoint.y_mm);
        return distanceMm < nearestDistanceMm || (distanceMm === nearestDistanceMm && cpt.id < nearest.id)
          ? cpt
          : nearest;
      }, null)
      : null;
    cptIdsByLoadPoint.set(loadPointId, nearestCpt ? new Set([nearestCpt.id]) : new Set());
  }

  return {
    ...state,
    cptSelectionEditDraft: { ...draft, cptIdsByLoadPoint },
  };
}

export function saveManualCptSelection(state: ProjectState): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }
  const manualSelections = new Map(state.manualCptIdsByLoadPoint);
  for (const loadPointId of draft.loadPointIds) {
    manualSelections.set(loadPointId, [...(draft.cptIdsByLoadPoint.get(loadPointId) ?? new Set())].sort((left, right) => left - right));
  }
  return requestAnalysis({
    ...state,
    manualCptIdsByLoadPoint: manualSelections,
    cptSelectionEditDraft: null,
  }, draft.loadPointIds);
}

export function cancelManualCptSelection(state: ProjectState): ProjectState {
  return { ...state, cptSelectionEditDraft: null };
}

export function clearManualCptSelection(state: ProjectState): ProjectState {
  if (state.selectedLoadPointIds.length === 0) {
    return state;
  }
  const manualSelections = new Map(state.manualCptIdsByLoadPoint);
  state.selectedLoadPointIds.forEach((loadPointId) => manualSelections.delete(loadPointId));
  return requestAnalysis({
    ...state,
    manualCptIdsByLoadPoint: manualSelections,
    cptSelectionEditDraft: null,
  }, state.selectedLoadPointIds);
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

function updateManualCptDraft(
  state: ProjectState,
  update: (cptIds: Set<number>) => void,
): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }

  const cptIdsByLoadPoint = new Map<number, Set<number>>();
  for (const loadPointId of draft.loadPointIds) {
    const cptIds = new Set(draft.cptIdsByLoadPoint.get(loadPointId));
    update(cptIds);
    cptIdsByLoadPoint.set(loadPointId, cptIds);
  }
  return {
    ...state,
    cptSelectionEditDraft: { ...draft, cptIdsByLoadPoint },
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
