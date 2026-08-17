import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState";
import { getCptDisplayName } from "../../domain/cptDisplayName.ts";
import {
  getAdditiveSelectionModifier,
  getLassoSelectionOperation,
  getPointIdsInRectangle,
  shouldClearViewerSelectionOnEscape,
  shouldStartLassoInteraction,
  type LassoSelectionOperation,
  type LassoRectangle,
} from "../../viewer/lassoSelection.ts";
import { getConfigurationStyle } from "../../viewer/legend.ts";
import { getCptMarkerLayerClass, getForegroundLayerClass, getLoadPointMarkerLayerClass } from "../../viewer/mapMarkerLayer.ts";
import { shouldStartMapPan } from "../../viewer/mapInteraction.ts";
import { getHighlightedGoverningCptId } from "../../viewer/legendSelection.ts";
import { getCptLabelStyle } from "../../viewer/cptLabel.ts";
import {
  createHoverMarkerIndex,
  cycleHoverCandidate,
  findHoverCandidates,
  getActiveHoverCandidateKey,
  resolveHoverClickCandidateKey,
  updateHoverCandidateState,
  type HoverCandidateState,
  type HoverMarker,
  effectiveSymbolScale,
  scaleHoverVisualRadius,
} from "../../viewer/hoverCandidates.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
} from "../../viewer/loadPointMarker.ts";
import { getCptConnectionSegments } from "../../viewer/cptConnectionLines.ts";
import {
  createProjectViewTransform,
  getCanvasLayoutCompensation,
  projectPoint,
  projectPointPixels,
  VIEWER_LAYOUT_CHANGE_EVENT,
} from "../../viewer/viewerGeometry.ts";
import {
  clampScale,
  getViewportTransform,
  panViewport,
  projectViewPointToScreen,
  zoomViewportAtPoint,
} from "../../viewer/viewport.ts";
import {
  addReactViewerLoadPoints,
  clearReactViewerSelection,
  getReactViewerContextCptIds,
  getReactViewerSelectedCptIds,
  isReactViewerCptSelectionEditing,
  isViewerSelectionActionAllowed,
  openReactViewerCpt,
  selectReactViewerLoadPoint,
  setReactViewerLoadPoints,
  shouldRaiseCptMarker,
  toggleReactViewerLoadPoint,
} from "./viewerInteractions.ts";
import { getEffectivePileOptionsByLoadPointId, toggleManualCpt } from "./cptSettingsModel.ts";
import {
  alignCoordinateGridPatternToDevicePixels,
  getCoordinateGridPattern,
} from "../../viewer/coordinateGrid.ts";
import {
  getActiveLockedLoadPointIds,
  setLassoLoadPointLocks,
  toggleLoadPointLock,
} from "../../domain/loadPointLocking.ts";
import { elementLayoutScale, screenToLocal } from "../../domain/uiBaseline.ts";
import OptimizerUnresolvedMarker from "../viewer/OptimizerUnresolvedMarker.tsx";
import { CoordinateReadout } from "./CoordinateReadout.ts";
import {
  buildTipLevelRegionGeometry,
  projectTipLevelRegionPoints,
} from "../../viewer/tipLevelRegionGeometry.ts";
import { presentTipLevelRegionGeometry } from "../../viewer/tipLevelRegionPresentation.ts";
import { useTipLevelRegionTopology } from "./useTipLevelRegionTopology.ts";

