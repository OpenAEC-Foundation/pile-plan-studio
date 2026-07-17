import type { PilePlanImportPatch, PilePlanImportedValue } from "../core/pilePlanImportContract.ts";
import type { PileConfigurationKey } from "../core/projectTypes.ts";
import type { ProjectState } from "./projectState.ts";

export function applyPilePlanImportPatch(
  state: ProjectState,
  patch: PilePlanImportPatch,
): ProjectState {
  let pileChoices = state.selectedPileOptionKeysByLoadPoint;
  let manualCptSelections = state.manualCptIdsByLoadPoint;

  for (const change of patch.changes) {
    if (change.pile.action !== "preserve") {
      if (pileChoices === state.selectedPileOptionKeysByLoadPoint) {
        pileChoices = new Map(pileChoices);
      }
      applyImportedValue(pileChoices, change.load_point_id, change.pile, pileOptionKey);
    }

    if (change.manual_cpt_ids.action !== "preserve") {
      if (manualCptSelections === state.manualCptIdsByLoadPoint) {
        manualCptSelections = new Map(manualCptSelections);
      }
      applyImportedValue(
        manualCptSelections,
        change.load_point_id,
        change.manual_cpt_ids,
        (cptIds) => [...new Set(cptIds)].sort((left, right) => left - right),
      );
    }
  }

  if (
    pileChoices === state.selectedPileOptionKeysByLoadPoint &&
    manualCptSelections === state.manualCptIdsByLoadPoint
  ) {
    return state;
  }

  return {
    ...state,
    selectedPileOptionKeysByLoadPoint: pileChoices,
    manualCptIdsByLoadPoint: manualCptSelections,
    analysisRequest: {
      revision: state.analysisRequest.revision + 1,
      loadPointIds: null,
    },
    analysisError: null,
    defaultPileSelectionPending: false,
  };
}

function applyImportedValue<TSource, TValue>(
  target: Map<number, TValue>,
  loadPointId: number,
  imported: PilePlanImportedValue<TSource>,
  convert: (value: TSource) => TValue,
): void {
  if (imported.action === "clear") {
    target.delete(loadPointId);
  } else if (imported.action === "set") {
    target.set(loadPointId, convert(imported.value));
  }
}

function pileOptionKey(pile: PileConfigurationKey): string {
  return `${pile.pile_size_mm}|${pile.pile_tip_level_m_key / 1000}`;
}
