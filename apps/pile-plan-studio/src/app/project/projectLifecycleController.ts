import {
  captureProjectContent,
  normalizeProjectContentState,
  projectDocumentDraftFromContent,
  projectContentEquals,
  type ProjectContent,
} from "../../domain/project/projectContent.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";

export type OpenedProjectLifecycleState = {
  projectPath: string | null;
  savedSignature: string;
  isDirty: false;
};

export function projectDraftFromState(state: ProjectState) {
  const normalized = normalizeProjectContentState(state);
  return projectDocumentDraftFromContent(
    captureProjectContent(normalized),
    normalized.activePilePlanId,
  );
}

export function projectStateSignature(state: ProjectState): string {
  return JSON.stringify(projectDraftFromState(state));
}

/** One session's last immutable persistence snapshot; transient UI state is excluded. */
export function createProjectPersistenceSelector() {
  let previousContent: ProjectContent | null = null;
  let activePlanId: string | null = null;
  let assignments: ProjectState["selectedPileConfigurationsByLoadPoint"] | null = null;
  let snapshot: {draft: ReturnType<typeof projectDraftFromState>; signature: string} | null = null;
  return (state: ProjectState) => {
    const content = captureProjectContent(state);
    if (snapshot && previousContent && activePlanId === state.activePilePlanId
      && assignments === state.selectedPileConfigurationsByLoadPoint
      && projectContentEquals(previousContent, content)) return snapshot;
    const draft = projectDraftFromState(state);
    previousContent = content;
    activePlanId = state.activePilePlanId;
    assignments = state.selectedPileConfigurationsByLoadPoint;
    snapshot = {draft, signature: JSON.stringify(draft)};
    return snapshot;
  };
}

export function openedProjectLifecycleState(
  project: ProjectState,
  projectPath: string | null,
): OpenedProjectLifecycleState {
  return {
    projectPath,
    savedSignature: projectStateSignature(project),
    isDirty: false,
  };
}
