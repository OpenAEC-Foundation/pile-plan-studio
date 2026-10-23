import type { CptSelectionEditDraft, CptSettingsScope, ProjectState } from "../project/projectState.ts";
import type { CptSelectionSettings, PileConfigurationOption, PileOptionAnalysisResult } from "../.././core/projectTypes.ts";
import type { CptSettingsEditResult } from "../../core/settingsEditCoreClient.ts";
import { setLoadPointSelection } from "../workspace/selectionState.ts";

export type CptSelectionSettingsPatch = Partial<CptSelectionSettings>;

export function applyValidatedCptSettingsEdit(
  state: ProjectState,
  result: Extract<CptSettingsEditResult, { status: "applied" }>,
): ProjectState {
  if (!result.changed) return state;
  return requestAnalysis({
    ...state,
    globalCptSelectionSettings: result.globalSettings,
    cptSelectionSettingsByLoadPoint: new Map(result.settingsByLoadPoint),
    manualCptIdsByLoadPoint: new Map(result.manualCptIdsByLoadPoint),
  }, result.globalChanged ? null : result.changedLoadPointIds);
}

export type CptSelectionSettingsAggregate = {
  [K in keyof CptSelectionSettings]: CptSelectionSettings[K] | null;
};

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
      if (settingsByLoadPoint.has(loadPointId)) {
        settingsByLoadPoint.set(loadPointId, patchSettings(getSettingsForLoadPoint(state, loadPointId), patch));
      }
    }
  } else {
    for (const loadPointId of targetIds) {
      settingsByLoadPoint.set(loadPointId, patchSettings(getSettingsForLoadPoint(state, loadPointId), patch));
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
      initialCptIdsByLoadPoint: new Map([...cptIdsByLoadPoint].map(([id, ids]) => [id, new Set(ids)])),
      automaticLoadPointIds: new Set(),
    },
    cptSelectionEditLoadPointId: null,
    cptSelectionPreview: null,
  };
}

export function startManualCptSelectionEdit(state: ProjectState): ProjectState {
  const editingState = beginManualCptSelection(state);
  return {
    ...editingState,
    rightPanelMode: state.rightPanelMode === "combined" ? "combined" : "cpts",
    selectedCptId: null,
  };
}

export function toggleManualCpt(state: ProjectState, cptId: number): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }

  const removeFromAll = getManualCptEditTargetIds(state).every((id) => getDraftCptIds(state, id).has(cptId));
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

  const cptIdsByLoadPoint = new Map(draft.cptIdsByLoadPoint);
  const automaticLoadPointIds = new Set(draft.automaticLoadPointIds);
  for (const loadPointId of getManualCptEditTargetIds(state)) {
    automaticLoadPointIds.delete(loadPointId);
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
    cptSelectionEditDraft: { ...draft, cptIdsByLoadPoint, automaticLoadPointIds },
    cptSelectionPreview: null,
  };
}

export function saveManualCptSelection(
  state: ProjectState,
  validatedUpdates?: Map<number, number[] | null>,
): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) {
    return state;
  }
  const updates = validatedUpdates ?? getManualCptSelectionUpdates(state);
  const updated = applyManualCptSelectionUpdates(state, updates);
  return {
    ...updated,
    cptSelectionEditDraft: null,
    cptSelectionEditLoadPointId: null,
    cptSelectionPreview: null,
  };
}

export function cancelManualCptSelection(state: ProjectState): ProjectState {
  return { ...state, cptSelectionEditDraft: null, cptSelectionEditLoadPointId: null, cptSelectionPreview: null };
}

export function clearManualCptSelection(state: ProjectState): ProjectState {
  if (state.cptSelectionEditDraft) {
    const automaticLoadPointIds = new Set(state.cptSelectionEditDraft.automaticLoadPointIds);
    for (const id of getManualCptEditTargetIds(state)) automaticLoadPointIds.add(id);
    return { ...state, cptSelectionEditDraft: { ...state.cptSelectionEditDraft, automaticLoadPointIds }, cptSelectionPreview: null };
  }
  if (state.selectedLoadPointIds.length === 0) {
    return state;
  }
  const updates = new Map<number, number[] | null>(state.selectedLoadPointIds.map((id) => [id, null]));
  const updated = applyManualCptSelectionUpdates(state, updates);
  return {
    ...updated,
    cptSelectionEditDraft: null,
    cptSelectionEditLoadPointId: null,
    cptSelectionPreview: null,
  };
}

