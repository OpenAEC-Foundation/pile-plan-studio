import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { projectFixture } from "../../../test/projectFixture.ts";
import { beginManualCptSelection } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { createProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { useViewerPointerInteractions, type ViewerInteraction } from "./useViewerPointerInteractions.ts";
import type { LocalCanvasRect } from "./viewerDomCoordinates.ts";

const transform = createProjectViewTransform({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 }, { width: 1000, height: 1000 });

function fixture(editing: boolean, foregroundLayer: ProjectState["foregroundLayer"] = "load-points") {
  const project = projectFixture();
  const state = { ...project, foregroundLayer,
    loadPoints: [{ id: 15, name: "Load point 15", x_mm: 500, y_mm: 500, design_load_kn: 100 }],
    cpts: [{ id: 66, name: "CPT 66", x_mm: 505, y_mm: 500 }],
    selectedLoadPointId: 15, selectedLoadPointIds: [15],
    manualCptIdsByLoadPoint: new Map(), selectedCptsByLoadPointId: new Map(),
  };
  return editing ? beginManualCptSelection(state) : state;
}

function Harness({ state, changed, selected }: {
  state: ProjectState; changed: (state: ProjectState) => void; selected: (state: ProjectState) => void;
}) {
  const pointer = useViewerPointerInteractions({
    state, onStateChange: changed, onSelectionChange: selected, loadPointGroups: [],
    lassoSelectionActive: false, isEditingLoadPointLocks: false,
    isEditingCptSelection: state.cptSelectionEditDraft !== null, lockedLoadPointIds: new Set(),
    projectTransform: transform, projectTransformRef: useRef(transform),
    interactionRef: useRef<ViewerInteraction | null>(null),
    canvasRectRef: useRef<LocalCanvasRect>({ left: 0, top: 0, width: 1000, height: 1000, scale: 1 }),
    viewportRef: useRef(state.viewport), zoomCommitTimerRef: useRef(null),
    applyViewportDisplay: () => {}, getProjectViewportPointer: (x, y) => ({ x, y }),
    getVisibleLoadPointScreenPoints: () => [],
  });
  return <div onMouseMove={pointer.handleMouseMove}>
    <button data-map-marker-key="load-point:15" onClick={event => pointer.handleLoadPointClick(event, 15)}>Load point</button>
    <button data-map-marker-key="cpt:66" onClick={event => pointer.handleCptClick(event, 66)}>CPT</button>
    <output aria-label="Candidate">{pointer.activeHoverCandidateKey ?? "none"}</output>
  </div>;
}

function setup(state: ProjectState) {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  const changed = vi.fn(), selected = vi.fn();
  const view = render(<Harness state={state} changed={changed} selected={selected} />);
  return { ...view, changed, selected, rerenderState: (next: ProjectState) => view.rerender(<Harness state={next} changed={changed} selected={selected} />) };
}

function hover() {
  fireEvent.mouseMove(screen.getByRole("button", { name: "Load point" }), { clientX: 500, clientY: 500 });
  act(() => { vi.runOnlyPendingTimers(); });
}

test("CPT editing prioritizes the nearby CPT even over a closer foreground load point", () => {
  const h = setup(fixture(true));
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("cpt:66");
  fireEvent.click(screen.getByRole("button", { name: "Load point" }), { clientX: 500, clientY: 500 });
  expect(h.changed).toHaveBeenCalledOnce();
  expect(h.changed.mock.calls[0]![0].cptSelectionEditDraft?.cptIdsByLoadPoint.get(15)?.has(66)).toBe(true);
  expect(h.selected).not.toHaveBeenCalled();
});

test("a direct click without prior hover also targets a CPT during editing", () => {
  const h = setup(fixture(true));
  fireEvent.click(screen.getByRole("button", { name: "Load point" }), { clientX: 500, clientY: 500 });
  expect(h.changed).toHaveBeenCalledOnce();
  expect(h.changed.mock.calls[0]![0].cptSelectionEditDraft?.cptIdsByLoadPoint.get(15)?.has(66)).toBe(true);
  expect(h.selected).not.toHaveBeenCalled();
});

test("entering and leaving editing discards stale hover priority without changing the stored foreground", () => {
  const h = setup(fixture(false));
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("load-point:15");
  h.rerenderState(fixture(true));
  expect(screen.getByLabelText("Candidate").textContent).toBe("none");
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("cpt:66");
  h.rerenderState(fixture(false));
  expect(screen.getByLabelText("Candidate").textContent).toBe("none");
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("load-point:15");
  expect(h.changed).not.toHaveBeenCalled();
});

test("Space still cycles to a load point and clicking honors the explicitly cycled candidate", () => {
  const h = setup(fixture(true));
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("cpt:66");
  fireEvent.keyDown(window, { code: "Space", key: " " });
  expect(screen.getByLabelText("Candidate").textContent).toBe("load-point:15");
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("load-point:15");
  fireEvent.click(screen.getByRole("button", { name: "CPT" }), { clientX: 500, clientY: 500 });
  expect(h.selected).toHaveBeenCalledOnce();
  expect(h.selected.mock.calls[0]![0].selectedLoadPointIds).toEqual([15]);
  expect(h.changed).not.toHaveBeenCalled();
});

test("the user's CPT foreground preference still applies outside editing", () => {
  setup(fixture(false, "cpts"));
  hover();
  expect(screen.getByLabelText("Candidate").textContent).toBe("cpt:66");
});
