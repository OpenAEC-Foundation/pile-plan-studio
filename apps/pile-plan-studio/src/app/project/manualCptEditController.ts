import type { ProjectState } from "../../domain/project/projectState.ts";
import type { validateManualCptSelectionBatchCore } from "../../core/locationBulkCoreClient.ts";
import { saveManualCptSelection, cancelManualCptSelection, getManualCptSelectionUpdates, beginManualCptSelection, clearManualCptSelection, selectOnlyNearestCpts } from "../../domain/cpt-selection/cptSettingsModel.ts";

export type CptSelectionMethod = "automatic" | "nearest";
export type CptEditCompletion = (state: ProjectState) => ProjectState;

export type ManualCptEditDependencies = {
  currentState: () => ProjectState;
  evaluate: typeof validateManualCptSelectionBatchCore;
  commit: (update: (state: ProjectState) => ProjectState) => void;
  setPending: (pending: boolean) => void;
  blocked: () => void;
  failed: (error: unknown) => void;
};

/** Rust validates the whole batch; no result may replace a newer edit or project. */
export function createManualCptEditController(dependencies: ManualCptEditDependencies) {
  let generation = 0;
  let pending = false;
  return {
    invalidate() { generation++; pending = false; dependencies.setPending(false); },
    save: (afterSave?: CptEditCompletion) => persist(undefined, afterSave),
    applyMethod: (method: CptSelectionMethod) => {
      if (dependencies.currentState().cptSelectionEditDraft) return Promise.resolve();
      return persist(state => {
        const editing = beginManualCptSelection(state);
        return method === "automatic" ? clearManualCptSelection(editing) : selectOnlyNearestCpts(editing);
      }, state => ({ ...state, selectedCptId: null }));
    },
  };

  async function persist(prepare?: CptEditCompletion, afterSave?: CptEditCompletion) {
    const original = dependencies.currentState();
    const captured = prepare ? prepare(original) : original;
    if (pending || !captured.cptSelectionEditDraft) return;
    const updates = getManualCptSelectionUpdates(captured);
    const request = ++generation;
    const current = (state: ProjectState) => request === generation
      && state.cptSelectionEditDraft === original.cptSelectionEditDraft
      && state.loadPoints === captured.loadPoints && state.cpts === captured.cpts
      && state.bearingCapacities === captured.bearingCapacities
      && state.globalCptSelectionSettings === captured.globalCptSelectionSettings
      && state.cptSelectionSettingsByLoadPoint === captured.cptSelectionSettingsByLoadPoint
      && state.manualCptIdsByLoadPoint === captured.manualCptIdsByLoadPoint
      && state.analysisRequest === captured.analysisRequest;
    const complete = (state: ProjectState) => afterSave ? afterSave(state) : state;
    if (updates.size === 0) {
      dependencies.commit(state => current(state) ? complete(cancelManualCptSelection(state)) : state);
      return;
    }
    pending = true;
    dependencies.setPending(true);
    try {
      const result = await dependencies.evaluate({
        loadPointIds: captured.loadPoints.map(point => point.id), cptIds: captured.cpts.map(cpt => cpt.id),
        changes: [...updates].map(([load_point_id, cpt_ids]) => ({ load_point_id, cpt_ids })),
      });
      if (!current(dependencies.currentState())) return;
      if (result.status === "blocked") { dependencies.blocked(); return; }
      const validated = new Map(result.changes.map(change => [change.load_point_id, change.cpt_ids]));
      dependencies.commit(state => {
        if (!current(state)) return state;
        return complete(saveManualCptSelection({ ...state, cptSelectionEditDraft: captured.cptSelectionEditDraft }, validated));
      });
    } catch (error) {
      if (current(dependencies.currentState())) dependencies.failed(error);
    } finally {
      if (request === generation) { pending = false; dependencies.setPending(false); }
    }
  }
}
