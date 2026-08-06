import type { ProjectState } from "./projectState.ts";
import { inferHistoryAction, type HistoryAction } from "./historyAction.ts";
import {
  captureProjectContent,
  normalizeProjectContentState,
  projectContentEquals,
  restoreProjectContent,
  type AnalysisInvalidation,
} from "./projectContent.ts";
import {
  createProjectHistory,
  recordProjectChange,
  redoProjectChange,
  undoProjectChange,
  type ProjectHistory,
} from "./projectHistory.ts";

export type HistoryDirection = "undo" | "redo";

export type HistoryResult = {
  id: number;
  direction: HistoryDirection;
  action: HistoryAction;
};

export type ManagedProjectState = {
  present: ProjectState;
  history: ProjectHistory;
  lastResult: HistoryResult | null;
  resultSequence: number;
};

type ProjectStateUpdate = ProjectState | ((current: ProjectState) => ProjectState);

export type ProjectHistoryReducerAction =
  | { type: "commit"; update: ProjectStateUpdate; action?: HistoryAction }
  | { type: "amend"; update: ProjectStateUpdate }
  | { type: "runtime"; update: ProjectStateUpdate }
  | { type: "replace"; state: ProjectState }
  | { type: "undo" }
  | { type: "redo" };

export function createManagedProjectState(initial: ProjectState): ManagedProjectState {
  return {
    present: normalizeProjectContentState(initial),
    history: createProjectHistory(),
    lastResult: null,
    resultSequence: 0,
  };
}

export function projectHistoryReducer(
  managed: ManagedProjectState,
  action: ProjectHistoryReducerAction,
): ManagedProjectState {
  if (action.type === "replace") return createManagedProjectState(action.state);
  if (action.type === "runtime") {
    return {
      ...managed,
      present: normalizeProjectContentState(applyUpdate(managed.present, action.update)),
    };
  }
  if (action.type === "amend") {
    const present = normalizeProjectContentState(applyUpdate(managed.present, action.update));
    const lastIndex = managed.history.past.length - 1;
    if (lastIndex < 0) return { ...managed, present };
    const last = managed.history.past[lastIndex];
    return {
      ...managed,
      present,
      history: {
        ...managed.history,
        past: [
          ...managed.history.past.slice(0, lastIndex),
          {
            ...last,
            after: captureProjectContent(present),
            afterActivePilePlanId: present.activePilePlanId,
          },
        ],
      },
      lastResult: null,
    };
  }
  if (action.type === "commit") {
    const beforeState = normalizeProjectContentState(managed.present);
    const afterState = normalizeProjectContentState(applyUpdate(beforeState, action.update));
    const before = captureProjectContent(beforeState);
    const after = captureProjectContent(afterState);
    if (projectContentEquals(before, after)) return { ...managed, present: afterState };
    return {
      ...managed,
      present: afterState,
      history: recordProjectChange(
        managed.history,
        before,
        after,
        action.action ?? inferHistoryAction(before, after),
        {
          beforeActivePilePlanId: beforeState.activePilePlanId,
          afterActivePilePlanId: afterState.activePilePlanId,
        },
      ),
      lastResult: null,
    };
  }

  const step = action.type === "undo"
    ? undoProjectChange(managed.history)
    : redoProjectChange(managed.history);
  if (!step) return managed;
  const activatesCreatedPlan = action.type === "redo"
    && step.entry.action.kind === "pile-plan-created";
  const restored = restoreProjectContent(managed.present, step.content, {
    activatePilePlanId: activatesCreatedPlan ? step.entry.afterActivePilePlanId : null,
    fallbackPilePlanId: action.type === "undo"
      ? step.entry.beforeActivePilePlanId
      : step.entry.afterActivePilePlanId,
  });
  const resultSequence = managed.resultSequence + 1;
  return {
    present: applyAnalysisInvalidation(restored.state, restored.analysisScope),
    history: step.history,
    lastResult: {
      id: resultSequence,
      direction: action.type,
      action: step.entry.action,
    },
    resultSequence,
  };
}

function applyUpdate(current: ProjectState, update: ProjectStateUpdate): ProjectState {
  return typeof update === "function" ? update(current) : update;
}

function applyAnalysisInvalidation(
  state: ProjectState,
  scope: AnalysisInvalidation,
): ProjectState {
  if (scope === "none") return state;
  if (scope === "all") {
    return {
      ...state,
      pileOptionsByLoadPointId: new Map(),
      selectedCptsByLoadPointId: new Map(),
      cptFrdRowsByCptId: new Map(),
      analysisRequest: {
        revision: state.analysisRequest.revision + 1,
        loadPointIds: null,
      },
    };
  }

  const pileOptionsByLoadPointId = new Map(state.pileOptionsByLoadPointId);
  const selectedCptsByLoadPointId = new Map(state.selectedCptsByLoadPointId);
  for (const loadPointId of scope) {
    pileOptionsByLoadPointId.delete(loadPointId);
    selectedCptsByLoadPointId.delete(loadPointId);
  }
  return {
    ...state,
    pileOptionsByLoadPointId,
    selectedCptsByLoadPointId,
    analysisRequest: {
      revision: state.analysisRequest.revision + 1,
      loadPointIds: scope,
    },
  };
}
