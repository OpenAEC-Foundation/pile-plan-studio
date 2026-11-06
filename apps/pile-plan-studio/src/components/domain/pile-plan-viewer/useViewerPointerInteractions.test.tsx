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

function Harness({ state, changed, selected, lassoActive = false }: {
  state: ProjectState; changed: (state: ProjectState) => void; selected: (state: ProjectState) => void;
  lassoActive?: boolean;
}) {
  const pointer = useViewerPointerInteractions({
    state, onStateChange: changed, onSelectionChange: selected, loadPointGroups: [],
    lassoSelectionActive: lassoActive, isEditingLoadPointLocks: state.loadPointLockDraft !== null,
    isEditingCptSelection: state.cptSelectionEditDraft !== null, lockedLoadPointIds: new Set(),
    projectTransform: transform, projectTransformRef: useRef(transform),
    interactionRef: useRef<ViewerInteraction | null>(null),
    canvasRectRef: useRef<LocalCanvasRect>({ left: 0, top: 0, width: 1000, height: 1000, scale: 1 }),
    viewportRef: useRef(state.viewport), zoomCommitTimerRef: useRef(null),
    applyViewportDisplay: () => {}, getProjectViewportPointer: (x, y) => ({ x, y }),
    getVisibleLoadPointScreenPoints: () => [{ id: 15, x: 500, y: 500 }],
  });
  return <div aria-label="Canvas" onMouseDown={pointer.handleMouseDown}
    onMouseMove={pointer.handleMouseMove} onMouseUp={pointer.handleMouseUp}>
    <button data-map-marker-key="load-point:15" onClick={event => pointer.handleLoadPointClick(event, 15)}>Load point</button>
    <button data-map-marker-key="cpt:66" onClick={event => pointer.handleCptClick(event, 66)}>CPT</button>
    <output aria-label="Candidate">{pointer.activeHoverCandidateKey ?? "none"}</output>
    <output aria-label="Lasso">{pointer.lasso ? JSON.stringify(pointer.lasso) : "none"}</output>
  </div>;
}

function setup(state: ProjectState, lassoActive = false) {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  const changed = vi.fn(), selected = vi.fn();
  const view = render(<Harness state={state} changed={changed} selected={selected} lassoActive={lassoActive} />);
  return { ...view, changed, selected, rerenderState: (next: ProjectState, active = lassoActive) => view.rerender(<Harness state={next} changed={changed} selected={selected} lassoActive={active} />) };
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

function startLasso() {
  fireEvent.mouseDown(screen.getByLabelText("Canvas"), { button: 0, buttons: 1, shiftKey: true, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(screen.getByLabelText("Canvas"), { buttons: 1, clientX: 400, clientY: 400 });
  expect(screen.getByLabelText("Lasso").textContent).not.toBe("none");
}

test("releasing outside the viewer finishes the lasso once using the release coordinates", () => {
  const h = setup(fixture(false));
  startLasso();
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
  expect(h.selected).toHaveBeenCalledOnce();
  expect(h.selected.mock.calls[0]![0].selectedLoadPointIds).toEqual([15]);
  fireEvent.mouseUp(screen.getByLabelText("Canvas"), { button: 0, clientX: 100, clientY: 100 });
  expect(h.selected).toHaveBeenCalledOnce();
  startLasso();
  fireEvent.mouseUp(document.body, { button: 0, clientX: 200, clientY: 200 });
  expect(h.selected.mock.calls[1]![0].selectedLoadPointIds).toEqual([]);
});

test("the lasso continues following the pointer outside the viewer", () => {
  setup(fixture(false));
  startLasso();
  fireEvent.mouseMove(document.body, { buttons: 1, clientX: 1200, clientY: 700 });
  expect(JSON.parse(screen.getByLabelText("Lasso").textContent!)).toEqual({
    startX: 100, startY: 100, endX: 1200, endY: 700,
  });
});

test("lock lasso released outside updates the lock draft without changing selection", () => {
  const h = setup({ ...fixture(false), loadPointLockDraft: new Set<number>() });
  startLasso();
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
  expect(h.changed).toHaveBeenCalledOnce();
  expect([...h.changed.mock.calls[0]![0].loadPointLockDraft!]).toEqual([15]);
  expect(h.selected).not.toHaveBeenCalled();
});

test("leaving lock editing discards its lasso before a late release", () => {
  const state = { ...fixture(false), loadPointLockDraft: new Set<number>() };
  const h = setup(state);
  startLasso();
  h.rerenderState({ ...state, loadPointLockDraft: null });
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(h.changed).not.toHaveBeenCalled();
  expect(h.selected).not.toHaveBeenCalled();
});

test("leaving rectangle-selection mode discards the in-progress lasso", () => {
  const state = fixture(false);
  const h = setup(state, true);
  startLasso();
  h.rerenderState(state, false);
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(h.selected).not.toHaveBeenCalled();
});

test.each(["escape", "blur", "released-button"])("%s cancels a lasso without replacing the selection", reason => {
  const h = setup(fixture(false));
  startLasso();
  if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
  else if (reason === "blur") fireEvent.blur(window);
  else fireEvent.mouseMove(screen.getByLabelText("Canvas"), { buttons: 0, clientX: 600, clientY: 600 });
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(h.selected).not.toHaveBeenCalled();
  expect(h.changed).not.toHaveBeenCalled();
});

test("releasing inside the viewer still selects only once", () => {
  const h = setup(fixture(false));
  startLasso();
  fireEvent.mouseUp(screen.getByLabelText("Canvas"), { button: 0, clientX: 600, clientY: 600 });
  expect(h.selected).toHaveBeenCalledOnce();
  expect(h.selected.mock.calls[0]![0].selectedLoadPointIds).toEqual([15]);
  expect(screen.getByLabelText("Lasso").textContent).toBe("none");
});

test("panning across the viewer boundary commits the final viewport once", () => {
  const h = setup({ ...fixture(false), viewport: { scale: 1, offsetX: 0, offsetY: 0 } });
  fireEvent.mouseDown(screen.getByLabelText("Canvas"), { button: 0, buttons: 1, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(screen.getByLabelText("Canvas"), { buttons: 1, clientX: 150, clientY: 150 });
  fireEvent.mouseMove(document.body, { buttons: 1, clientX: 200, clientY: 250 });
  fireEvent.mouseUp(document.body, { button: 0, clientX: 200, clientY: 250 });
  expect(h.changed).toHaveBeenCalledOnce();
  expect(h.changed.mock.calls[0]![0].viewport).toEqual({ scale: 1, offsetX: 100, offsetY: 150 });
  expect(h.selected).not.toHaveBeenCalled();
});

test("unmounting a viewer discards the gesture and its window listeners", () => {
  const h = setup(fixture(false));
  startLasso();
  h.unmount();
  fireEvent.mouseMove(document.body, { buttons: 1, clientX: 600, clientY: 600 });
  fireEvent.mouseUp(document.body, { button: 0, clientX: 600, clientY: 600 });
  expect(h.changed).not.toHaveBeenCalled();
  expect(h.selected).not.toHaveBeenCalled();
});
