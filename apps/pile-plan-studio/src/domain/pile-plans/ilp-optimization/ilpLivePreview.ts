import type { ProjectState } from "../../project/projectState.ts";
import type { IlpSolution } from "../../../core/ilpOptimizationTypes.ts";
import { applyIlpSolutionToState } from "./ilpResultApplication.ts";

export type IlpLivePreview = Pick<ProjectState, "pilePlans" | "activePilePlanId" | "selectedPileConfigurationsByLoadPoint">;

// Always derive from the run's original state: every improvement uses the same
// plan ID and does not accumulate assignments, activation or history entries.
export function createIlpLivePreview(source: ProjectState, solution: IlpSolution, language: "nl" | "en"): IlpLivePreview {
  const { pilePlans, activePilePlanId, selectedPileConfigurationsByLoadPoint } = applyIlpSolutionToState(source, solution, language);
  return { pilePlans, activePilePlanId, selectedPileConfigurationsByLoadPoint };
}

// Viewer interactions carry the displayed state. Strip its temporary plan before
// committing pan, zoom, selection or other UI changes to the real project.
export function applyIlpPreviewInteraction(source: ProjectState, displayed: ProjectState, next: ProjectState): ProjectState | null {
  if (next.pilePlans !== displayed.pilePlans || next.activePilePlanId !== displayed.activePilePlanId
    || next.selectedPileConfigurationsByLoadPoint !== displayed.selectedPileConfigurationsByLoadPoint) return null;
  return { ...next, pilePlans: source.pilePlans, activePilePlanId: source.activePilePlanId,
    selectedPileConfigurationsByLoadPoint: source.selectedPileConfigurationsByLoadPoint };
}
