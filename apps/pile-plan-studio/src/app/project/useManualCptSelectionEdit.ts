import { useEffect, useRef, useState } from "react";
import { validateManualCptSelectionBatchCore } from "../../core/locationBulkCoreClient.ts";
import { createManualCptEditController, type ManualCptEditDependencies } from "./manualCptEditController.ts";

export function useManualCptSelectionEdit(dependencies: Omit<ManualCptEditDependencies, "evaluate" | "setPending">) {
  const latest = useRef(dependencies);
  latest.current = dependencies;
  const [pending, setPending] = useState(false);
  const controller = useRef<ReturnType<typeof createManualCptEditController> | null>(null);
  controller.current ??= createManualCptEditController({
    currentState: () => latest.current.currentState(),
    commit: update => latest.current.commit(update),
    blocked: () => latest.current.blocked(), failed: error => latest.current.failed(error),
    evaluate: validateManualCptSelectionBatchCore, setPending,
  });
  const active = controller.current;
  useEffect(() => () => active.invalidate(), [active]);
  return { pending, save: active.save, applyMethod: active.applyMethod };
}
