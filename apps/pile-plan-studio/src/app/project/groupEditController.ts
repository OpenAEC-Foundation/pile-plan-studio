import type { LoadPointGroupEditAction, LoadPointGroupEditInput, LoadPointGroupEditPreview,
  LoadPointGroupEditResult, LoadPointGroupEditBlockReason } from "../../core/loadPointGroupContract.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { HistoryAction } from "../../domain/project/history/historyAction.ts";
import { setReactViewerLoadPoints } from "../../domain/workspace/viewerInteractions.ts";
import { getLoadPointGroupEditHistoryAction } from "../session/appSessionSupport.ts";

export type GroupEditDependencies = {
  currentState: () => ProjectState;
  ready: () => boolean;
  preview: (input: LoadPointGroupEditInput) => Promise<LoadPointGroupEditPreview>;
  evaluate: (input: LoadPointGroupEditInput) => Promise<LoadPointGroupEditResult>;
  commit: (update: (state: ProjectState) => ProjectState, action: HistoryAction) => void;
  setPending: (pending: boolean) => void;
  blocked: (reason: LoadPointGroupEditBlockReason) => void;
};

/** Rust owns membership and edit validity; this controller guards installation in project history. */
export function createGroupEditController(dependencies: GroupEditDependencies) {
  let generation = 0;
  let pending = false;
  function capture(action: LoadPointGroupEditAction, selectedLoadPointIds?: number[]) {
    const state = dependencies.currentState();
    const input: LoadPointGroupEditInput = {
      loadPoints: state.loadPoints,
      settings: state.loadPointGroupingSettings,
      selectedLoadPointIds: [...(selectedLoadPointIds ?? state.selectedLoadPointIds)],
      action,
    };
    return input;
  }
  function matches(state: ProjectState, input: LoadPointGroupEditInput) {
    return state.loadPoints === input.loadPoints && state.loadPointGroupingSettings === input.settings;
  }
  return {
    invalidate() {
      generation++;
      pending = false;
      dependencies.setPending(false);
    },
    async preview(action: LoadPointGroupEditAction, selectedLoadPointIds?: number[]): Promise<LoadPointGroupEditPreview | null> {
      if (!dependencies.ready()) return null;
      const run = generation;
      const input = capture(action, selectedLoadPointIds);
      const result = await dependencies.preview(input);
      return run === generation && matches(dependencies.currentState(), input) ? result : null;
    },
    async apply(action: LoadPointGroupEditAction, selectedLoadPointIds?: number[]): Promise<void> {
      if (pending || !dependencies.ready()) return;
      const requestId = ++generation;
      const input = capture(action, selectedLoadPointIds);
      const isCurrent = (state: ProjectState) => requestId === generation && matches(state, input);
      pending = true;
      dependencies.setPending(true);
      try {
        const result = await dependencies.evaluate(input);
        if (!isCurrent(dependencies.currentState())) return;
        if (result.status === "blocked") {
          dependencies.blocked(result.reason);
          return;
        }
        dependencies.commit((current) => {
          if (!isCurrent(current)) return current;
          const groupingSettings = {
            ...result.settings,
            manualGroups: result.settings.manualGroups.map(({ loadPointIds }) => ({ loadPointIds: [...loadPointIds] })),
            ungroupedGroups: result.settings.ungroupedGroups.map(({ loadPointIds }) => ({ loadPointIds: [...loadPointIds] })),
          };
          const selection = action === "group"
            ? setReactViewerLoadPoints(current, input.selectedLoadPointIds, result.grouping.groups)
            : action === "ungroup"
              ? setReactViewerLoadPoints(current, input.selectedLoadPointIds)
              : current;
          return { ...current, ...selection, loadPointGroupingSettings: groupingSettings };
        }, getLoadPointGroupEditHistoryAction(action));
      } finally {
        if (requestId === generation) {
          pending = false;
          dependencies.setPending(false);
        }
      }
    },
  };
}