type Props = {
  state: ProjectState;
  lassoSelectionActive: boolean;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanViewer({ state, lassoSelectionActive, onStateChange }: Props) {
  const { t, i18n } = useTranslation("common");
  const legend = state.pileLegend;
  const selectedLoadPointIds = new Set(state.selectedLoadPointIds);
  const activePilePlan = state.pilePlans.find(
    (plan) => plan.id === state.activePilePlanId,
  ) ?? state.pilePlans[0];
  const isEditingLoadPointLocks = state.loadPointLockDraft !== null;
  const lockedLoadPointIds = new Set(
    state.loadPointLockDraft
      ?? getActiveLockedLoadPointIds(state.pilePlans, state.activePilePlanId),
  );
  const contextSelectedCptIds = new Set(getReactViewerContextCptIds(state));
  const selectedCptIds = new Set(getReactViewerSelectedCptIds(state));
  const pileOptionsByLoadPointId = getEffectivePileOptionsByLoadPointId(state);
  const governingCptId = getHighlightedGoverningCptId({
    activeSelectedCptIds: [...contextSelectedCptIds],
    pileOptionsByLoadPointId,
    selectedLoadPointIds: state.selectedLoadPointIds,
    selectedPileOptionKeysByLoadPoint: state.selectedPileOptionKeysByLoadPoint,
  });
  const isEditingCptSelection = isReactViewerCptSelectionEditing(state);
  const [projectTransform, setProjectTransform] = useState(
    () => createProjectViewTransform(state.bounds, { width: 1, height: 1 }),
  );
  const projectTransformRef = useRef(projectTransform);
  const tipLevelRegionTopology = useTipLevelRegionTopology({
    enabled: state.showTipLevelRegions,
    loadPoints: state.loadPoints,
    selectedPileOptionKeysByLoadPoint: state.selectedPileOptionKeysByLoadPoint,
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId,
  });
  const tipLevelRegionPoints = useMemo(
    () => projectTipLevelRegionPoints(state.loadPoints, projectTransform),
    [projectTransform, state.loadPoints],
  );
  const tipLevelRegionGeometry = useMemo(() => (
    tipLevelRegionTopology
      ? buildTipLevelRegionGeometry({
          topology: tipLevelRegionTopology,
          pointsByLoadPointId: tipLevelRegionPoints,
          symbolScalePercent: state.symbolScalePercent,
        })
      : []
  ), [tipLevelRegionPoints, tipLevelRegionTopology, state.symbolScalePercent]);
  const tipLevelRegionPresentation = useMemo(
    () => presentTipLevelRegionGeometry(tipLevelRegionGeometry, legend),
    [tipLevelRegionGeometry, legend],
  );
  const cptConnectionSegments = useMemo(() => getCptConnectionSegments({
    transform: projectTransform,
    cpts: state.cpts,
    selectedLoadPointIds: state.selectedLoadPointIds,
    selectedCptsByLoadPointId: state.selectedCptsByLoadPointId,
    cptSelectionEditDraft: state.cptSelectionEditDraft,
  }), [
    projectTransform,
    state.cptSelectionEditDraft,
    state.cpts,
    state.selectedCptsByLoadPointId,
    state.selectedLoadPointIds,
  ]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layoutAnchorRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<ViewerInteraction | null>(null);
  const viewportRef = useRef(state.viewport);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRectRef = useRef<LocalCanvasRect | null>(null);
  const canvasAnchorRef = useRef<LocalCanvasRect | null>(null);
  const layoutCompensationRef = useRef({ x: 0, y: 0 });
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

  useEffect(() => {
    return () => {
      if (zoomCommitTimerRef.current) {
        clearTimeout(zoomCommitTimerRef.current);
      }
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="pile-plan-viewer" aria-label="Pile plan viewer">
      <div
        className="viewer-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={clearHoverCandidates}
        onWheel={handleWheel}
        ref={canvasRef}
      >
        {state.showGrid ? (
          <div
            aria-hidden="true"
            className="viewer-coordinate-grid"
            ref={gridRef}
          />
        ) : null}
        <div className="viewer-layout-anchor" ref={layoutAnchorRef}>
          <div
            className={`viewer-content${getForegroundLayerClass(state.foregroundLayer)}${isEditingLoadPointLocks ? " is-lock-editing" : ""}`}
            ref={stageRef}
            style={getStageStyle(
              state.viewport,
              state.symbolScalePercent,
              projectTransform.canvasSize,
            )}
          >
          {cptConnectionSegments.length > 0 ? (
            <svg className="cpt-connection-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {cptConnectionSegments.map((segment) => (
                <line
                  className="cpt-connection-line"
                  key={`${segment.from.id}-${segment.to.id}`}
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                />
              ))}
            </svg>
          ) : null}
          {state.cpts.map((cpt) => {
            const point = projectPointPixels(cpt, projectTransform);
            const cptName = getCptDisplayName(cpt);
            const cptLabel = cptName.replace(/^CPT\s*/i, "");
            const isInspected = state.selectedCptId === cpt.id;
            const isContextSelected = contextSelectedCptIds.has(cpt.id);
            const isInspectedOnly = isInspected && !isContextSelected;
            const isGoverning = governingCptId === cpt.id;
            const isRaised = shouldRaiseCptMarker(isContextSelected || isInspected, isEditingCptSelection);
            return (
              <button
                aria-label={cptName}
                className={`cpt-marker${getCptMarkerLayerClass(isContextSelected || isInspected)}${isRaised && !isContextSelected && !isInspected ? " is-layer-editable-cpt is-editable" : ""}${isInspected ? " is-inspected-cpt" : ""}${isInspectedOnly ? " is-inspected-only" : ""}${isGoverning ? " is-governing-cpt" : ""}${activeHoverCandidateKey === `cpt:${cpt.id}` ? " is-hover-candidate" : ""}`}
                data-map-marker-key={`cpt:${cpt.id}`}
                key={cpt.id}
                style={getProjectMarkerStyle(point)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditingLoadPointLocks) return;
                  const clickedKey = getClickCandidateKey(event, `cpt:${cpt.id}`);
                  clearHoverCandidates();
                  selectMapMarker(clickedKey, getAdditiveSelectionModifier(event));
                }}
              >
                <svg className="cpt-triangle" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
                  <polygon points="3,3 21,3 12,19" />
                  <text
                    className="cpt-label"
                    x="12"
                    y="9.5"
                    style={getCptLabelStyle(cptLabel) as CSSProperties}
                  >
                    {cptLabel}
                  </text>
                </svg>
              </button>
            );
          })}
          {state.loadPoints.map((loadPoint) => {
            const point = projectPointPixels(loadPoint, projectTransform);
            const isSelected = selectedLoadPointIds.has(loadPoint.id);
            const isLocked = lockedLoadPointIds.has(loadPoint.id);
            const selectedOption = getSelectedPileOption(state, loadPoint.id, pileOptionsByLoadPointId);
            const invalidVisual = getLoadPointMarkerInvalidVisual(
              selectedOption,
              state.viewerUtilizationSettings,
            );
            const style = selectedOption
              ? getConfigurationStyle(selectedOption, legend)
              : null;
            const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
              pileOptionsByLoadPointId.get(loadPoint.id),
              state.defaultPileSelectionPending,
              state.analysisError !== null,
              activePilePlan.optimizationUnassignedByLoadPoint.get(loadPoint.id),
            );
            const unselectedClass = unselectedState === "pending"
              ? " is-pending"
              : unselectedState === "missing"
                ? " has-missing-options"
                : unselectedState === "invalid"
                  ? " has-invalid-options"
                  : unselectedState === "optimizer-unassigned"
                    ? " has-optimizer-unassigned"
                  : "";

            return (
              <button
                aria-label={`Load point ${loadPoint.name}`}
                className={`load-point-marker${getLoadPointMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${isLocked ? " is-locked" : ""}${invalidVisual.className}${unselectedClass}${activeHoverCandidateKey === `load-point:${loadPoint.id}` ? " is-hover-candidate" : ""}`}
                data-map-marker-key={`load-point:${loadPoint.id}`}
                key={loadPoint.id}
                style={getProjectMarkerStyle(point, invalidVisual.style)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditingLoadPointLocks) {
                    onStateChange({
                      ...state,
                      loadPointLockDraft: toggleLoadPointLock(state.loadPointLockDraft!, loadPoint.id),
                      viewport: viewportRef.current,
                    });
                    return;
                  }
                  if (isLocked) return;
                  if (!isViewerSelectionActionAllowed(isEditingCptSelection, "load-point")) {
                    clearHoverCandidates();
                    return;
                  }
                  const clickedKey = getClickCandidateKey(event, `load-point:${loadPoint.id}`);
                  clearHoverCandidates();
                  selectMapMarker(clickedKey, getAdditiveSelectionModifier(event));
                }}
              >
                {style ? (
                  <span
                    className="load-point-symbol"
                    dangerouslySetInnerHTML={{ __html: renderPileSymbol(style.symbol, style.color) }}
                  />
                ) : unselectedState === "pending" ? (
                  <span className="load-point-pending" aria-hidden="true" />
                ) : unselectedState === "optimizer-unassigned" ? (
                  <OptimizerUnresolvedMarker
                    title={t("viewer.optimizerUnassigned")}
                  />
                ) : (
                  <span className="load-point-empty" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
        {hoverCandidates ? renderHoverInspector(hoverCandidates) : null}
        {lasso ? <div className="viewer-lasso" style={getLassoStyle(lasso)} /> : null}
      </div>
    </div>
  );

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
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

    if (!shouldStartMapPan({ button: event.button, targetIsInteractive })) {
      return;
    }

    event.preventDefault();
    clearHoverCandidates();
    interactionRef.current = {
      type: "pan",
      start,
      last: start,
      moved: false,
    };
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction) {
      const markerTarget = (event.target as HTMLElement).closest("[data-map-marker-key]");
      if (!markerTarget) {
        clearHoverCandidates();
        return;
      }
      if (!zoomCommitTimerRef.current) {
        scheduleHoverCandidateUpdate(event);
      }
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

    if (!interaction) {
      return;
    }

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
        onStateChange({ ...state, ...setReactViewerLoadPoints(state, unlockedIds), viewport: viewportRef.current });
      } else if (unlockedIds.length > 0) {
        onStateChange({ ...state, ...addReactViewerLoadPoints(state, unlockedIds), viewport: viewportRef.current });
      }
      return;
    }

    if (!interaction.moved && !isEditingLoadPointLocks && isViewerSelectionActionAllowed(isEditingCptSelection, "background")) {
      onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
      return;
    }

    onStateChange({ ...state, viewport: viewportRef.current });
  }

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

  function getVisibleLoadPointScreenPoints() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return [];
    }
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

  function scheduleHoverCandidateUpdate(event: MouseEvent<HTMLDivElement>) {
    const rect = canvasRectRef.current;
    if (!rect) {
      return;
    }

    hoverPointerRef.current = getProjectViewportPointer(event.clientX, event.clientY, rect);
    if (hoverFrameRef.current !== null) {
      return;
    }

    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const pointer = hoverPointerRef.current;
      const currentRect = canvasRectRef.current;
      if (!pointer || !currentRect || interactionRef.current || zoomCommitTimerRef.current) {
        return;
      }

      const candidates = findHoverCandidates(hoverMarkerIndex, {
        pointer,
        canvas: projectTransformRef.current.canvasSize,
        viewport: viewportRef.current,
        preferredMarkerType: state.foregroundLayer === "cpts" ? "cpt" : "load-point",
      });
      const candidateKeys = candidates
        .map((candidate) => candidate.key)
        .filter((key) => isEditingLoadPointLocks
          ? key.startsWith("load-point:")
          : !isEditingCptSelection || key.startsWith("cpt:"));
      setHoverCandidates((current) => updateHoverCandidateState(
        current,
        candidateKeys,
      ));
    });
  }

  function getClickCandidateKey(event: MouseEvent<HTMLElement>, fallbackKey: string) {
    const rect = canvasRectRef.current;
    if (!rect) {
      return fallbackKey;
    }

    const candidates = findHoverCandidates(hoverMarkerIndex, {
      pointer: getProjectViewportPointer(event.clientX, event.clientY, rect),
      canvas: projectTransformRef.current.canvasSize,
      viewport: viewportRef.current,
      preferredMarkerType: state.foregroundLayer === "cpts" ? "cpt" : "load-point",
    });
    const candidateKeys = candidates
      .map((candidate) => candidate.key)
      .filter((key) => isEditingLoadPointLocks
        ? key.startsWith("load-point:")
        : !isEditingCptSelection || key.startsWith("cpt:"));
    return resolveHoverClickCandidateKey(
      hoverCandidates,
      candidateKeys,
      fallbackKey,
    );
  }

  function clearHoverCandidates() {
    hoverPointerRef.current = null;
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHoverCandidates(null);
  }

  function getProjectViewportPointer(clientX: number, clientY: number, rect: LocalCanvasRect) {
    const pointer = getLocalPointer(clientX, clientY, rect);
    return {
      x: pointer.x - layoutCompensationRef.current.x,
      y: pointer.y - layoutCompensationRef.current.y,
    };
  }

  function renderHoverInspector(candidateState: HoverCandidateState) {
    const activeKey = getActiveHoverCandidateKey(candidateState);
    if (!activeKey) {
      return null;
    }

    const active = parseMarkerKey(activeKey);
    const loadPoint = active.type === "load-point"
      ? state.loadPoints.find((candidate) => candidate.id === active.id)
      : null;
    const cpt = active.type === "cpt"
      ? state.cpts.find((candidate) => candidate.id === active.id)
      : null;
    if (!loadPoint && !cpt) {
      return null;
    }

    const selectedOption = loadPoint ? getSelectedPileOption(state, loadPoint.id, pileOptionsByLoadPointId) : null;
    return (
      <section className="viewer-hover-inspector" aria-live="polite">
        <div className="viewer-hover-title">
          <span className="viewer-hover-large-symbol">{renderHoverMarkerSymbol(activeKey)}</span>
          <span className="viewer-hover-title-copy">
            <span>{t(active.type === "load-point" ? "viewer.hover.loadPoint" : "viewer.hover.cpt")}</span>
            <strong>{stripMarkerNamePrefix(loadPoint?.name ?? getCptDisplayName(cpt!))}</strong>
          </span>
          {candidateState.keys.length > 1 ? (
            <span className="viewer-hover-position">
              {candidateState.activeIndex + 1} / {candidateState.keys.length}
            </span>
          ) : null}
        </div>
        <div className="viewer-hover-facts">
          {loadPoint ? (
            <>
              <div className="viewer-hover-fact">
                <span>F<sub>Ed</sub></span>
                <strong>{formatHoverNumber(loadPoint.design_load_kn, " kN")}</strong>
              </div>
              <div className="viewer-hover-fact">
                <span>{t("viewer.hover.utilization")}</span>
                <strong>{selectedOption?.utilization == null
                  ? "-"
                  : formatHoverNumber(selectedOption.utilization * 100, "%")}</strong>
              </div>
            </>
          ) : null}
          <CoordinateReadout points={[loadPoint ?? cpt!]} locale={i18n.language} />
        </div>
        {candidateState.keys.length > 1 ? (
          <>
            <div className="viewer-hover-candidates">
              {candidateState.keys.map((key) => (
                <span className={`viewer-hover-candidate-symbol${key === activeKey ? " is-active" : ""}`} key={key}>
                  {renderHoverMarkerSymbol(key)}
                </span>
              ))}
              <span className="viewer-hover-candidate-count">
                {t("viewer.hover.candidateCount", { count: candidateState.keys.length })}
              </span>
            </div>
            <div className="viewer-hover-shortcut">
              <span className="viewer-hover-keycap">{t("viewer.hover.spaceKey")}</span>
              <span>{t("viewer.hover.nextCandidate")}</span>
            </div>
          </>
        ) : null}
        {loadPoint && selectedLoadPointIds.size > 0 ? (
          <div className="viewer-hover-shortcut is-stacked">
            <span className="viewer-hover-shortcut-combination">
              <span className="viewer-hover-keycap">Ctrl</span>
              <span className="viewer-hover-shortcut-plus" aria-hidden="true">+</span>
              <span className="viewer-hover-keycap">{t("viewer.hover.clickKey")}</span>
            </span>
            <span>{t("viewer.hover.addToSelection")}</span>
          </div>
        ) : null}
      </section>
    );
  }

  function renderHoverMarkerSymbol(key: string) {
    const item = parseMarkerKey(key);
    if (item.type === "cpt") {
      const cpt = state.cpts.find((candidate) => candidate.id === item.id);
      const label = stripMarkerNamePrefix(cpt ? getCptDisplayName(cpt) : String(item.id));
      const selectionClass = selectedCptIds.has(item.id) ? " is-selected-cpt" : "";
      return (
        <span className={`viewer-hover-marker is-cpt${selectionClass}`}>
          <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false"><polygon points="3,3 21,3 12,19" /></svg>
          <span style={getCptLabelStyle(label) as CSSProperties}>{label}</span>
        </span>
      );
    }

    const selectedOption = getSelectedPileOption(state, item.id, pileOptionsByLoadPointId);
    const symbolStyle = selectedOption ? getConfigurationStyle(selectedOption, legend) : null;
    const invalidVisual = getLoadPointMarkerInvalidVisual(
      selectedOption,
      state.viewerUtilizationSettings,
    );
    const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
      pileOptionsByLoadPointId.get(item.id),
      state.defaultPileSelectionPending,
      state.analysisError !== null,
      activePilePlan.optimizationUnassignedByLoadPoint.get(item.id),
    );
    const statusClass = unselectedState === "pending"
      ? " is-pending"
      : unselectedState === "missing"
        ? " has-missing-options"
        : unselectedState === "invalid"
          ? " has-invalid-options"
          : unselectedState === "optimizer-unassigned"
            ? " has-optimizer-unassigned"
          : "";
    return (
      <span
        className={`viewer-hover-marker is-load-point${invalidVisual.className}${statusClass}`}
        style={getInvalidMarkerStyle(invalidVisual.style)}
      >
        {symbolStyle ? (
          <span dangerouslySetInnerHTML={{ __html: renderPileSymbol(symbolStyle.symbol, symbolStyle.color) }} />
        ) : unselectedState === "pending" ? (
          <span className="load-point-pending" aria-hidden="true" />
        ) : unselectedState === "optimizer-unassigned" ? (
          <OptimizerUnresolvedMarker
            placement="inline"
            title={t("viewer.optimizerUnassigned")}
          />
        ) : (
          <span className="load-point-empty" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M6 6L18 18M18 6L6 18" /></svg>
          </span>
        )}
      </span>
    );
  }

  function formatHoverNumber(value: number, suffix: string) {
    return `${value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}${suffix}`;
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

    if (!isViewerSelectionActionAllowed(isEditingCptSelection, "load-point")) {
      return;
    }

    const selection = additiveKey
      ? toggleReactViewerLoadPoint(state, item.id)
      : selectReactViewerLoadPoint(state, item.id);
    onStateChange({ ...state, ...selection, viewport: viewportRef.current });
  }
}

