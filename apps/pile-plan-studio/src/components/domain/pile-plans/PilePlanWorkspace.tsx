import { useState, type MouseEvent } from "react";
import type { ProjectState } from "../../../domain/project/projectState";
import Legend from "./Legend";
import LegendEditor from "./legend-editor/LegendEditor";
import PilePlanViewer from "../pile-plan-viewer/PilePlanViewer";
import { clearLegendSelection, shouldClearLegendSelectionFromPointerTarget } from "../../../domain/workspace/viewerInteractions";
import "../pile-plan-viewer/viewer.css";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import type { LoadPointTopology } from "../../../core/tipLevelRegionContract.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { GroupAssignmentAssessmentSnapshot } from "../../../app/derived-state/groupAssignmentAssessmentController.ts";
import { replacePilePlanActivation } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { useTipLevelRegionTopology } from "../pile-plan-viewer/tip-level-regions/useTipLevelRegionTopology.ts";

type Props = {
  readOnly?: boolean;
  state: ProjectState;
  loadPointGroups: LoadPointGroup[];
  loadPointGroupTopology: LoadPointTopology | null;
  technicalAssignment: TechnicalAssignmentSnapshot;
  groupAssignmentAssessment: GroupAssignmentAssessmentSnapshot;
  lassoSelectionActive: boolean;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanWorkspace({ readOnly = false, state, loadPointGroups, loadPointGroupTopology, technicalAssignment, groupAssignmentAssessment, lassoSelectionActive, onStateChange }: Props) {
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
        readOnly={readOnly}
        state={state}
        tipLevelRegionStatus={tipLevelRegions.status}
        onEdit={() => setLegendEditorOpen(true)}
        onStateChange={onStateChange}
      />
      <PilePlanViewer
        state={state}
        loadPointGroups={loadPointGroups}
        loadPointGroupTopology={loadPointGroupTopology}
        technicalAssignment={technicalAssignment}
        groupAssignmentAssessment={groupAssignmentAssessment}
        lassoSelectionActive={lassoSelectionActive}
        tipLevelRegionTopology={tipLevelRegions.topology}
        onStateChange={onStateChange}
      />
      <LegendEditor
        open={legendEditorOpen && !readOnly}
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
