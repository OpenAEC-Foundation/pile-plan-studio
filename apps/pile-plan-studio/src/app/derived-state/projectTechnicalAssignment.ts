import type { ProjectState } from "../../domain/project/projectState.ts";
import type { TechnicalAssignmentContractInput } from "../../core/technicalAssignmentContract.ts";
import type { LoadPointGroupSnapshot } from "./loadPointGroupController.ts";
import type { TechnicalAssignmentSnapshot } from "./technicalAssignmentController.ts";

export function projectGroupsCompleted(state: ProjectState, groups: LoadPointGroupSnapshot): boolean {
  return state.loadPoints.length === 0 || groups.groups.length > 0;
}

function currentPreview(state: ProjectState) {
  return state.cptSelectionPreview?.draft === state.cptSelectionEditDraft ? state.cptSelectionPreview : null;
}

export function prepareProjectTechnicalInput(
  state: ProjectState,
  groups: LoadPointGroupSnapshot,
  options: ProjectState["pileOptionsByLoadPointId"],
): TechnicalAssignmentContractInput | null {
  const preview = currentPreview(state);
  if (!projectGroupsCompleted(state, groups) || state.analysisError !== null
    || preview?.status === "analyzing" || preview?.status === "failed"
    || options.size !== state.loadPoints.length) {
    return null;
  }
  return { groups: groups.groups, optionsByLoadPoint: options };
}

export function presentProjectTechnicalAssignment(
  state: ProjectState,
  groups: LoadPointGroupSnapshot,
  input: TechnicalAssignmentContractInput | null,
  assessed: TechnicalAssignmentSnapshot,
): TechnicalAssignmentSnapshot {
  const preview = currentPreview(state);
  const error = state.analysisError ?? (!projectGroupsCompleted(state, groups) ? groups.error : null)
    ?? (preview?.status === "failed" ? preview.error : null);
  if (error) {
    return {
      status: "error",
      assessment: null,
      issuesByLoadPointId: new Map(),
      error: error instanceof Error ? error : new Error(error),
    };
  }
  if (input === null) {
    return { status: "loading", assessment: null, issuesByLoadPointId: new Map(), error: null };
  }
  return assessed;
}
