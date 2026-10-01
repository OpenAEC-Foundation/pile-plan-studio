import { useEffect, useRef } from "react";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { calculatePileOptionAnalysisCore } from "../../core/coreClient.ts";
import { runCptSelectionPreview } from "./cptSelectionPreview.ts";

export function useCptSelectionPreview(state: ProjectState, update: (update: (state: ProjectState) => ProjectState) => void) {
  const latest = useRef({ state, update });
  latest.current = { state, update };
  useEffect(() => {
    const task = runCptSelectionPreview(latest.current.state, {
      update: latest.current.update,
      analyze: calculatePileOptionAnalysisCore,
      failed: error => console.error("Failed to preview CPT selection", error),
    });
    return task?.cancel;
  }, [state.cptSelectionEditDraft]);
}
