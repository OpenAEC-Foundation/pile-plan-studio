import type { PilePlanData } from "../core/projectFile.ts";
import type { PileConfigurationKey } from "../core/projectTypes.ts";
import type { ActivePileConfigurations } from "./activePileConfigurations.ts";

export function getPilePlanActivation(plan: PilePlanData): ActivePileConfigurations {
  return {
    pileSizes: [...plan.activePileSizes],
    pileTipLevels: [...plan.activePileTipLevels],
  };
}

export function getActivePilePlan<T extends Pick<PilePlanData, "id">>(state: {
  pilePlans: T[];
  activePilePlanId: string;
}): T {
  const plan = state.pilePlans.find(({ id }) => id === state.activePilePlanId)
    ?? state.pilePlans[0];
  if (!plan) {
    throw new Error("Project has no pile plans");
  }
  return plan;
}

export function replacePilePlanActivation(
  pilePlans: PilePlanData[],
  pilePlanId: string,
  activation: ActivePileConfigurations,
): PilePlanData[] {
  return pilePlans.map((plan) => plan.id === pilePlanId ? {
    ...plan,
    activePileSizes: [...activation.pileSizes],
    activePileTipLevels: [...activation.pileTipLevels],
  } : plan);
}

export function activationFromConfigurations(
  configurations: Iterable<PileConfigurationKey>,
): ActivePileConfigurations {
  const values = [...configurations];
  return {
    pileSizes: [...new Set(values.map(({ pile_size_mm }) => pile_size_mm))]
      .sort((left, right) => left - right),
    pileTipLevels: [...new Set(values.map(({ pile_tip_level_mm }) => pile_tip_level_mm / 1000))]
      .sort((left, right) => right - left),
  };
}

export function unionActivationForPlans(
  pilePlans: PilePlanData[],
  planIds: ReadonlySet<string>,
  override?: { pilePlanId: string; activation: ActivePileConfigurations },
): ActivePileConfigurations {
  const activationFor = (plan: PilePlanData) => plan.id === override?.pilePlanId
    ? override.activation
    : getPilePlanActivation(plan);
  return {
    pileSizes: [...new Set(pilePlans
      .filter(({ id }) => planIds.has(id))
      .flatMap((plan) => activationFor(plan).pileSizes))].sort((left, right) => left - right),
    pileTipLevels: [...new Set(pilePlans
      .filter(({ id }) => planIds.has(id))
      .flatMap((plan) => activationFor(plan).pileTipLevels))].sort((left, right) => right - left),
  };
}

export function unionUsedConfigurationsForPlans(
  pilePlans: PilePlanData[],
  planIds: ReadonlySet<string>,
): ActivePileConfigurations {
  return activationFromConfigurations(
    pilePlans
      .filter(({ id }) => planIds.has(id))
      .flatMap(({ selectedPileConfigurationsByLoadPoint }) => (
        [...selectedPileConfigurationsByLoadPoint.values()]
      )),
  );
}

export function summarizePilePlanScope(
  totalCount: number,
  selectedCount: number,
): { kind: "current-only" } | { kind: "selection"; selectedCount: number; totalCount: number } {
  return selectedCount === 1
    ? { kind: "current-only" }
    : { kind: "selection", selectedCount, totalCount };
}

export function togglePilePlanScope(
  pilePlanIds: Iterable<string>,
  currentPilePlanId: string,
  selectedPilePlanIds: ReadonlySet<string>,
): Set<string> {
  const allPilePlanIds = [...new Set(pilePlanIds)];
  const allSelected = allPilePlanIds.every((id) => selectedPilePlanIds.has(id));
  return allSelected
    ? new Set([currentPilePlanId])
    : new Set(allPilePlanIds);
}
