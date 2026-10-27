import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { projectFixture } from "../../../test/projectFixture.ts";
import { captureProjectContent } from "../../../domain/project/projectContent.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { ViewerFocusRequest } from "../../../domain/workspace/viewerFocus.ts";
import { createProjectViewTransform, projectPointPixels } from "../../../viewer/viewerGeometry.ts";
import { useViewerViewport } from "./useViewerViewport.ts";

let rect: { left: number; top: number; width: number; height: number };
beforeEach(() => {
  rect = { left: 20, top: 40, width: 800, height: 600 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ ...rect, x: rect.left, y: rect.top,
    right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => ({}) }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

function fixture() {
  const base = projectFixture();
  return { ...base, loadPoints: [1, 2].map(id => ({ ...base.loadPoints[0], id, x_mm: (id - 1) * 1000, y_mm: 250 })),
    bounds: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 }, selectedLoadPointIds: [1, 2],
    viewport: { scale: 2.25, offsetX: -120, offsetY: 20 } };
}

function Harness({ state, request, changed, handled }: {
  state: ProjectState; request: ViewerFocusRequest | null;
  changed: (state: ProjectState) => void; handled: (request: ViewerFocusRequest) => void;
}) {
  const view = useViewerViewport({ state, focusRequest: request, onFocusHandled: handled,
    onStateChange: changed, interactionRef: useRef(null) });
  return <div ref={view.canvasRef} data-testid="canvas" onWheel={e => view.handleWheel(e, () => {})}>
    <div ref={view.layoutAnchorRef}><div ref={view.stageRef} /></div>
  </div>;
}

test("focus is handled once, uses the current compensated canvas and preserves project content", () => {
  const state = fixture(), changed = vi.fn(), handled = vi.fn();
  const request = { loadPointIds: [1, 2], loadPoints: state.loadPoints, planId: state.activePilePlanId };
  const view = render(<Harness state={state} request={null} changed={changed} handled={handled} />);
  // A panel resize moves the canvas while the fixed project projection remains unchanged.
  rect = { left: 75, top: 60, width: 700, height: 550 };
  view.rerender(<Harness state={state} request={request} changed={changed} handled={handled} />);
  const next = changed.mock.calls[0][0] as ProjectState;
  const point = projectPointPixels({ x_mm: 500, y_mm: 250 }, createProjectViewTransform(state.bounds, { width: 800, height: 600 }));
  expect(point.x * next.viewport.scale + next.viewport.offsetX - 55).toBeCloseTo(350);
  expect(point.y * next.viewport.scale + next.viewport.offsetY - 20).toBeCloseTo(275);
  expect(next.viewport.scale).toBe(2.25);
  expect(captureProjectContent(next)).toEqual(captureProjectContent(state));
  expect(handled).toHaveBeenCalledWith(request);
  view.rerender(<Harness state={{ ...next, selectedLoadPointIds: [2, 1] }} request={request} changed={changed} handled={handled} />);
  expect(changed).toHaveBeenCalledOnce();
  view.rerender(<Harness state={next} request={{ ...request }} changed={changed} handled={handled} />);
  expect(changed).toHaveBeenCalledTimes(2);
});

test("focus waits for selection and drops a request scoped to a replaced project or another plan", () => {
  const state = fixture(), changed = vi.fn(), handled = vi.fn();
  const request = { loadPointIds: [1, 2], loadPoints: state.loadPoints, planId: state.activePilePlanId };
  const view = render(<Harness state={{ ...state, selectedLoadPointIds: [] }} request={request} changed={changed} handled={handled} />);
  expect(changed).not.toHaveBeenCalled();
  expect(handled).not.toHaveBeenCalled();
  view.rerender(<Harness state={state} request={request} changed={changed} handled={handled} />);
  expect(changed).toHaveBeenCalledOnce();
  view.rerender(<Harness state={state} request={{ ...request, loadPoints: [...state.loadPoints] }} changed={changed} handled={handled} />);
  view.rerender(<Harness state={state} request={{ ...request, planId: "other" }} changed={changed} handled={handled} />);
  expect(changed).toHaveBeenCalledOnce();
  expect(handled).toHaveBeenCalledTimes(3);
});

test("centering retains the latest wheel zoom and cancels its delayed stale pan commit", () => {
  vi.useFakeTimers();
  const state = fixture(), changed = vi.fn(), handled = vi.fn();
  const view = render(<Harness state={state} request={null} changed={changed} handled={handled} />);
  fireEvent.wheel(screen.getByTestId("canvas"), { deltaY: -1, clientX: 200, clientY: 200 });
  const request = { loadPointIds: [1, 2], loadPoints: state.loadPoints, planId: state.activePilePlanId };
  view.rerender(<Harness state={state} request={request} changed={changed} handled={handled} />);
  expect(changed.mock.calls[0][0].viewport.scale).toBeCloseTo(2.52);
  act(() => { vi.advanceTimersByTime(200); });
  expect(changed).toHaveBeenCalledOnce();
});
