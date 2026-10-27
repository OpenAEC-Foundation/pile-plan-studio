import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { evaluatePileCapProposalsCore } from "../../core/pileCapProposalCoreClient.ts";
import {
  createPileCapProposalController,
  pileCapProposalInputKey,
  type PileCapProposalSnapshot,
} from "./pileCapProposalController.ts";
import type { PileCapProposal } from "../../core/pileCapProposalTypes.ts";

export function usePileCapProposals(
  state: ProjectState,
  commit: (update: (state: ProjectState) => ProjectState) => void,
  failed: () => void,
) {
  const live = useRef({ state, commit, failed });
  live.current = { state, commit, failed };
  const [snapshot, setSnapshot] = useState<PileCapProposalSnapshot>({
    key: "",
    result: null,
    pending: false,
    error: false,
  });
  const ref = useRef<ReturnType<typeof createPileCapProposalController> | null>(
    null,
  );
  const key = pileCapProposalInputKey(state);
  useEffect(() => {
    const controller = createPileCapProposalController({
      evaluate: evaluatePileCapProposalsCore,
      currentState: () => live.current.state,
      commit: (update) => live.current.commit(update),
      failed: () => live.current.failed(),
      publish: setSnapshot,
    });
    ref.current = controller;
    return () => {
      controller.dispose();
      if (ref.current === controller) ref.current = null;
    };
  }, []);
  useEffect(() => {
    void ref.current?.refresh(live.current.state);
  }, [key, state.loadPoints]);
  const fresh = snapshot.key === key && snapshot.source === state.loadPoints;
  return {
    result: fresh ? snapshot.result : null,
    pending: !fresh
      ? state.pilePlans.some((p) => p.pileCapProposals?.length)
      : snapshot.pending,
    error: fresh && snapshot.error,
    edit: (proposal: PileCapProposal, remove = false) =>
      ref.current?.edit(proposal, remove),
    resetAll: () => ref.current?.resetAll(),
  };
}