export function applyManualCptSelectionUpdates(
  state: ProjectState,
  updates: Map<number, number[] | null>,
): ProjectState {
  const manualSelections = new Map(state.manualCptIdsByLoadPoint);
  const changedIds: number[] = [];
  for (const [loadPointId, requested] of updates) {
    const previous = manualSelections.get(loadPointId);
    if (requested === null) {
      if (previous !== undefined) {
        manualSelections.delete(loadPointId);
        changedIds.push(loadPointId);
      }
      continue;
    }
    const ids = [...new Set(requested)].sort((left, right) => left - right);
    if (previous !== undefined && previous.length === ids.length
      && previous.every((id, index) => id === ids[index])) continue;
    manualSelections.set(loadPointId, ids);
    changedIds.push(loadPointId);
  }
  return changedIds.length === 0 ? state : requestAnalysis({
    ...state,
    manualCptIdsByLoadPoint: manualSelections,
  }, changedIds);
}

export function getCptSelectionPreviewInput(state: ProjectState): {
  draft: CptSelectionEditDraft;
  loadPoints: ProjectState["loadPoints"];
  manualCptIdsByLoadPoint: Map<number, number[]>;
} | null {
  const draft = state.cptSelectionEditDraft;
  if (!draft) return null;
  const targetIds = new Set(draft.loadPointIds);
  const manualCptIdsByLoadPoint = new Map(state.manualCptIdsByLoadPoint);
  for (const loadPointId of draft.loadPointIds) {
    if (draft.automaticLoadPointIds?.has(loadPointId)) {
      manualCptIdsByLoadPoint.delete(loadPointId);
      continue;
    }
    manualCptIdsByLoadPoint.set(
      loadPointId,
      [...(draft.cptIdsByLoadPoint.get(loadPointId) ?? new Set())].sort((left, right) => left - right),
    );
  }
  return {
    draft,
    loadPoints: state.loadPoints.filter((loadPoint) => targetIds.has(loadPoint.id)),
    manualCptIdsByLoadPoint,
  };
}

export function beginCptSelectionPreview(
  state: ProjectState,
  draft: CptSelectionEditDraft,
): ProjectState {
  return state.cptSelectionEditDraft === draft
    ? { ...state, cptSelectionPreview: { draft, status: "analyzing" } }
    : state;
}

export function applyCptSelectionPreviewResult(
  state: ProjectState,
  draft: CptSelectionEditDraft | null,
  analysis: PileOptionAnalysisResult,
): ProjectState {
  if (!draft || state.cptSelectionEditDraft !== draft) return state;
  return {
    ...state,
    cptSelectionPreview: {
      draft,
      status: "ready",
      pileOptionsByLoadPointId: analysis.pileOptionsByLoadPointId,
      selectedCptsByLoadPointId: analysis.selectedCptsByLoadPointId,
    },
  };
}

export function failCptSelectionPreview(
  state: ProjectState,
  draft: CptSelectionEditDraft,
  error: string,
): ProjectState {
  return state.cptSelectionEditDraft === draft
    ? { ...state, cptSelectionPreview: { draft, status: "failed", error } }
    : state;
}

