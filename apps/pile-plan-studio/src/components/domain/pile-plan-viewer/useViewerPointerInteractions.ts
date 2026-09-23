import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import { setLassoLoadPointLocks, toggleLoadPointLock } from "../../../domain/pile-plans/loadPointLocking.ts";
import { elementLayoutScale } from "../../../domain/settings/uiBaseline.ts";
import {
  createHoverMarkerIndex,
  cycleHoverCandidate,
  findHoverCandidates,
  getActiveHoverCandidateKey,
  resolveHoverClickCandidateKey,
  scaleHoverVisualRadius,
  updateHoverCandidateState,
  type HoverCandidateState,
  type HoverMarker,
} from "../../../viewer/hoverCandidates.ts";
import {
  getAdditiveSelectionModifier,
  getLassoSelectionOperation,
  getPointIdsInRectangle,
  shouldClearViewerSelectionOnEscape,
  shouldStartLassoInteraction,
  type LassoRectangle,
  type LassoSelectionOperation,
} from "../../../viewer/lassoSelection.ts";
import { shouldStartMapPan } from "../../../viewer/mapInteraction.ts";
import { projectPoint, type createProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { panViewport } from "../../../viewer/viewport.ts";
import { toggleManualCpt } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import {
  addReactViewerLoadPoints,
  clearReactViewerSelection,
  isViewerSelectionActionAllowed,
  openReactViewerCpt,
  selectReactViewerLoadPoint,
  setReactViewerLoadPoints,
  toggleReactViewerLoadPoint,
} from "../../../domain/workspace/viewerInteractions.ts";
import { getLocalViewportPointer, type LocalCanvasRect } from "./viewerDomCoordinates.ts";

export type ViewerInteraction =
  | {
    type: "pan";
    start: { x: number; y: number };
    last: { x: number; y: number };
    moved: boolean;
  }
  | {
    type: "lasso";
    start: { x: number; y: number };
    current: { x: number; y: number };
    operation: LassoSelectionOperation;
  };

type UseViewerPointerInteractionsOptions = {
  state: ProjectState;
  loadPointGroups: LoadPointGroup[];
  onStateChange: (nextState: ProjectState) => void;
  lassoSelectionActive: boolean;
  isEditingLoadPointLocks: boolean;
  isEditingCptSelection: boolean;
  lockedLoadPointIds: ReadonlySet<number>;
  projectTransform: ReturnType<typeof createProjectViewTransform>;
  interactionRef: RefObject<ViewerInteraction | null>;
  canvasRectRef: RefObject<LocalCanvasRect | null>;
  projectTransformRef: RefObject<ReturnType<typeof createProjectViewTransform>>;
  viewportRef: RefObject<ProjectState["viewport"]>;
  zoomCommitTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  applyViewportDisplay: (viewport: ProjectState["viewport"]) => void;
  getProjectViewportPointer: (clientX: number, clientY: number, rect: LocalCanvasRect) => { x: number; y: number };
  getVisibleLoadPointScreenPoints: () => { id: number; x: number; y: number }[];
};

export function useViewerPointerInteractions({
  state,
  loadPointGroups,
  onStateChange,
  lassoSelectionActive,
  isEditingLoadPointLocks,
  isEditingCptSelection,
  lockedLoadPointIds,
  projectTransform,
  interactionRef,
  canvasRectRef,
  projectTransformRef,
  viewportRef,
  zoomCommitTimerRef,
  applyViewportDisplay,
  getProjectViewportPointer,
  getVisibleLoadPointScreenPoints,
}: UseViewerPointerInteractionsOptions) {
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [lasso, setLasso] = useState<LassoRectangle | null>(null);
  const [hoverCandidates, setHoverCandidates] = useState<HoverCandidateState | null>(null);
  const activeHoverCandidateKey = getActiveHoverCandidateKey(hoverCandidates);
  const hoverMarkers = useMemo<HoverMarker[]>(() => [
    ...(!isEditingLoadPointLocks ? state.cpts : []).map((cpt) => ({
      key: `cpt:${cpt.id}`,
      point: projectPoint(cpt, projectTransform),
      visualRadius: scaleHoverVisualRadius(7.5, state.symbolScalePercent),
    })),
    ...state.loadPoints.filter((loadPoint) => (
      isEditingLoadPointLocks || !lockedLoadPointIds.has(loadPoint.id)
    )).map((loadPoint) => ({
      key: `load-point:${loadPoint.id}`,
      point: projectPoint(loadPoint, projectTransform),
      visualRadius: scaleHoverVisualRadius(7, state.symbolScalePercent),
    })),
  ], [projectTransform, state.cpts, state.loadPoints, state.symbolScalePercent, isEditingLoadPointLocks, state.loadPointLockDraft, state.pilePlans, state.activePilePlanId]);
  const hoverMarkerIndex = useMemo(() => createHoverMarkerIndex(hoverMarkers), [hoverMarkers]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" && isNonTextEntryTarget(event.target)) {
        event.preventDefault();
        return;
      }
      if (event.code === "Space" && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        blurActiveNonTextControl();
        if (hoverCandidates && hoverCandidates.keys.length > 1) {
          setHoverCandidates((current) => current ? cycleHoverCandidate(current) : current);
        }
        return;
      }
      if (event.key === "Escape") {
        clearHoverCandidates();
        if (shouldClearViewerSelectionOnEscape({
          lassoSelectionActive,
          isEditingLoadPointLocks,
          selectionAllowed: isViewerSelectionActionAllowed(isEditingCptSelection, "background"),
        })) {
          onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hoverCandidates, onStateChange, state]);

  useEffect(() => () => {
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const targetIsInteractive = Boolean(target.closest("button"));
    const layoutScale = canvasRectRef.current?.scale ?? elementLayoutScale(document.documentElement);
    const start = getLocalViewportPointer(event.clientX, event.clientY, layoutScale);
    if (shouldStartLassoInteraction({
      lassoSelectionActive,
      shiftKey: event.shiftKey,
      targetIsInteractive,
      selectionAllowed: isViewerSelectionActionAllowed(isEditingCptSelection, "lasso"),
      isEditingLoadPointLocks,
    })) {
      event.preventDefault();
      clearHoverCandidates();
      interactionRef.current = {
        type: "lasso",
        start,
        current: start,
        operation: getLassoSelectionOperation({
          additiveKey: getAdditiveSelectionModifier(event),
          isEditingLoadPointLocks,
        }),
      };
      setLasso({ startX: start.x, startY: start.y, endX: start.x, endY: start.y });
      return;
    }
    if (!shouldStartMapPan({ button: event.button, targetIsInteractive })) return;
    event.preventDefault();
    clearHoverCandidates();
    interactionRef.current = { type: "pan", start, last: start, moved: false };
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction) {
      const markerTarget = (event.target as HTMLElement).closest("[data-map-marker-key]");
      if (!markerTarget) {
        clearHoverCandidates();
        return;
      }
      if (!zoomCommitTimerRef.current) scheduleHoverCandidateUpdate(event);
      return;
    }
    const layoutScale = canvasRectRef.current?.scale ?? elementLayoutScale(document.documentElement);
    const pointer = getLocalViewportPointer(event.clientX, event.clientY, layoutScale);
    if (interaction.type === "lasso") {
      interaction.current = pointer;
      setLasso({
        startX: interaction.start.x,
        startY: interaction.start.y,
        endX: interaction.current.x,
        endY: interaction.current.y,
      });
      return;
    }
    const deltaX = pointer.x - interaction.last.x;
    const deltaY = pointer.y - interaction.last.y;
    const totalMove = Math.hypot(pointer.x - interaction.start.x, pointer.y - interaction.start.y);
    interaction.last = pointer;
    interaction.moved = interaction.moved || totalMove > 3;
    const nextViewport = panViewport(viewportRef.current, { deltaX, deltaY });
    viewportRef.current = nextViewport;
    applyViewportDisplay(nextViewport);
  }

  function handleMouseUp(event: MouseEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction) return;
    if (interaction.type === "lasso") {
      const layoutScale = canvasRectRef.current?.scale ?? elementLayoutScale(document.documentElement);
      const pointer = getLocalViewportPointer(event.clientX, event.clientY, layoutScale);
      const rectangle = {
        startX: interaction.start.x,
        startY: interaction.start.y,
        endX: pointer.x,
        endY: pointer.y,
      };
      setLasso(null);
      const loadPointIds = getPointIdsInRectangle(getVisibleLoadPointScreenPoints(), rectangle);
      if (interaction.operation === "lock") {
        if (loadPointIds.length > 0) {
          onStateChange({
            ...state,
            loadPointLockDraft: setLassoLoadPointLocks(state.loadPointLockDraft!, loadPointIds),
            viewport: viewportRef.current,
          });
        }
        return;
      }
      const unlockedIds = loadPointIds.filter((id) => !lockedLoadPointIds.has(id));
      if (interaction.operation === "replace") {
        onStateChange({ ...state, ...setReactViewerLoadPoints(state, unlockedIds, loadPointGroups), viewport: viewportRef.current });
      } else if (unlockedIds.length > 0) {
        onStateChange({ ...state, ...addReactViewerLoadPoints(state, unlockedIds, loadPointGroups), viewport: viewportRef.current });
      }
      return;
    }
    if (!interaction.moved && !isEditingLoadPointLocks && isViewerSelectionActionAllowed(isEditingCptSelection, "background")) {
      onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
      return;
    }
    onStateChange({ ...state, viewport: viewportRef.current });
  }

  function scheduleHoverCandidateUpdate(event: MouseEvent<HTMLDivElement>) {
    const rect = canvasRectRef.current;
    if (!rect) return;
    hoverPointerRef.current = getProjectViewportPointer(event.clientX, event.clientY, rect);
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const pointer = hoverPointerRef.current;
      if (!pointer || !canvasRectRef.current || interactionRef.current || zoomCommitTimerRef.current) return;
      const candidates = findHoverCandidates(hoverMarkerIndex, {
        pointer,
        canvas: projectTransformRef.current.canvasSize,
        viewport: viewportRef.current,
        preferredMarkerType: state.foregroundLayer === "cpts" ? "cpt" : "load-point",
      });
      const candidateKeys = candidates.map((candidate) => candidate.key).filter((key) => (
        isEditingLoadPointLocks
          ? key.startsWith("load-point:")
          : !isEditingCptSelection || key.startsWith("cpt:")
      ));
      setHoverCandidates((current) => updateHoverCandidateState(current, candidateKeys));
    });
  }

  function getClickCandidateKey(event: MouseEvent<HTMLElement>, fallbackKey: string) {
    const rect = canvasRectRef.current;
    if (!rect) return fallbackKey;
    const candidates = findHoverCandidates(hoverMarkerIndex, {
      pointer: getProjectViewportPointer(event.clientX, event.clientY, rect),
      canvas: projectTransformRef.current.canvasSize,
      viewport: viewportRef.current,
      preferredMarkerType: state.foregroundLayer === "cpts" ? "cpt" : "load-point",
    });
    const candidateKeys = candidates.map((candidate) => candidate.key).filter((key) => (
      isEditingLoadPointLocks
        ? key.startsWith("load-point:")
        : !isEditingCptSelection || key.startsWith("cpt:")
    ));
    return resolveHoverClickCandidateKey(hoverCandidates, candidateKeys, fallbackKey);
  }

  function clearHoverCandidates() {
    hoverPointerRef.current = null;
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHoverCandidates(null);
  }

  function handleCptClick(event: MouseEvent<HTMLButtonElement>, cptId: number) {
    event.stopPropagation();
    if (isEditingLoadPointLocks) return;
    const clickedKey = getClickCandidateKey(event, `cpt:${cptId}`);
    clearHoverCandidates();
    selectMapMarker(clickedKey, getAdditiveSelectionModifier(event));
  }

  function handleLoadPointClick(event: MouseEvent<HTMLButtonElement>, loadPointId: number) {
    event.stopPropagation();
    if (isEditingLoadPointLocks) {
      onStateChange({
        ...state,
        loadPointLockDraft: toggleLoadPointLock(state.loadPointLockDraft!, loadPointId),
        viewport: viewportRef.current,
      });
      return;
    }
    if (lockedLoadPointIds.has(loadPointId)) return;
    if (!isViewerSelectionActionAllowed(isEditingCptSelection, "load-point")) {
      clearHoverCandidates();
      return;
    }
    const clickedKey = getClickCandidateKey(event, `load-point:${loadPointId}`);
    clearHoverCandidates();
    selectMapMarker(clickedKey, getAdditiveSelectionModifier(event));
  }

  function selectMapMarker(key: string, additiveKey: boolean) {
    const item = parseMarkerKey(key);
    if (item.type === "cpt") {
      const nextState = isEditingCptSelection
        ? toggleManualCpt(state, item.id)
        : { ...state, ...openReactViewerCpt(state, item.id) };
      onStateChange({ ...nextState, viewport: viewportRef.current });
      return;
    }
    if (!isViewerSelectionActionAllowed(isEditingCptSelection, "load-point")) return;
    const selection = additiveKey
      ? toggleReactViewerLoadPoint(state, item.id, loadPointGroups)
      : selectReactViewerLoadPoint(state, item.id, loadPointGroups);
    onStateChange({ ...state, ...selection, viewport: viewportRef.current });
  }

  return {
    lasso,
    hoverCandidates,
    activeHoverCandidateKey,
    clearHoverCandidates,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleCptClick,
    handleLoadPointClick,
  };
}

type MarkerReference = { type: "load-point" | "cpt"; id: number };

export function parseMarkerKey(key: string): MarkerReference {
  const [type, id] = key.split(":");
  return { type: type === "cpt" ? "cpt" : "load-point", id: Number(id) };
}

const TEXT_ENTRY_SELECTOR = [
  "textarea", "[contenteditable='true']", "input:not([type])", "input[type='text']",
  "input[type='search']", "input[type='email']", "input[type='url']", "input[type='tel']",
  "input[type='password']",
].join(",");

const NON_TEXT_ENTRY_SELECTOR = [
  "select", "input[type='number']", "input[type='date']", "input[type='datetime-local']",
  "input[type='month']", "input[type='time']", "input[type='week']",
].join(",");

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(TEXT_ENTRY_SELECTOR));
}

function isNonTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(NON_TEXT_ENTRY_SELECTOR));
}

function blurActiveNonTextControl(): void {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && !isTextEntryTarget(activeElement)) {
    activeElement.blur();
  }
}
