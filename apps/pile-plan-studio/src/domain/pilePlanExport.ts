import type { PilePlanExportInput } from "../core/projectTypes.ts";
import type { ProjectState } from "./projectState.ts";

type PilePlanExportState = Pick<
  ProjectState,
  "loadPoints" | "selectedPileConfigurationsByLoadPoint" | "selectedCptsByLoadPointId"
>;

export function buildPilePlanExportInput(state: PilePlanExportState): PilePlanExportInput {
  return {
    loadPoints: state.loadPoints,
    selectedPiles: new Map(state.selectedPileConfigurationsByLoadPoint),
    selectedCpts: new Map(
      [...state.selectedCptsByLoadPointId.entries()].map(([loadPointId, selectedCpts]) => [
        loadPointId,
        selectedCpts.map((selection) => selection.cpt.id),
      ]),
    ),
  };
}
