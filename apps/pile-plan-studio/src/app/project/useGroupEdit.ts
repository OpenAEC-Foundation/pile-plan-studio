import { useEffect, useRef, useState } from "react";
import { applyLoadPointGroupEditCore, previewLoadPointGroupEditCore } from "../../core/coreClient.ts";
import { createGroupEditController, type GroupEditDependencies } from "./groupEditController.ts";

type Dependencies = Omit<GroupEditDependencies, "evaluate" | "preview" | "setPending">;

export function useGroupEdit(dependencies: Dependencies) {
  const latest = useRef(dependencies);
  latest.current = dependencies;
  const [pending, setPending] = useState(false);
  const controller = useRef<ReturnType<typeof createGroupEditController> | null>(null);
  if (controller.current === null) {
    controller.current = createGroupEditController({
      currentState: () => latest.current.currentState(),
      ready: () => latest.current.ready(),
      commit: (update, action) => latest.current.commit(update, action),
      blocked: (reason) => latest.current.blocked(reason),
      evaluate: applyLoadPointGroupEditCore,
      preview: previewLoadPointGroupEditCore,
      setPending,
    });
  }
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active]);
  return { pending, apply: active.apply, preview: active.preview };
}
