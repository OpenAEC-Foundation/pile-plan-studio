import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type WheelEvent,
} from "react";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { ViewerFocusRequest } from "../../../domain/workspace/viewerFocus.ts";
import { elementLayoutScale } from "../../../domain/settings/uiBaseline.ts";
import { getCoordinateGridPattern } from "../../../viewer/coordinateGrid.ts";
import { getCoordinateGridCanvasFrame } from "../../../viewer/coordinateGridCanvas.ts";
import {
  createProjectViewTransform,
  projectPointPixels,
  VIEWER_LAYOUT_CHANGE_EVENT,
} from "../../../viewer/viewerGeometry.ts";
import {
  clampScale,
  fitViewportToPoints,
  centerViewportAtPoint,
  getViewportTransform,
  zoomViewportAtPoint,
} from "../../../viewer/viewport.ts";
import {
  getLocalCanvasRect,
  getLocalPointer,
  type LocalCanvasRect,
} from "./viewerDomCoordinates.ts";
import { getViewerContentScreenRect } from "./viewerCanvasScreenRect.ts";
import {
  getViewerWindowMetrics,
  hasViewerWindowMetricsChanged,
  nextViewerLayoutSnapshot,
  type ViewerLayoutSnapshot,
  type ViewerWindowMetrics,
} from "./viewerResizePolicy.ts";

export type ViewerViewportState = Pick<ProjectState, "bounds" | "viewport" | "activePilePlanId" | "selectedLoadPointIds"> & {
  loadPoints: ReadonlyArray<{id: number; x_mm: number; y_mm: number}>;
};
type UseViewerViewportOptions<State extends ViewerViewportState> = {
  state: State;
  onStateChange: (nextState: State) => void;
  interactionRef: RefObject<unknown | null>;
  focusRequest?: ViewerFocusRequest | null;
  onFocusHandled?: (request: ViewerFocusRequest) => void;
};

