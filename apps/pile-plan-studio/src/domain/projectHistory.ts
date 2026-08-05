import type { HistoryAction } from "./historyAction.ts";
import { projectContentEquals, type ProjectContent } from "./projectContent.ts";

export const PROJECT_HISTORY_LIMIT = 50;

export type HistoryEntry = {
  before: ProjectContent;
  after: ProjectContent;
  action: HistoryAction;
  beforeActivePilePlanId: string;
  afterActivePilePlanId: string;
};

export type ProjectHistory = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export type ProjectHistoryStep = {
  history: ProjectHistory;
  content: ProjectContent;
  entry: HistoryEntry;
};

export function createProjectHistory(): ProjectHistory {
  return { past: [], future: [] };
}

export function recordProjectChange(
  history: ProjectHistory,
  before: ProjectContent,
  after: ProjectContent,
  action: HistoryAction,
  navigation: { beforeActivePilePlanId: string; afterActivePilePlanId: string } = {
    beforeActivePilePlanId: "",
    afterActivePilePlanId: "",
  },
): ProjectHistory {
  if (projectContentEquals(before, after)) return history;
  const past = [...history.past, { before, after, action, ...navigation }];
  return {
    past: past.slice(-PROJECT_HISTORY_LIMIT),
    future: [],
  };
}

export function undoProjectChange(history: ProjectHistory): ProjectHistoryStep | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    content: entry.before,
    entry,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
  };
}

export function redoProjectChange(history: ProjectHistory): ProjectHistoryStep | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return {
    content: entry.after,
    entry,
    history: {
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
  };
}