export function getEffectivePileOptionsByLoadPointId(
  state: ProjectState,
): Map<number, PileConfigurationOption[]> {
  const preview = state.cptSelectionPreview;
  if (!preview || preview.status !== "ready" || preview.draft !== state.cptSelectionEditDraft) {
    return state.pileOptionsByLoadPointId;
  }
  return new Map([...state.pileOptionsByLoadPointId, ...preview.pileOptionsByLoadPointId]);
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

  if (isManualCptSelectionPending(state)) return state;
  const cptIdsByLoadPoint = new Map(draft.cptIdsByLoadPoint);
  const automaticLoadPointIds = new Set(draft.automaticLoadPointIds);
  for (const loadPointId of getManualCptEditTargetIds(state)) {
    const previous = getDraftCptIds(state, loadPointId);
    const cptIds = new Set(previous);
    update(cptIds);
    if (sameCptIds(previous, cptIds)) continue;
    cptIdsByLoadPoint.set(loadPointId, cptIds);
    automaticLoadPointIds.delete(loadPointId);
  }
  return {
    ...state,
    cptSelectionEditDraft: { ...draft, cptIdsByLoadPoint, automaticLoadPointIds },
    cptSelectionPreview: null,
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


/** Inspecting a location uses the same selection as the viewer and both panels. */
export function setManualCptEditLoadPoint(state: ProjectState, id: number | null): ProjectState {
  if (!state.cptSelectionEditDraft || (id !== null && !state.loadPoints.some(point => point.id === id))) return state;
  return synchronizeManualCptSelection({ ...state, ...setLoadPointSelection(state, id === null ? state.cptSelectionEditDraft.loadPointIds : [id]) });
}

/** Capture newly visited locations without replacing edits already staged elsewhere. */
export function synchronizeManualCptSelection(state: ProjectState): ProjectState {
  const draft = state.cptSelectionEditDraft;
  if (!draft) return state;
  const addedIds = state.selectedLoadPointIds.filter(id => !draft.loadPointIds.includes(id) && state.loadPoints.some(point => point.id === id));
  const focus = state.selectedLoadPointIds.length === 1 ? state.selectedLoadPointIds[0]! : null;
  if (addedIds.length === 0) return state.cptSelectionEditLoadPointId === focus ? state : { ...state, cptSelectionEditLoadPointId: focus };
  const cptIdsByLoadPoint = new Map(draft.cptIdsByLoadPoint);
  const initialCptIdsByLoadPoint = new Map(draft.initialCptIdsByLoadPoint);
  for (const id of addedIds) {
    const ids = new Set(state.manualCptIdsByLoadPoint.get(id) ?? state.selectedCptsByLoadPointId.get(id)?.map(item => item.cpt.id));
    cptIdsByLoadPoint.set(id, ids);
    initialCptIdsByLoadPoint.set(id, new Set(ids));
  }
  return { ...state, cptSelectionEditLoadPointId: focus,
    cptSelectionEditDraft: { ...draft, loadPointIds: [...draft.loadPointIds, ...addedIds], cptIdsByLoadPoint, initialCptIdsByLoadPoint },
    cptSelectionPreview: null };
}

export function getManualCptEditTargetIds(state: ProjectState): number[] {
  const ids = state.cptSelectionEditDraft?.loadPointIds ?? [];
  return state.selectedLoadPointIds.filter(id => ids.includes(id));
}

export function getDraftCptIds(state: ProjectState, id: number): ReadonlySet<number> {
  const draft = state.cptSelectionEditDraft;
  if (!draft) return new Set(state.selectedCptsByLoadPointId.get(id)?.map(item => item.cpt.id));
  if (draft.automaticLoadPointIds?.has(id)) {
    const preview = state.cptSelectionPreview;
    return new Set(preview?.draft === draft && preview.status === "ready"
      ? preview.selectedCptsByLoadPointId?.get(id)?.map(item => item.cpt.id) : []);
  }
  return draft.cptIdsByLoadPoint.get(id) ?? new Set();
}

export function isManualCptSelectionPending(state: ProjectState): boolean {
  const draft = state.cptSelectionEditDraft;
  return !!draft?.automaticLoadPointIds?.size && !(state.cptSelectionPreview?.draft === draft && state.cptSelectionPreview.status === "ready");
}

/** UI no-op filtering is deliberately separate from explicit MCP/manual writes. */
export function getManualCptSelectionUpdates(state: ProjectState): Map<number, number[] | null> {
  const draft = state.cptSelectionEditDraft;
  const updates = new Map<number, number[] | null>();
  if (!draft) return updates;
  for (const id of draft.loadPointIds) {
    if (draft.automaticLoadPointIds?.has(id)) {
      if (state.manualCptIdsByLoadPoint.has(id)) updates.set(id, null);
      continue;
    }
    const ids = draft.cptIdsByLoadPoint.get(id) ?? new Set<number>();
    const initial = draft.initialCptIdsByLoadPoint?.get(id)
      ?? new Set(state.manualCptIdsByLoadPoint.get(id) ?? state.selectedCptsByLoadPointId.get(id)?.map(item => item.cpt.id));
    if (!sameCptIds(ids, initial)) updates.set(id, [...ids].sort((a, b) => a - b));
  }
  return updates;
}

function sameCptIds(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  return left.size === right.size && [...left].every(id => right.has(id));
}
