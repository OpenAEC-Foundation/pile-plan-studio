import type { PileConfigurationOption, PileConfigurationKey } from "../core/projectTypes.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";

export type ActivePileConfigurations = {
  pileSizes: number[];
  pileTipLevelMms: number[];
};

export function filterActivePileOptions<T extends {
  configuration: PileConfigurationKey;
  pile_size_mm?: number;
  pile_tip_level_m: number;
}>(
  options: T[],
  active: ActivePileConfigurations,
  retainedConfiguration?: PileConfigurationKey,
): T[] {
  return options.filter((option) => {
    const isActive = active.pileSizes.includes(option.pile_size_mm ?? option.configuration.pile_size_mm)
      && active.pileTipLevelMms.includes(option.configuration.pile_tip_level_mm);
    return isActive || (retainedConfiguration !== undefined
      && samePileConfiguration(option.configuration, retainedConfiguration));
  });
}

export function toggleActiveNumber(values: number[], value: number, enabled: boolean, descending = false): number[] {
  const nextValues = new Set(values);

  if (enabled) {
    nextValues.add(value);
  } else {
    nextValues.delete(value);
  }

  return [...nextValues].sort((left, right) => (descending ? right - left : left - right));
}

export function pileConfigurationKey(
  option: Pick<PileConfigurationOption, "configuration">,
): PileConfigurationKey {
  return { ...option.configuration };
}
