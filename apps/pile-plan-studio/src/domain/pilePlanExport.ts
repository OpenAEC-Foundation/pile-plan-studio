import type { PileConfigurationKey, PilePlanExportInput } from "../core/projectTypes.ts";
import type { ProjectState } from "./projectState.ts";

type PilePlanExportState = Pick<
  ProjectState,
  "loadPoints" | "selectedPileOptionKeysByLoadPoint" | "selectedCptsByLoadPointId"
>;

export function buildPilePlanExportInput(state: PilePlanExportState): PilePlanExportInput {
  return {
    loadPoints: state.loadPoints,
    selectedPiles: new Map(
      [...state.selectedPileOptionKeysByLoadPoint.entries()].flatMap(([loadPointId, optionKey]) => {
        const pile = parsePileOptionKey(optionKey);
        return pile ? [[loadPointId, pile]] : [];
      }),
    ),
    selectedCpts: new Map(
      [...state.selectedCptsByLoadPointId.entries()].map(([loadPointId, selectedCpts]) => [
        loadPointId,
        selectedCpts.map((selection) => selection.cpt.id),
      ]),
    ),
  };
}

function parsePileOptionKey(optionKey: string): PileConfigurationKey | null {
  const [pileSize, pileTipLevel, extra] = optionKey.split("|");
  const pileSizeMm = Number(pileSize);
  const pileTipLevelM = Number(pileTipLevel);
  if (
    extra !== undefined
    || !Number.isInteger(pileSizeMm)
    || pileSizeMm <= 0
    || !Number.isFinite(pileTipLevelM)
  ) {
    return null;
  }

  return {
    pile_size_mm: pileSizeMm,
    pile_tip_level_m_key: Math.round(pileTipLevelM * 1000),
  };
}
