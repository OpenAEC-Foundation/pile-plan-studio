import type { PileConfigurationKey } from "./projectTypes.ts";

export function pileConfigurationToken(key: PileConfigurationKey): string {
  return `${key.pile_size_mm}|${key.pile_tip_level_mm}`;
}

export function samePileConfiguration(
  left: PileConfigurationKey | null | undefined,
  right: PileConfigurationKey | null | undefined,
): boolean {
  return left === right || (
    left !== null && left !== undefined && right !== null && right !== undefined
    && left.pile_size_mm === right.pile_size_mm
    && left.pile_tip_level_mm === right.pile_tip_level_mm
  );
}

export function clonePileConfiguration(
  key: PileConfigurationKey,
): PileConfigurationKey {
  return { ...key };
}
