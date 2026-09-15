import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type WheelEvent,
} from "react";
import type { ProjectState } from "../../../domain/projectState.ts";
import { elementLayoutScale } from "../../../domain/uiBaseline.ts";
import {
  alignCoordinateGridPatternToDevicePixels,
  getCoordinateGridPattern,
} from "../../../viewer/coordinateGrid.ts";
import {
  createProjectViewTransform,
  getCanvasLayoutCompensation,
  projectPointPixels,
  VIEWER_LAYOUT_CHANGE_EVENT,
} from "../../../viewer/viewerGeometry.ts";
import {
  clampScale,
  getViewportTransform,
  zoomViewportAtPoint,
} from "../../../viewer/viewport.ts";
import {
  getLocalCanvasRect,
  getLocalPointer,
  type LocalCanvasRect,
} from "./viewerDomCoordinates.ts";

type UseViewerViewportOptions = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
  interactionRef: RefObject<unknown | null>;
};

export function useViewerViewport({
  state,
  onStateChange,
  interactionRef,
}: UseViewerViewportOptions) {
  const [projectTransform, setProjectTransform] = useState(
    () => createProjectViewTransform(state.bounds, { width: 1, height: 1 }),
  );
  const projectTransformRef = useRef(projectTransform);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layoutAnchorRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(state.viewport);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRectRef = useRef<LocalCanvasRect | null>(null);
  const canvasAnchorRef = useRef<LocalCanvasRect | null>(null);
  const layoutCompensationRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!interactionRef.current && !zoomCommitTimerRef.current) {
      viewportRef.current = state.viewport;
      applyViewportDisplay(state.viewport);
    }
  }, [state.viewport]);

  function updateCanvasRect() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = getLocalCanvasRect(canvas);
    const anchor = canvasAnchorRef.current ?? rect;
    const compensation = getCanvasLayoutCompensation(anchor, rect);
    canvasRectRef.current = rect;
    layoutCompensationRef.current = compensation;
    applyLayoutCompensation(compensation);
    applyCoordinateGridDisplay(projectTransformRef.current, viewportRef.current);
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
    canvasAnchorRef.current = initialRect;
    layoutCompensationRef.current = { x: 0, y: 0 };
    projectTransformRef.current = initialTransform;
    applyLayoutCompensation({ x: 0, y: 0 });
    applyCoordinateGridDisplay(initialTransform, viewportRef.current);
    setProjectTransform(initialTransform);

    const resizeObserver = new ResizeObserver(updateCanvasRect);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", updateCanvasRect);
    window.addEventListener(VIEWER_LAYOUT_CHANGE_EVENT, updateCanvasRect);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasRect);
      window.removeEventListener(VIEWER_LAYOUT_CHANGE_EVENT, updateCanvasRect);
    };
  }, [state.bounds.minX, state.bounds.maxX, state.bounds.minY, state.bounds.maxY]);

  useLayoutEffect(updateCanvasRect);

  useEffect(() => () => {
    if (zoomCommitTimerRef.current) {
      clearTimeout(zoomCommitTimerRef.current);
    }
  }, []);

  function applyViewportDisplay(nextViewport: ProjectState["viewport"]) {
    if (stageRef.current) {
      stageRef.current.style.transform = getViewportTransform(nextViewport);
    }
    applyCoordinateGridDisplay(projectTransformRef.current, nextViewport);
  }

  function applyLayoutCompensation(compensation: { x: number; y: number }) {
    const anchor = layoutAnchorRef.current;
    if (!anchor) return;
    anchor.style.left = `${compensation.x}px`;
    anchor.style.top = `${compensation.y}px`;
  }

  function applyCoordinateGridDisplay(
    transform: typeof projectTransform,
    viewport: ProjectState["viewport"],
  ) {
    const grid = gridRef.current;
    const canvas = canvasRef.current;
    if (!grid || !canvas) return;
    const currentRect = canvasRectRef.current;
    const rootScale = elementLayoutScale(document.documentElement);
    const canvasScreenRect = canvas.getBoundingClientRect();
    const gridScreenRect = grid.getBoundingClientRect();
    const pattern = alignCoordinateGridPatternToDevicePixels(
      getCoordinateGridPattern(transform, viewport, {
        canvasSize: currentRect
          ? { width: currentRect.width, height: currentRect.height }
          : transform.canvasSize,
        compensation: layoutCompensationRef.current,
      }),
      {
        canvasScreen: { x: canvasScreenRect.left, y: canvasScreenRect.top },
        gridScreen: { x: gridScreenRect.left, y: gridScreenRect.top },
        rootScale,
        devicePixelRatio: window.devicePixelRatio,
      },
    );
    const style = getCoordinateGridStyle(pattern);
    grid.style.backgroundSize = style.backgroundSize;
    grid.style.backgroundPosition = style.backgroundPosition;
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

  function getVisibleLoadPointScreenPoints() {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    const rect = getLocalCanvasRect(canvas);
    const viewport = viewportRef.current;
    return state.loadPoints.map((loadPoint) => {
      const point = projectPointPixels(loadPoint, projectTransformRef.current);
      const screenPoint = {
        x: point.x * viewport.scale + viewport.offsetX,
        y: point.y * viewport.scale + viewport.offsetY,
      };
      return {
        id: loadPoint.id,
        x: rect.left + layoutCompensationRef.current.x + screenPoint.x,
        y: rect.top + layoutCompensationRef.current.y + screenPoint.y,
      };
    });
  }

  return {
    canvasRef,
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

function getCoordinateGridStyle(pattern: ReturnType<typeof getCoordinateGridPattern>): {
  backgroundPosition: string;
  backgroundSize: string;
} {
  return {
    backgroundSize: `${pattern.spacingPixels}px ${pattern.spacingPixels}px`,
    backgroundPosition: `${pattern.originX}px ${pattern.originY}px`,
  };
}
