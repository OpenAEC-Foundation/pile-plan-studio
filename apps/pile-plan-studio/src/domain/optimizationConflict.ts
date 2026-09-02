import type { GreedyUnassignedReason } from "../core/projectTypes.ts";
import type { LoadPointGroup } from "../core/loadPointGroupContract.ts";

type PileOptionValidity = { isOption: boolean };

export type OptimizationConflictDetails = {
  kind: Exclude<GreedyUnassignedReason, "no_valid_option">;
  relatedLoadPointIds: number[];
  countsWithinOptimizationLimits: boolean;
};

export function getOptimizationConflictDetails(input: {
  loadPointId: number;
  reason: GreedyUnassignedReason | undefined;
  groups: LoadPointGroup[];
  optionsByLoadPointId: ReadonlyMap<number, PileOptionValidity[]>;
}): OptimizationConflictDetails | null {
  if (!input.reason || input.reason === "no_valid_option") return null;

  const relatedLoadPointIds = input.reason === "group_member_without_valid_option"
    ? (input.groups.find((group) => group.load_point_ids.includes(input.loadPointId))
      ?.load_point_ids.filter((loadPointId) => (
        loadPointId !== input.loadPointId
        && !input.optionsByLoadPointId.get(loadPointId)?.some((option) => option.isOption)
      )) ?? [])
    : [];

  return {
    kind: input.reason,
    relatedLoadPointIds,
    countsWithinOptimizationLimits: input.reason === "optimization_constraints"
      || input.reason === "configuration_limits",
  };
}
