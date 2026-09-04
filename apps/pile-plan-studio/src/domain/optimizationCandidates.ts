import type {
  OptimizationCandidateSource,
  PileConfigurationKey,
  PileConfigurationOption,
} from "../core/projectTypes.ts";
import { pileConfigurationToken } from "../core/pileConfigurationKey.ts";
import type { ActivePileConfigurations } from "./activePileConfigurations.ts";

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

export function resolveOptimizationCandidates(
  catalog: Iterable<PileConfigurationKey>,
  source: OptimizationCandidateSource,
  active: ActivePileConfigurations,
): PileConfigurationKey[] {
  const selected = source === "all_available"
    ? catalog
    : [...catalog].filter((key) => active.pileSizes.includes(key.pile_size_mm)
      && active.pileTipLevels.includes(key.pile_tip_level_mm / 1_000));
  return deduplicateAndSortPileConfigurationKeys(selected);
}

export function optimizationCandidateToken(candidates: Iterable<PileConfigurationKey>): string {
  return deduplicateAndSortPileConfigurationKeys(candidates)
    .map(pileConfigurationToken)
    .join(";");
}
