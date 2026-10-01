import type { ProjectState } from "../../project/projectState.ts";

// Viewer interactions carry the displayed state. Strip its temporary plan before
// committing pan, zoom, selection or other UI changes to the real project.
export function applyIlpPreviewInteraction(source: ProjectState, displayed: ProjectState, next: ProjectState): ProjectState | null {
  if (next.pilePlans !== displayed.pilePlans || next.activePilePlanId !== displayed.activePilePlanId
    || next.selectedPileConfigurationsByLoadPoint !== displayed.selectedPileConfigurationsByLoadPoint) return null;
  return { ...next, pilePlans: source.pilePlans, activePilePlanId: source.activePilePlanId,
    selectedPileConfigurationsByLoadPoint: source.selectedPileConfigurationsByLoadPoint };
}
