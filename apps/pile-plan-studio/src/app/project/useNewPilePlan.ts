import { useEffect, useRef, useState } from "react";
import { chooseDefaultPileOptionsCore } from "../../core/coreClient.ts";
import { createNewPilePlanController, type NewPilePlanDependencies } from "./newPilePlanController.ts";

export function useNewPilePlan(dependencies: Omit<NewPilePlanDependencies, "choose" | "setPending">) {
  const latest = useRef(dependencies);
  latest.current = dependencies;
  const [pending, setPending] = useState(false);
  const controller = useRef<ReturnType<typeof createNewPilePlanController> | null>(null);
  if (controller.current === null) {
    controller.current = createNewPilePlanController({
      snapshot: () => latest.current.snapshot(),
      language: () => latest.current.language(),
      commit: update => latest.current.commit(update),
      failed: error => latest.current.failed(error),
      choose: chooseDefaultPileOptionsCore, setPending,
    });
  }
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active]);
  return { pending, create: active.create };
}