type ViewerInteraction =
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

type LocalCanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

function getLocalCanvasRect(canvas: HTMLElement): LocalCanvasRect {
  return getLocalElementRect(canvas);
}

function getLocalElementRect(element: Element): LocalCanvasRect {
  const rect = element.getBoundingClientRect();
  const scale = elementLayoutScale(document.documentElement);
  return {
    left: screenToLocal(rect.left, scale),
    top: screenToLocal(rect.top, scale),
    width: screenToLocal(rect.width, scale),
    height: screenToLocal(rect.height, scale),
    scale,
  };
}

function getLocalPointer(clientX: number, clientY: number, rect: LocalCanvasRect) {
  return {
    x: screenToLocal(clientX, rect.scale) - rect.left,
    y: screenToLocal(clientY, rect.scale) - rect.top,
  };
}

function getLocalViewportPointer(clientX: number, clientY: number, scale: number) {
  return {
    x: screenToLocal(clientX, scale),
    y: screenToLocal(clientY, scale),
  };
}

type MarkerReference = {
  type: "load-point" | "cpt";
  id: number;
};

function parseMarkerKey(key: string): MarkerReference {
  const [type, id] = key.split(":");
  return {
    type: type === "cpt" ? "cpt" : "load-point",
    id: Number(id),
  };
}

