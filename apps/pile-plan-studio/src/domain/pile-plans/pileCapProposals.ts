import type { PileCapProposal } from "../../core/pileCapProposalTypes.ts";
import type { LoadPointGroup } from "../../core/loadPointGroupContract.ts";
import type { ProjectState } from "../project/projectState.ts";

export const pileCapGroupKey = (ids: readonly number[]): string =>
  [...ids].sort((a, b) => a - b).join(",");

export function findSelectedPileCapGroup(
  ids: readonly number[],
  groups: readonly LoadPointGroup[],
): number[] | null {
  const key = pileCapGroupKey(ids);
  const group = groups.find((g) => pileCapGroupKey(g.load_point_ids) === key);
  return group ? [...group.load_point_ids].sort((a, b) => a - b) : null;
}

export function installPileCapProposals(
  state: ProjectState,
  planId: string,
  proposals: PileCapProposal[],
): ProjectState {
  if (!state.pilePlans.some((p) => p.id === planId)) return state;
  return {
    ...state,
    pilePlans: state.pilePlans.map((plan) =>
      plan.id === planId
        ? { ...plan, pileCapProposals: structuredClone(proposals) }
        : plan,
    ),
  };
}
