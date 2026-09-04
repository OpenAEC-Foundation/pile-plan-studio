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