function stripMarkerNamePrefix(name: string): string {
  return name.replace(/^(?:load point|cpt)\s*/i, "").trim();
}

const TEXT_ENTRY_SELECTOR = [
  "textarea",
  "[contenteditable='true']",
  "input:not([type])",
  "input[type='text']",
  "input[type='search']",
  "input[type='email']",
  "input[type='url']",
  "input[type='tel']",
  "input[type='password']",
].join(",");

const NON_TEXT_ENTRY_SELECTOR = [
  "select",
  "input[type='number']",
  "input[type='date']",
  "input[type='datetime-local']",
  "input[type='month']",
  "input[type='time']",
  "input[type='week']",
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

function getSelectedPileOption(
  state: ProjectState,
  loadPointId: number,
  pileOptionsByLoadPointId: ProjectState["pileOptionsByLoadPointId"],
) {
  const key = state.selectedPileOptionKeysByLoadPoint.get(loadPointId);
  if (!key) {
    return null;
  }

  const [pileSize, pileTipLevel] = key.split("|").map(Number);
  if (!Number.isFinite(pileSize) || !Number.isFinite(pileTipLevel)) {
    return null;
  }

  return pileOptionsByLoadPointId.get(loadPointId)?.find((option) => (
    option.pile_size_mm === pileSize && option.pile_tip_level_m === pileTipLevel
  )) ?? {
    pile_size_mm: pileSize,
    pile_tip_level_m: pileTipLevel,
    isOption: false,
    governing_cpt_id: null,
    governing_frd_kn: null,
    utilization: null,
    missing_cpt_ids: [0],
  };
}

function getLassoStyle(lasso: LassoRectangle) {
  const left = Math.min(lasso.startX, lasso.endX);
  const top = Math.min(lasso.startY, lasso.endY);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.abs(lasso.endX - lasso.startX)}px`,
    height: `${Math.abs(lasso.endY - lasso.startY)}px`,
  };
}

function getProjectMarkerStyle(point: { x: number; y: number }, invalidStyle = ""): CSSProperties {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    ...getInvalidMarkerStyle(invalidStyle),
  };
}

function getInvalidMarkerStyle(invalidStyle = ""): CSSProperties {
  const intensity = invalidStyle.match(/--utilization-intensity: ([0-9.]+)/)?.[1];
  return intensity ? { "--utilization-intensity": intensity } as CSSProperties : {};
}

function getStageStyle(
  viewport: ProjectState["viewport"],
  symbolScalePercent: number,
  canvasSize: { width: number; height: number },
): CSSProperties {
  return {
    width: `${canvasSize.width}px`,
    height: `${canvasSize.height}px`,
    transform: getViewportTransform(viewport),
    "--viewer-symbol-scale": effectiveSymbolScale(symbolScalePercent),
  } as CSSProperties;
}

function getCoordinateGridStyle(pattern: ReturnType<typeof getCoordinateGridPattern>): {
  backgroundSize: string;
  backgroundPosition: string;
} {
  return {
    backgroundSize: `${pattern.spacingPixels}px ${pattern.spacingPixels}px`,
    backgroundPosition: `${pattern.originX}px ${pattern.originY}px`,
  };
}
