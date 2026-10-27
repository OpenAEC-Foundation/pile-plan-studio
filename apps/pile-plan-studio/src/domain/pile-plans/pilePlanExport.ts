import type { PilePlanExportInput, PileSizeExportFormat } from "../../core/projectTypes.ts";
import type { ProjectState } from "../project/projectState.ts";

type PilePlanExportState = Pick<
  ProjectState,
  "loadPoints" | "selectedPileConfigurationsByLoadPoint" | "selectedCptsByLoadPointId" | "pileCostSettings"
>;

export function buildPilePlanExportInput(state: PilePlanExportState, pileSizeFormat: PileSizeExportFormat = "numeric"): PilePlanExportInput {
  return {
    loadPoints: state.loadPoints,
    selectedPiles: new Map(state.selectedPileConfigurationsByLoadPoint),
    pileShapes: new Map(state.pileCostSettings.items.map(item => [item.pile_size_mm, item.shape])),
    pileSizeFormat,
    selectedCpts: new Map(
      [...state.selectedCptsByLoadPointId.entries()].map(([loadPointId, selectedCpts]) => [
        loadPointId,
        selectedCpts.map((selection) => selection.cpt.id),
      ]),
    ),
  };
}

export function buildPilePlanExportInputForPlan(state: ProjectState, planId: string, pileSizeFormat: PileSizeExportFormat = "numeric"): PilePlanExportInput {
  const plan = state.pilePlans.find((candidate) => candidate.id === planId);
  if (!plan) throw new Error("unknown_plan");
  if (plan.pileCapProposals?.length) throw new Error("pile_cap_proposals_not_exportable");
  return buildPilePlanExportInput({
    loadPoints: state.loadPoints,
    pileCostSettings: state.pileCostSettings,
    selectedPileConfigurationsByLoadPoint: planId === state.activePilePlanId
      ? state.selectedPileConfigurationsByLoadPoint : plan.selectedPileConfigurationsByLoadPoint,
    selectedCptsByLoadPointId: state.selectedCptsByLoadPointId,
  }, pileSizeFormat);
}
