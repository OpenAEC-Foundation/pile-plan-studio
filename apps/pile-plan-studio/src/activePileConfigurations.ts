import type { PileConfigurationOption, PileConfigurationKey } from "./projectTypes.ts";

export type ActivePileConfigurations = {
  pileSizes: number[];
  pileTipLevels: number[];
};

export function isPileConfigurationActive(
  option: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
  active: ActivePileConfigurations,
): boolean {
  return active.pileSizes.includes(option.pile_size_mm) && active.pileTipLevels.includes(option.pile_tip_level_m);
}

export function filterActivePileOptions<T extends Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">>(
  options: T[],
  active: ActivePileConfigurations,
): T[] {
  return options.filter((option) => isPileConfigurationActive(option, active));
}

export function getUsedPileConfigurations(
  options: Array<Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m"> | null>,
): ActivePileConfigurations {
  return {
    pileSizes: [...new Set(options.flatMap((option) => option ? [option.pile_size_mm] : []))]
      .sort((left, right) => left - right),
    pileTipLevels: [...new Set(options.flatMap((option) => option ? [option.pile_tip_level_m] : []))]
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
    pileTipLevels: toggleActiveNumber(active.pileTipLevels, value, !active.pileTipLevels.includes(value), true),
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
  option: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">,
): PileConfigurationKey {
  return {
    pile_size_mm: option.pile_size_mm,
    pile_tip_level_m_key: Math.round(option.pile_tip_level_m * 1000),
  };
}
