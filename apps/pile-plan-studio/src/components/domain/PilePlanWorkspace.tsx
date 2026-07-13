import type { MouseEvent } from "react";
import type { ProjectState } from "../../domain/projectState";
import Legend from "./Legend";
import PilePlanViewer from "./PilePlanViewer";
import { clearLegendSelection, shouldClearLegendSelectionFromPointerTarget } from "./viewerInteractions";
import "./viewer.css";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanWorkspace({ state, onStateChange }: Props) {
  return (
    <section className="pile-plan-workspace" onMouseDownCapture={handleMouseDownCapture}>
      <Legend state={state} onStateChange={onStateChange} />
      <PilePlanViewer state={state} onStateChange={onStateChange} />
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
