import { useMemo } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { getEffectivePileOptionsByLoadPointId } from "../../domain/cpt-selection/cptSettingsModel.ts";
import type { LoadPointGroupSnapshot } from "./loadPointGroupController.ts";
import { useTechnicalAssignment } from "./useTechnicalAssignment.ts";
import { prepareProjectTechnicalInput, presentProjectTechnicalAssignment, projectGroupsCompleted } from "./projectTechnicalAssignment.ts";

/** Gate the Rust assessment while upstream analysis and CPT previews are pending or failed. */
export function useProjectTechnicalAssignment(state: ProjectState, groups: LoadPointGroupSnapshot) {
  const options = useMemo(() => getEffectivePileOptionsByLoadPointId(state),
    [state.cptSelectionEditDraft, state.cptSelectionPreview, state.pileOptionsByLoadPointId]);
  const input = useMemo(() => prepareProjectTechnicalInput(state, groups, options),
    [state.analysisError, state.loadPoints.length, state.cptSelectionPreview, state.cptSelectionEditDraft, groups.groups, options]);
  const assessed = useTechnicalAssignment(input);
  const technicalAssignment = useMemo(() => presentProjectTechnicalAssignment(state, groups, input, assessed),
    [state.analysisError, state.loadPoints.length, state.cptSelectionPreview, state.cptSelectionEditDraft, groups, input, assessed]);
  return {
    technicalAssignment,
    technicalAssignmentInput: input,
    technicalPileOptionsByLoadPointId: options,
    hasCompletedLoadPointGroups: projectGroupsCompleted(state, groups),
  };
}
