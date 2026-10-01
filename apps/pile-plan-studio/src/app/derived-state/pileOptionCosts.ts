import { calculatePileCostCore } from "../../core/analysisCoreClient.ts";
import { pileConfigurationToken } from "../../core/pileConfigurationKey.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";

export type PileOptionCostInput = Pick<ProjectState,
  "pileOptionsByLoadPointId" | "pileCostSettings" | "pileHeadLevelM">;

export async function calculatePileOptionCosts(
  input: PileOptionCostInput, calculate = calculatePileCostCore,
): Promise<Map<string, number | null>> {
  const uniqueOptions = new Map([...input.pileOptionsByLoadPointId.values()].flat()
    .map((option) => [pileConfigurationToken(option.configuration), option]));
  const entries = await Promise.all([...uniqueOptions].map(async ([key, option]) => [
    key, await calculate({
      pileSizeMm: option.pile_size_mm, pileTipLevelM: option.pile_tip_level_m,
      pileHeadLevelM: input.pileHeadLevelM ?? 0, settings: input.pileCostSettings,
    }),
  ] as const));
  return new Map(entries);
}
