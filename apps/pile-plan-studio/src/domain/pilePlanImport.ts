import type { PilePlanImportPatch, PilePlanImportedValue } from "../core/pilePlanImportContract.ts";
import type { PilePlanData } from "../core/projectFile.ts";
import type { PileConfigurationKey } from "../core/projectTypes.ts";
import type { ProjectState } from "./projectState.ts";
import { nextPilePlanId, synchronizeActivePilePlan } from "./pilePlanManagement.ts";

export function pilePlanNameFromFileName(fileName: string): string {
  const pathParts = fileName.split(/[\\/]/);
  const leafName = pathParts[pathParts.length - 1] ?? fileName;
  return leafName.replace(/\.[^.]+$/, "").trim() || "Imported pile plan";
}

export function applyPilePlanImportAsNewPlan(
  state: ProjectState,
  patch: PilePlanImportPatch,
  requestedName: string,
): ProjectState {
  const pilePlans = synchronizeActivePilePlan(
    state.pilePlans,
    state.activePilePlanId,
    state.selectedPileOptionKeysByLoadPoint,
  );
  const source = pilePlans.find((plan) => plan.id === state.activePilePlanId) ?? pilePlans[0];
  const patched = applyPilePlanImportPatch({ ...state, pilePlans }, patch);
  const choices = new Map(patched.selectedPileOptionKeysByLoadPoint);
  const created: PilePlanData = {
    id: nextPilePlanId(pilePlans),
    name: uniquePilePlanName(pilePlans, requestedName),
    selectedPileOptionKeysByLoadPoint: choices,
    externalReferencesByLoadPoint: source
      ? unchangedExternalReferences(source, choices)
      : new Map(),
    lockedLoadPointIds: source ? [...source.lockedLoadPointIds] : [],
  };

  return {
    ...patched,
    pilePlans: [...pilePlans, created],
    activePilePlanId: created.id,
    selectedPileOptionKeysByLoadPoint: new Map(choices),
  };
}

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

function uniquePilePlanName(pilePlans: PilePlanData[], requestedName: string): string {
  const base = requestedName.trim() || "Imported pile plan";
  const existingNames = new Set(pilePlans.map((plan) => plan.name));
  if (!existingNames.has(base)) return base;
  let index = 2;
  while (existingNames.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function unchangedExternalReferences(
  source: PilePlanData,
  choices: ReadonlyMap<number, string>,
): Map<number, unknown[]> {
  return new Map(
    [...source.externalReferencesByLoadPoint]
      .filter(([loadPointId]) => (
        source.selectedPileOptionKeysByLoadPoint.get(loadPointId) === choices.get(loadPointId)
      ))
      .map(([loadPointId, references]) => [loadPointId, [...references]]),
  );
}
