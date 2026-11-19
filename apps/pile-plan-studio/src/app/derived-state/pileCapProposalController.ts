import type { ProjectState } from "../../domain/project/projectState.ts";
import { createProjectPersistenceSelector, projectDraftFromState } from "../project/projectLifecycleController.ts";
import { installPileCapProposals } from "../../domain/pile-plans/pileCapProposals.ts";
import type {
  PileCapProposal,
  PileCapProposalEdit,
  PileCapProposalResult,
} from "../../core/pileCapProposalTypes.ts";
import type { ProjectDocumentDraft } from "../../core/projectDocumentContract.ts";

export { projectDraftFromState as pileCapProposalDraft };

export function hasPileCapProposals(state: ProjectState): boolean {
  return state.pilePlans.some((plan) => Boolean(plan.pileCapProposals?.length));
}

export function pileCapProposalInputKey(state: ProjectState, signature: string): string {
  return `${state.activePilePlanId}\n${signature}`;
}

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
  selectPersistence?: ReturnType<typeof createProjectPersistenceSelector>;
}) {
  const selectPersistence = options.selectPersistence ?? createProjectPersistenceSelector();
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
      const run = ++generation;
      const hasProposals = hasPileCapProposals(state);
      const persistence = hasProposals || completed?.source === state.loadPoints
        ? selectPersistence(state) : null;
      const key = persistence ? pileCapProposalInputKey(state, persistence.signature) : "";
      if (completed?.source === state.loadPoints && completed.key === key) {
        options.publish(completed);
        return;
      }
      if (!hasProposals || !persistence) {
        options.publish({
          source: state.loadPoints,
          key: "",
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
        const result = await options.evaluate(persistence.draft);
        if (
          !disposed &&
          run === generation &&
          matchesInput(options.currentState(), state, key)
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
          matchesInput(options.currentState(), state, key)
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

  function matchesInput(current: ProjectState, source: ProjectState, key: string): boolean {
    return current.loadPoints === source.loadPoints && current.activePilePlanId === source.activePilePlanId
      && pileCapProposalInputKey(current, selectPersistence(current).signature) === key;
  }

  async function edit(proposal: PileCapProposal | null, remove = false) {
    if (disposed || editing) return;
    const source = options.currentState();
    const planId = source.activePilePlanId;
    if (!proposal && !source.pilePlans.find(plan => plan.id === planId)?.pileCapProposals?.length) return;
    const { draft, signature } = selectPersistence(source);
    const key = pileCapProposalInputKey(source, signature);
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
      const editDraft = proposal ? draft : projectDraftFromState(installPileCapProposals(source, planId, []));
      const result = await options.evaluate(editDraft, proposal ? {
        plan_id: planId,
        proposal,
        remove,
      } : undefined);

      if (disposed || !matchesInput(options.currentState(), source, key)) return;
      const plan = result.plans.find((p) => p.plan_id === planId);
      if (!plan) throw Error("Missing proposal plan");
      if (!proposal && plan.proposals.length > 0) throw Error("Incomplete proposal reset");
      const next = installPileCapProposals(source, planId, plan.proposals);

      options.commit((current) =>
        !disposed && matchesInput(current, source, key)
          ? installPileCapProposals(current, planId, plan.proposals)
          : current,
      );
      publishCompleted({
        source: source.loadPoints,
        key: pileCapProposalInputKey(next, selectPersistence(next).signature),
        result,
        pending: false,
        error: false,
      });
    } catch {
      if (!disposed && matchesInput(options.currentState(), source, key)) {
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
