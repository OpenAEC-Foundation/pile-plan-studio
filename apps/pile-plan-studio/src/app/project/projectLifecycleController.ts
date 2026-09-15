import {
  captureProjectContent,
  normalizeProjectContentState,
  projectDocumentDraftFromContent,
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
