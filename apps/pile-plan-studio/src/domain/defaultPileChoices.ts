import type { PileConfigurationKey } from "../core/projectTypes.ts";

export function mergeDefaultPileChoices(
  retained: Map<number, PileConfigurationKey>,
  defaults: Map<number, PileConfigurationKey>,
): Map<number, PileConfigurationKey> {
  return new Map([...defaults, ...retained]);
}
