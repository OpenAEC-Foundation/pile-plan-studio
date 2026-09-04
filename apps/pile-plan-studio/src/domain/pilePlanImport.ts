import type { PilePlanImportPatch, PilePlanImportedValue } from "../core/pilePlanImportContract.ts";
import type { PilePlanData } from "../core/projectFile.ts";
import type { PileConfigurationKey } from "../core/projectTypes.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";
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
    state.selectedPileConfigurationsByLoadPoint,
  );
  const source = pilePlans.find((plan) => plan.id === state.activePilePlanId) ?? pilePlans[0];
  const patched = applyPilePlanImportPatch({ ...state, pilePlans }, patch);
  const choices = new Map(patched.selectedPileConfigurationsByLoadPoint);
  const created: PilePlanData = {
    id: nextPilePlanId(pilePlans),
    name: uniquePilePlanName(pilePlans, requestedName),
    activePileSizes: [...source.activePileSizes],
    activePileTipLevels: [...source.activePileTipLevels],
    selectedPileConfigurationsByLoadPoint: choices,
    externalReferencesByLoadPoint: source
      ? unchangedExternalReferences(source, choices)
      : new Map(),
    lockedLoadPointIds: source ? [...source.lockedLoadPointIds] : [],
    optimizationUnassignedByLoadPoint: new Map(
      source
        ? [...source.optimizationUnassignedByLoadPoint]
            .filter(([loadPointId]) => !choices.has(loadPointId))
        : [],
    ),
  };

  return {
    ...patched,
    pilePlans: [...pilePlans, created],
    activePilePlanId: created.id,
    selectedPileConfigurationsByLoadPoint: new Map(choices),
  };
}

export function applyPilePlanImportPatch(
  state: ProjectState,
  patch: PilePlanImportPatch,
): ProjectState {
  let pileChoices = state.selectedPileConfigurationsByLoadPoint;
  let manualCptSelections = state.manualCptIdsByLoadPoint;

  for (const change of patch.changes) {
    if (change.pile.action !== "preserve") {
      if (pileChoices === state.selectedPileConfigurationsByLoadPoint) {
        pileChoices = new Map(pileChoices);
      }
      applyImportedValue(pileChoices, change.load_point_id, change.pile, (pile) => ({ ...pile }));
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
    pileChoices === state.selectedPileConfigurationsByLoadPoint &&
    manualCptSelections === state.manualCptIdsByLoadPoint
  ) {
    return state;
  }

  return {
    ...state,
    selectedPileConfigurationsByLoadPoint: pileChoices,
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
  choices: ReadonlyMap<number, PileConfigurationKey>,
): Map<number, unknown[]> {
  return new Map(
    [...source.externalReferencesByLoadPoint]
      .filter(([loadPointId]) => (
        samePileConfiguration(
          source.selectedPileConfigurationsByLoadPoint.get(loadPointId),
          choices.get(loadPointId),
        )
      ))
      .map(([loadPointId, references]) => [loadPointId, [...references]]),
  );
}
