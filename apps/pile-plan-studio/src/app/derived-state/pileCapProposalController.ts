import type { ProjectState } from "../../domain/project/projectState.ts";
import {
  captureProjectContent,
  normalizeProjectContentState,
  projectDocumentDraftFromContent,
} from "../../domain/project/projectContent.ts";
import { installPileCapProposals } from "../../domain/pile-plans/pileCapProposals.ts";
import type {
  PileCapProposal,
  PileCapProposalEdit,
  PileCapProposalResult,
} from "../../core/pileCapProposalTypes.ts";
import type { ProjectDocumentDraft } from "../../core/projectDocumentContract.ts";

export function pileCapProposalDraft(
  state: ProjectState,
): ProjectDocumentDraft {
  return projectDocumentDraftFromContent(
    captureProjectContent(normalizeProjectContentState(state)),
    state.activePilePlanId,
  );
}
export const pileCapProposalInputKey = (state: ProjectState): string =>
  JSON.stringify([state.activePilePlanId, pileCapProposalDraft(state)]);

export type PileCapProposalSnapshot = {
  source?: ProjectState["loadPoints"];
  key: string;
  result: PileCapProposalResult | null;
  pending: boolean;
  error: boolean;
};
export function createPileCapProposalController(options: {
  evaluate: (
    draft: ProjectDocumentDraft,
    edit?: PileCapProposalEdit | null,
  ) => Promise<PileCapProposalResult>;
  currentState: () => ProjectState;
  commit: (update: (state: ProjectState) => ProjectState) => void;
  publish: (snapshot: PileCapProposalSnapshot) => void;
  failed: () => void;
}) {
  let generation = 0,
    disposed = false,
    editing = false;
  let completed: PileCapProposalSnapshot | null = null;
  const publishCompleted = (snapshot: PileCapProposalSnapshot) => {
    completed = snapshot;
    options.publish(snapshot);
  };
  return {
    async refresh(state: ProjectState) {
      const run = ++generation,
        key = pileCapProposalInputKey(state);
      if (completed?.source === state.loadPoints && completed.key === key) {
        options.publish(completed);
        return;
      }
      if (!state.pilePlans.some((p) => p.pileCapProposals?.length)) {
        options.publish({
          source: state.loadPoints,
          key,
          result: null,
          pending: false,
          error: false,
        });
        return;
      }
      options.publish({
        source: state.loadPoints,
        key,
        result: null,
        pending: true,
        error: false,
      });
      try {
        const result = await options.evaluate(pileCapProposalDraft(state));
        if (
          !disposed &&
          run === generation &&
          options.currentState().loadPoints === state.loadPoints &&
          pileCapProposalInputKey(options.currentState()) === key
        )
          publishCompleted({
            source: state.loadPoints,
            key,
            result,
            pending: false,
            error: false,
          });
      } catch {
        if (
          !disposed &&
          run === generation &&
          options.currentState().loadPoints === state.loadPoints &&
          pileCapProposalInputKey(options.currentState()) === key
        )
          options.publish({
            source: state.loadPoints,
            key,
            result: null,
            pending: false,
            error: true,
          });
      }
    },
    edit: (proposal: PileCapProposal, remove = false) => edit(proposal, remove),
    resetAll: () => edit(null),
    dispose() {
      disposed = true;
      ++generation;
    },
  };

  async function edit(proposal: PileCapProposal | null, remove = false) {
    if (disposed || editing) return;
    const source = options.currentState(),
      key = pileCapProposalInputKey(source),
      planId = source.activePilePlanId;
    if (!proposal && !source.pilePlans.find(plan => plan.id === planId)?.pileCapProposals?.length) return;
    editing = true;
    const previousResult = completed?.source === source.loadPoints && completed.key === key
      ? completed.result : null;

    ++generation;
    options.publish({
      source: source.loadPoints,
      key,
      result: previousResult,
      pending: true,
      error: false,
    });
    try {
      const draft = proposal ? source : installPileCapProposals(source, planId, []);
      const result = await options.evaluate(pileCapProposalDraft(draft), proposal ? {
        plan_id: planId,
        proposal,
        remove,
      } : undefined);

      if (
        disposed ||
        options.currentState().loadPoints !== source.loadPoints ||
        pileCapProposalInputKey(options.currentState()) !== key
      )
        return;
      const plan = result.plans.find((p) => p.plan_id === planId);
      if (!plan) throw Error("Missing proposal plan");
      if (!proposal && plan.proposals.length > 0) throw Error("Incomplete proposal reset");
      const next = installPileCapProposals(source, planId, plan.proposals);

      options.commit((current) =>
        !disposed &&
        current.loadPoints === source.loadPoints &&
        pileCapProposalInputKey(current) === key
          ? installPileCapProposals(current, planId, plan.proposals)
          : current,
      );
      publishCompleted({
        source: source.loadPoints,
        key: pileCapProposalInputKey(next),
        result,
        pending: false,
        error: false,
      });
    } catch {
      if (
        !disposed &&
        pileCapProposalInputKey(options.currentState()) === key
      ) {
        options.publish({
          source: source.loadPoints,
          key,
          result: previousResult,
          pending: false,
          error: true,
        });
        options.failed();
      }
    } finally {
      editing = false;
    }
  }
}
