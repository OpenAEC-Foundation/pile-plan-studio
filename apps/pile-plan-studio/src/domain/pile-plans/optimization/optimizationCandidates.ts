import type {
  PileConfigurationKey,
  PileConfigurationOption,
} from "../../../core/projectTypes.ts";
import { pileConfigurationToken } from "../../../core/pileConfigurationKey.ts";

export function deduplicateAndSortPileConfigurationKeys(
  keys: Iterable<PileConfigurationKey>,
): PileConfigurationKey[] {
  return [...new Map(
    [...keys].map((key) => [pileConfigurationToken(key), { ...key }]),
  ).values()].sort((left, right) => left.pile_size_mm - right.pile_size_mm
    || right.pile_tip_level_mm - left.pile_tip_level_mm);
}

export function getAvailablePileConfigurationCatalog(
  optionsByLoadPoint: Map<number, PileConfigurationOption[]>,
): PileConfigurationKey[] {
  return deduplicateAndSortPileConfigurationKeys(
    [...optionsByLoadPoint.values()].flat().map(({ configuration }) => configuration),
  );
}