export function useViewerViewport<State extends ViewerViewportState>({
  state,
  onStateChange,
  interactionRef,
  focusRequest,
  onFocusHandled,
}: UseViewerViewportOptions<State>) {
  const [projectTransform, setProjectTransform] = useState(
    () => createProjectViewTransform(state.bounds, { width: 1, height: 1 }),
  );
  const projectTransformRef = useRef(projectTransform);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layoutAnchorRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef(state.viewport);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRectRef = useRef<LocalCanvasRect | null>(null);
  const layoutSnapshotRef = useRef<ViewerLayoutSnapshot | null>(null);
  const layoutCompensationRef = useRef({ x: 0, y: 0 });
  const globalResizeFrameRef = useRef<number | null>(null);
  const pendingGlobalResizeRef = useRef(false);
  const gridDrawFrameRef = useRef<number | null>(null);
  const handledFocusRef = useRef<ViewerFocusRequest | null>(null);

  useEffect(() => {
    if (!interactionRef.current && !zoomCommitTimerRef.current) {
      viewportRef.current = state.viewport;
      applyViewportDisplay(state.viewport);
    }
  }, [state.viewport]);

  function applyMeasuredCanvasRect(kind: "global" | "local", metrics: ViewerWindowMetrics) {
    const canvas = canvasRef.current;
    const previous = layoutSnapshotRef.current;
    if (!canvas || !previous) return;

    const measured=getLocalCanvasRect(canvas);
    const fixedSize=projectTransformRef.current.canvasSize;
    // A hidden/collapsed canvas is not a usable initial projection. Recover once
    // it becomes visible; ordinary panel/window resizing keeps the fixed scale.
    if ((fixedSize.width<16||fixedSize.height<16)&&measured.width>=16&&measured.height>=16){
      const initial=createProjectViewTransform(state.bounds,{width:measured.width,height:measured.height});
      projectTransformRef.current=initial;
      layoutSnapshotRef.current={rect:measured,metrics,compensation:{x:0,y:0},anchor:{left:measured.left,top:measured.top}};
      canvasRectRef.current=measured;layoutCompensationRef.current={x:0,y:0};
      applyLayoutCompensation({x:0,y:0});setProjectTransform(initial);scheduleCoordinateGridDraw();
      return;
    }

    const next = nextViewerLayoutSnapshot(previous, measured, metrics, kind);
    layoutSnapshotRef.current = next;
    canvasRectRef.current = next.rect;
    layoutCompensationRef.current = next.compensation;
    applyLayoutCompensation(next.compensation);
    if (kind === "global") {
      // The global measurement already runs inside an animation frame: draw
      // with its final compensation before that frame is painted.
      if (gridDrawFrameRef.current !== null) {
        cancelAnimationFrame(gridDrawFrameRef.current);
        gridDrawFrameRef.current = null;
      }
      drawCoordinateGrid(projectTransformRef.current, viewportRef.current);
    } else {
      scheduleCoordinateGridDraw();
    }
  }

  function updateCanvasRect() {
    if (!canvasRef.current || !layoutSnapshotRef.current) return;
    const metrics = getViewerWindowMetrics();
    if (hasViewerWindowMetricsChanged(layoutSnapshotRef.current.metrics, metrics)) {
      pendingGlobalResizeRef.current = true;
    }
    if (pendingGlobalResizeRef.current) {
      if (globalResizeFrameRef.current === null) {
        globalResizeFrameRef.current = requestAnimationFrame(() => {
          globalResizeFrameRef.current = null;
          pendingGlobalResizeRef.current = false;
          applyMeasuredCanvasRect("global", getViewerWindowMetrics());
        });
      }
      return;
    }
    applyMeasuredCanvasRect("local", metrics);
  }

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const initialRect = getLocalCanvasRect(canvas);
    const initialTransform = createProjectViewTransform(state.bounds, {
      width: initialRect.width,
      height: initialRect.height,
    });
    canvasRectRef.current = initialRect;
    layoutSnapshotRef.current = {
      rect: initialRect,
      metrics: getViewerWindowMetrics(),
      compensation: { x: 0, y: 0 },
      anchor: { left: initialRect.left, top: initialRect.top },
    };
    layoutCompensationRef.current = { x: 0, y: 0 };
    projectTransformRef.current = initialTransform;
    applyLayoutCompensation({ x: 0, y: 0 });
    scheduleCoordinateGridDraw();
    setProjectTransform(initialTransform);

    const resizeObserver = new ResizeObserver(updateCanvasRect);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", updateCanvasRect);
    window.addEventListener(VIEWER_LAYOUT_CHANGE_EVENT, updateCanvasRect);
    let resolutionQuery: MediaQueryList | null = null;
    function handleResolutionChange() {
      bindResolutionQuery();
      updateCanvasRect();
    }
    function bindResolutionQuery() {
      resolutionQuery?.removeEventListener("change", handleResolutionChange);
      resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolutionQuery.addEventListener("change", handleResolutionChange);
    }
    bindResolutionQuery();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasRect);
      window.removeEventListener(VIEWER_LAYOUT_CHANGE_EVENT, updateCanvasRect);
      resolutionQuery?.removeEventListener("change", handleResolutionChange);
      if (globalResizeFrameRef.current !== null) {
        cancelAnimationFrame(globalResizeFrameRef.current);
        globalResizeFrameRef.current = null;
      }
      if (gridDrawFrameRef.current !== null) {
        cancelAnimationFrame(gridDrawFrameRef.current);
        gridDrawFrameRef.current = null;
      }
      pendingGlobalResizeRef.current = false;
    };
  }, [state.bounds.minX, state.bounds.maxX, state.bounds.minY, state.bounds.maxY]);

  useLayoutEffect(updateCanvasRect);

  useEffect(() => {
    if (!focusRequest || handledFocusRef.current === focusRequest) return;
    const finish = () => {
      handledFocusRef.current = focusRequest;
      onFocusHandled?.(focusRequest);
    };
    if (focusRequest.loadPoints !== state.loadPoints || focusRequest.planId !== state.activePilePlanId) {
      finish();
      return;
    }
    // Selection can still be waiting for an existing CPT edit to be saved.
    if (state.selectedLoadPointIds.length !== focusRequest.loadPointIds.length
      || !focusRequest.loadPointIds.every(id => state.selectedLoadPointIds.includes(id))) return;
    const ids = new Set(focusRequest.loadPointIds);
    const points = state.loadPoints.filter(point => ids.has(point.id));
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) { finish(); return; }
    const center = points.reduce((sum, point) => ({
      x_mm: sum.x_mm + point.x_mm / points.length,
      y_mm: sum.y_mm + point.y_mm / points.length,
    }), { x_mm: 0, y_mm: 0 });
    const rect = getLocalCanvasRect(canvas);
    const style = getComputedStyle(canvas);
    const border = (value: string) => parseFloat(value) || 0;
    const nextViewport = centerViewportAtPoint(
      viewportRef.current, projectPointPixels(center, projectTransformRef.current),
      { width: rect.width - border(style.borderLeftWidth) - border(style.borderRightWidth),
        height: rect.height - border(style.borderTopWidth) - border(style.borderBottomWidth) },
      layoutCompensationRef.current,
    );
    if (zoomCommitTimerRef.current) {
      clearTimeout(zoomCommitTimerRef.current);
      zoomCommitTimerRef.current = null;
    }
    viewportRef.current = nextViewport;
    applyViewportDisplay(nextViewport);
    finish();
    onStateChange({ ...state, viewport: nextViewport });
  }, [focusRequest, state.loadPoints, state.activePilePlanId, state.selectedLoadPointIds]);

  useEffect(() => () => {
    if (zoomCommitTimerRef.current) {
      clearTimeout(zoomCommitTimerRef.current);
    }
  }, []);

  function applyViewportDisplay(nextViewport: ProjectState["viewport"]) {
    if (stageRef.current) {
      stageRef.current.style.transform = getViewportTransform(nextViewport);
    }
    scheduleCoordinateGridDraw();
  }

  function applyLayoutCompensation(compensation: { x: number; y: number }) {
    const anchor = layoutAnchorRef.current;
    if (!anchor) return;
    anchor.style.left = `${compensation.x}px`;
    anchor.style.top = `${compensation.y}px`;
  }

  function scheduleCoordinateGridDraw() {
    if (!gridRef.current) return;
    if (gridDrawFrameRef.current !== null) return;
    gridDrawFrameRef.current = requestAnimationFrame(() => {
      gridDrawFrameRef.current = null;
      drawCoordinateGrid(projectTransformRef.current, viewportRef.current);
    });
  }

  function drawCoordinateGrid(
    transform: typeof projectTransform,
    viewport: ProjectState["viewport"],
  ) {
    const grid = gridRef.current;
    const canvas = canvasRef.current;
    if (!grid || !canvas) return;
    const currentRect = canvasRectRef.current;
    const rootScale = elementLayoutScale(document.documentElement);
    const canvasScreenRect = canvas.getBoundingClientRect();
    const canvasStyle = getComputedStyle(canvas);
    const pattern = getCoordinateGridPattern(transform, viewport, {
      canvasSize: currentRect
        ? { width: currentRect.width, height: currentRect.height }
        : transform.canvasSize,
      compensation: layoutCompensationRef.current,
    });
    const frame = getCoordinateGridCanvasFrame(pattern, {
      // Absolute children start inside the border; clientWidth/clientLeft round
      // away subpixels under the compact application scale.
      screen: getViewerContentScreenRect(canvasScreenRect, {
        left: parseFloat(canvasStyle.borderLeftWidth),
        top: parseFloat(canvasStyle.borderTopWidth),
        right: parseFloat(canvasStyle.borderRightWidth),
        bottom: parseFloat(canvasStyle.borderBottomWidth),
      }, rootScale),
      rootScale,
      devicePixelRatio: window.devicePixelRatio,
    });
    if (grid.width !== frame.bitmapWidth) grid.width = frame.bitmapWidth;
    if (grid.height !== frame.bitmapHeight) grid.height = frame.bitmapHeight;
    grid.style.left = `${frame.cssLeft}px`;
    grid.style.top = `${frame.cssTop}px`;
    grid.style.width = `${frame.cssWidth}px`;
    grid.style.height = `${frame.cssHeight}px`;
    const context = grid.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, frame.bitmapWidth, frame.bitmapHeight);
    context.fillStyle = "rgba(163, 174, 181, 0.28)";
    for (const x of frame.verticalX) {
      context.fillRect(x, 0, frame.strokePx, frame.bitmapHeight);
    }
    for (const y of frame.horizontalY) {
      context.fillRect(0, y, frame.bitmapWidth, frame.strokePx);
    }
  }

  function scheduleViewportCommit(nextViewport: ProjectState["viewport"]) {
    if (zoomCommitTimerRef.current) {
      clearTimeout(zoomCommitTimerRef.current);
    }

    zoomCommitTimerRef.current = setTimeout(() => {
      zoomCommitTimerRef.current = null;
      onStateChange({ ...state, viewport: nextViewport });
    }, 120);
  }

  function getProjectViewportPointer(clientX: number, clientY: number, rect: LocalCanvasRect) {
    const pointer = getLocalPointer(clientX, clientY, rect);
    return {
      x: pointer.x - layoutCompensationRef.current.x,
      y: pointer.y - layoutCompensationRef.current.y,
    };
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>, clearHoverCandidates: () => void) {
    event.preventDefault();
    clearHoverCandidates();
    const rect = getLocalCanvasRect(event.currentTarget);
    const pointer = getProjectViewportPointer(event.clientX, event.clientY, rect);
    const scaleStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const currentViewport = viewportRef.current;
    const nextScale = clampScale(currentViewport.scale * scaleStep);
    const nextViewport = zoomViewportAtPoint(currentViewport, {
      cursorX: pointer.x,
      cursorY: pointer.y,
      nextScale,
    });
    viewportRef.current = nextViewport;
    applyViewportDisplay(nextViewport);
    scheduleViewportCommit(nextViewport);
  }

  function getVisibleLoadPointScreenPoints(displayPoints?: {id:number;x:number;y:number}[]) {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    const rect = getLocalCanvasRect(canvas);
    const viewport = viewportRef.current;
    const points=displayPoints??state.loadPoints.map(loadPoint=>({id:loadPoint.id,...projectPointPixels(loadPoint,projectTransformRef.current)}));
    return points.map((point) => {
      const screenPoint = {
        x: point.x * viewport.scale + viewport.offsetX,
        y: point.y * viewport.scale + viewport.offsetY,
      };
      return {
        id: point.id,
        x: rect.left + layoutCompensationRef.current.x + screenPoint.x,
        y: rect.top + layoutCompensationRef.current.y + screenPoint.y,
      };
    });
  }

  function focusOnPoints(points:readonly {x:number;y:number}[]){
    const canvas=canvasRef.current;if(!canvas||!points.length)return;
    const rect=getLocalCanvasRect(canvas),style=getComputedStyle(canvas),border=(value:string)=>parseFloat(value)||0;
    const next=fitViewportToPoints(viewportRef.current,points,{width:rect.width-border(style.borderLeftWidth)-border(style.borderRightWidth),height:rect.height-border(style.borderTopWidth)-border(style.borderBottomWidth)},layoutCompensationRef.current);
    if(zoomCommitTimerRef.current){clearTimeout(zoomCommitTimerRef.current);zoomCommitTimerRef.current=null;}
    viewportRef.current=next;applyViewportDisplay(next);onStateChange({...state,viewport:next});
  }

  return {
    canvasRef,
    focusOnPoints,
    layoutAnchorRef,
    stageRef,
    gridRef,
    projectTransform,
    projectTransformRef,
    viewportRef,
    zoomCommitTimerRef,
    canvasRectRef,
    applyViewportDisplay,
    getProjectViewportPointer,
    getVisibleLoadPointScreenPoints,
    handleWheel,
  };
}
