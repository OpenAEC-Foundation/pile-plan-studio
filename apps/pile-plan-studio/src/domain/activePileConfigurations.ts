import type { PileConfigurationOption, PileConfigurationKey } from "../core/projectTypes.ts";
import { samePileConfiguration } from "../core/pileConfigurationKey.ts";

export type ActivePileConfigurations = {
  pileSizes: number[];
  pileTipLevelMms: number[];
};

export function isPileConfigurationActive(
  option: Pick<PileConfigurationOption, "pile_size_mm" | "configuration">,
  active: ActivePileConfigurations,
): boolean {
  return active.pileSizes.includes(option.pile_size_mm)
    && active.pileTipLevelMms.includes(option.configuration.pile_tip_level_mm);
}

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

export function getUsedPileConfigurations(
  options: Array<Pick<PileConfigurationOption, "pile_size_mm" | "configuration"> | null>,
): ActivePileConfigurations {
  return {
    pileSizes: [...new Set(options.flatMap((option) => option ? [option.pile_size_mm] : []))]
      .sort((left, right) => left - right),
    pileTipLevelMms: [...new Set(options.flatMap((option) => (
      option ? [option.configuration.pile_tip_level_mm] : []
    )))]
      .sort((left, right) => right - left),
  };
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

export function toggleActivePileConfiguration(
  active: ActivePileConfigurations,
  kind: "size" | "tip",
  value: number,
): ActivePileConfigurations {
  if (kind === "size") {
    return {
      ...active,
      pileSizes: toggleActiveNumber(active.pileSizes, value, !active.pileSizes.includes(value)),
    };
  }

  return {
    ...active,
    pileTipLevelMms: toggleActiveNumber(
      active.pileTipLevelMms,
      value,
      !active.pileTipLevelMms.includes(value),
      true,
    ),
  };
}

export function shouldDisableActivePileConfigurationToggle(
  _active: ActivePileConfigurations,
  _kind: "size" | "tip",
  _value: number,
): boolean {
  return false;
}

export function pileConfigurationKey(
  option: Pick<PileConfigurationOption, "configuration">,
): PileConfigurationKey {
  return { ...option.configuration };
}
