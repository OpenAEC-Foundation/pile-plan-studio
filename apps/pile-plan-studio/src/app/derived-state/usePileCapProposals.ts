import { useEffect, useRef, useState } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { evaluatePileCapProposalsCore } from "../../core/pileCapProposalCoreClient.ts";
import {
  createPileCapProposalController,
  hasPileCapProposals,
  pileCapProposalInputKey,
  type PileCapProposalSnapshot,
} from "./pileCapProposalController.ts";
import { createProjectPersistenceSelector } from "../project/projectLifecycleController.ts";
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
  const [selectPersistence] = useState(createProjectPersistenceSelector);
  const hasProposals = hasPileCapProposals(state);
  const key = hasProposals || snapshot.key !== ""
    ? pileCapProposalInputKey(state, selectPersistence(state).signature) : "";
  const refreshKey = hasProposals ? key : "";
  const fresh = snapshot.key === key && snapshot.source === state.loadPoints;
  const staleEmptySnapshot = !hasProposals && snapshot.key !== "" && !fresh;
  useEffect(() => {
    const controller = createPileCapProposalController({
      selectPersistence,
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
  }, [selectPersistence]);
  useEffect(() => {
    void ref.current?.refresh(live.current.state);
  }, [refreshKey, state.loadPoints, staleEmptySnapshot]);
  return {
    result: fresh ? snapshot.result : null,
    pending: fresh ? snapshot.pending : hasProposals,
    error: fresh && snapshot.error,
    edit: (proposal: PileCapProposal, remove = false) =>
      ref.current?.edit(proposal, remove),
    resetAll: () => ref.current?.resetAll(),
  };
}
