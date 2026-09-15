import { useState, type MouseEvent } from "react";
import type { ProjectState } from "../../../domain/projectState";
import Legend from "./Legend";
import LegendEditor from "./legend-editor/LegendEditor";
import PilePlanViewer from "../pile-plan-viewer/PilePlanViewer";
import { clearLegendSelection, shouldClearLegendSelectionFromPointerTarget } from "../viewerInteractions";
import "../pile-plan-viewer/viewer.css";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import { replacePilePlanActivation } from "../../../domain/pilePlanActivation.ts";
import { useTipLevelRegionTopology } from "../pile-plan-viewer/tip-level-regions/useTipLevelRegionTopology.ts";

type Props = {
  state: ProjectState;
  loadPointGroups: LoadPointGroup[];
  technicalAssignment: TechnicalAssignmentSnapshot;
  lassoSelectionActive: boolean;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanWorkspace({ state, loadPointGroups, technicalAssignment, lassoSelectionActive, onStateChange }: Props) {
  const [legendEditorOpen, setLegendEditorOpen] = useState(false);
  const tipLevelRegions = useTipLevelRegionTopology({
    enabled: state.showTipLevelRegions,
    loadPoints: state.loadPoints,
    selectedPileConfigurationsByLoadPoint: state.selectedPileConfigurationsByLoadPoint,
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId,
  });

  return (
    <section className="pile-plan-workspace" onMouseDownCapture={handleMouseDownCapture}>
      <Legend
        state={state}
        tipLevelRegionStatus={tipLevelRegions.status}
        onEdit={() => setLegendEditorOpen(true)}
        onStateChange={onStateChange}
      />
      <PilePlanViewer
        state={state}
        loadPointGroups={loadPointGroups}
        technicalAssignment={technicalAssignment}
        lassoSelectionActive={lassoSelectionActive}
        tipLevelRegionTopology={tipLevelRegions.topology}
        onStateChange={onStateChange}
      />
      <LegendEditor
        open={legendEditorOpen}
        state={state}
        onClose={() => setLegendEditorOpen(false)}
        onApply={(draft, enableTipLevelRegions) => {
          onStateChange({
            ...state,
            pilePlans: replacePilePlanActivation(
              state.pilePlans,
              state.activePilePlanId,
              draft.active,
            ),
            pileLegend: draft.legend,
            showTipLevelRegions: enableTipLevelRegions ? true : state.showTipLevelRegions,
          });
          setLegendEditorOpen(false);
        }}
      />
    </section>
  );

  function handleMouseDownCapture(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element) || !hasLegendSelection(state)) {
      return;
    }

    if (shouldClearLegendSelectionFromPointerTarget(target)) {
      onStateChange({ ...state, ...clearLegendSelection(state) });
    }
  }
}

function hasLegendSelection(state: ProjectState): boolean {
  return state.legendSelectionFilter.pileSizes.length > 0 || state.legendSelectionFilter.pileTipLevels.length > 0;
}
