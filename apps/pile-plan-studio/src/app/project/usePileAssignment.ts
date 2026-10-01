import { useEffect, useRef, useState } from "react";
import { applyLoadPointGroupAssignmentCore } from "../../core/coreClient.ts";
import { createPileAssignmentController, type PileAssignmentDependencies } from "./pileAssignmentController.ts";

type Dependencies = Omit<PileAssignmentDependencies, "evaluate" | "setPending">;

export function usePileAssignment(dependencies: Dependencies) {
  const latest = useRef(dependencies);
  latest.current = dependencies;
  const [pending, setPending] = useState(false);
  const controller = useRef<ReturnType<typeof createPileAssignmentController> | null>(null);
  if (controller.current === null) {
    controller.current = createPileAssignmentController({
      currentState: () => latest.current.currentState(),
      currentGroups: () => latest.current.currentGroups(),
      groupsReady: () => latest.current.groupsReady(),
      commit: (update) => latest.current.commit(update),
      blocked: (names) => latest.current.blocked(names),
      failed: (message) => latest.current.failed(message),
      evaluate: applyLoadPointGroupAssignmentCore,
      setPending,
    });
  }
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active]);
  return { pending, apply: active.apply, invalidate: active.invalidate };
}
