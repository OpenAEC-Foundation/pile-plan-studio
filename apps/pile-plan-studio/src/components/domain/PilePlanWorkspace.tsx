import { useState, type MouseEvent } from "react";
import type { ProjectState } from "../../domain/projectState";
import Legend from "./Legend";
import LegendEditor from "./LegendEditor";
import PilePlanViewer from "./PilePlanViewer";
import { clearLegendSelection, shouldClearLegendSelectionFromPointerTarget } from "./viewerInteractions";
import "./viewer.css";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanWorkspace({ state, onStateChange }: Props) {
  const [legendEditorOpen, setLegendEditorOpen] = useState(false);

  return (
    <section className="pile-plan-workspace" onMouseDownCapture={handleMouseDownCapture}>
      <Legend
        state={state}
        onEdit={() => setLegendEditorOpen(true)}
        onStateChange={onStateChange}
      />
      <PilePlanViewer state={state} onStateChange={onStateChange} />
      <LegendEditor
        open={legendEditorOpen}
        state={state}
        onClose={() => setLegendEditorOpen(false)}
        onApply={(draft) => {
          onStateChange({
            ...state,
            activePileSizes: draft.active.pileSizes,
            activePileTipLevels: draft.active.pileTipLevels,
            pileLegend: draft.legend,
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
