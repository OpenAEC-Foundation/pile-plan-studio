import type { calculatePileOptionAnalysisCore } from "../../core/coreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { getCptSelectionPreviewInput, beginCptSelectionPreview, applyCptSelectionPreviewResult,
  failCptSelectionPreview } from "../../domain/cpt-selection/cptSettingsModel.ts";

type Dependencies = {
  update: (update: (state: ProjectState) => ProjectState) => void;
  analyze: typeof calculatePileOptionAnalysisCore;
  failed: (error: unknown) => void;
};

/** A preview is transient and can only install results for the same manual CPT draft. */
export function runCptSelectionPreview(state: ProjectState, dependencies: Dependencies) {
  const input = getCptSelectionPreviewInput(state);
  if (!input) return null;
  const { draft } = input;
  let cancelled = false;
  dependencies.update(current => beginCptSelectionPreview(current, draft));
  const finished = dependencies.analyze({
    bearingCapacities: state.bearingCapacities,
    cpts: state.cpts,
    globalSettings: state.globalCptSelectionSettings,
    loadPoints: input.loadPoints,
    manualCptIdsByLoadPoint: input.manualCptIdsByLoadPoint,
    settingsByLoadPoint: state.cptSelectionSettingsByLoadPoint,
    includeCptFrdRows: false,
  }).then(analysis => {
    if (!cancelled) dependencies.update(current =>
      cancelled ? current : applyCptSelectionPreviewResult(current, draft, analysis));
  }).catch((error: unknown) => {
    dependencies.failed(error);
    if (!cancelled) dependencies.update(current => cancelled ? current : failCptSelectionPreview(
      current, draft, error instanceof Error ? error.message : String(error),
    ));
  });
  return { finished, cancel: () => { cancelled = true; } };
}
