import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState";
import { getCptDisplayName } from "../../domain/cptDisplayName.ts";
import { getPointIdsInRectangle, type LassoRectangle } from "../../viewer/lassoSelection.ts";
import { getConfigurationStyle, getLegendItems } from "../../viewer/legend.ts";
import { getCptMarkerLayerClass, getLoadPointMarkerLayerClass } from "../../viewer/mapMarkerLayer.ts";
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
} from "../../viewer/hoverCandidates.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
} from "../../viewer/loadPointMarker.ts";
import { projectPoint } from "../../viewer/viewerGeometry.ts";
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
  openReactViewerCpt,
  selectReactViewerLoadPoint,
  shouldRaiseCptMarker,
  toggleReactViewerLoadPoint,
} from "./viewerInteractions.ts";
import { toggleManualCpt } from "./cptSettingsModel.ts";

type Props = {
  state: ProjectState;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanViewer({ state, onStateChange }: Props) {
  const { t, i18n } = useTranslation("common");
  const legend = getLegendItems(state.bearingCapacities);
  const selectedLoadPointIds = new Set(state.selectedLoadPointIds);
  const contextSelectedCptIds = new Set(getReactViewerContextCptIds(state));
  const selectedCptIds = new Set(getReactViewerSelectedCptIds(state));
  const governingCptId = getHighlightedGoverningCptId({
    activeSelectedCptIds: [...contextSelectedCptIds],
    pileOptionsByLoadPointId: state.pileOptionsByLoadPointId,
    selectedLoadPointIds: state.selectedLoadPointIds,
    selectedPileOptionKeysByLoadPoint: state.selectedPileOptionKeysByLoadPoint,
  });
  const isEditingCptSelection = state.cptSelectionEditDraft?.loadPointId === state.selectedLoadPointId;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<ViewerInteraction | null>(null);
  const viewportRef = useRef(state.viewport);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const [lasso, setLasso] = useState<LassoRectangle | null>(null);
  const [hoverCandidates, setHoverCandidates] = useState<HoverCandidateState | null>(null);
  const activeHoverCandidateKey = getActiveHoverCandidateKey(hoverCandidates);
  const hoverMarkers = useMemo<HoverMarker[]>(() => [
    ...state.cpts.map((cpt) => ({
      key: `cpt:${cpt.id}`,
      point: projectPoint(cpt, state.bounds),
      visualRadius: 7.5,
    })),
    ...state.loadPoints.map((loadPoint) => ({
      key: `load-point:${loadPoint.id}`,
      point: projectPoint(loadPoint, state.bounds),
      visualRadius: 7,
    })),
  ], [state.bounds, state.cpts, state.loadPoints]);
  const hoverMarkerIndex = useMemo(() => createHoverMarkerIndex(hoverMarkers), [hoverMarkers]);

  useEffect(() => {
    if (!interactionRef.current && !zoomCommitTimerRef.current) {
      viewportRef.current = state.viewport;
      applyViewportDisplay(state.viewport);
    }
  }, [state.viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const updateCanvasRect = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    };
    updateCanvasRect();

    const resizeObserver = new ResizeObserver(updateCanvasRect);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", updateCanvasRect);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasRect);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" && hoverCandidates && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        if (hoverCandidates.keys.length > 1) {
          setHoverCandidates((current) => current ? cycleHoverCandidate(current) : current);
        }
        return;
      }

      if (event.key === "Escape") {
        clearHoverCandidates();
        onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
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
        <div className="viewer-content" ref={stageRef} style={getStageStyle(state.viewport)}>
          <div className="viewer-grid" />
          {state.cpts.map((cpt) => {
            const point = projectPoint(cpt, state.bounds);
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
                  const clickedKey = getClickCandidateKey(event, `cpt:${cpt.id}`);
                  clearHoverCandidates();
                  selectMapMarker(clickedKey, event.shiftKey);
                }}
              >
                <svg className="cpt-triangle" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
                  <polygon points="3,3 21,3 12,19" />
                </svg>
                <span className="cpt-label" style={getCptLabelStyle(cptLabel) as CSSProperties}>{cptLabel}</span>
              </button>
            );
          })}
          {state.loadPoints.map((loadPoint) => {
            const point = projectPoint(loadPoint, state.bounds);
            const isSelected = selectedLoadPointIds.has(loadPoint.id);
            const selectedOption = getSelectedPileOption(state, loadPoint.id);
            const invalidVisual = getLoadPointMarkerInvalidVisual(selectedOption);
            const style = selectedOption
              ? getConfigurationStyle(selectedOption, legend)
              : null;
            const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
              state.pileOptionsByLoadPointId.get(loadPoint.id),
              state.defaultPileSelectionPending,
              state.analysisError !== null,
            );
            const unselectedClass = unselectedState === "pending"
              ? " is-pending"
              : unselectedState === "missing"
                ? " has-missing-options"
                : unselectedState === "invalid"
                  ? " has-invalid-options"
                  : "";

            return (
              <button
                aria-label={`Load point ${loadPoint.name}`}
                className={`load-point-marker${getLoadPointMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${invalidVisual.className}${unselectedClass}${activeHoverCandidateKey === `load-point:${loadPoint.id}` ? " is-hover-candidate" : ""}`}
                data-map-marker-key={`load-point:${loadPoint.id}`}
                key={loadPoint.id}
                style={getProjectMarkerStyle(point, invalidVisual.style)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const clickedKey = getClickCandidateKey(event, `load-point:${loadPoint.id}`);
                  clearHoverCandidates();
                  selectMapMarker(clickedKey, event.shiftKey);
                }}
              >
                {style ? (
                  <span
                    className="load-point-symbol"
                    dangerouslySetInnerHTML={{ __html: renderPileSymbol(style.shape, style.color) }}
                  />
                ) : unselectedState === "pending" ? (
                  <span className="load-point-pending" aria-hidden="true" />
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
        {hoverCandidates ? renderHoverInspector(hoverCandidates) : null}
        {lasso ? <div className="viewer-lasso" style={getLassoStyle(lasso)} /> : null}
      </div>
    </div>
  );

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    clearHoverCandidates();
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const currentViewport = viewportRef.current;
    const nextScale = clampScale(currentViewport.scale * scaleStep);
    const nextViewport = zoomViewportAtPoint(currentViewport, {
      cursorX: event.clientX - rect.left,
      cursorY: event.clientY - rect.top,
      nextScale,
    });
    viewportRef.current = nextViewport;
    applyViewportDisplay(nextViewport);
    scheduleViewportCommit(nextViewport);
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const targetIsInteractive = Boolean(target.closest("button"));
    const start = { x: event.clientX, y: event.clientY };

    if (event.shiftKey && !targetIsInteractive) {
      event.preventDefault();
      clearHoverCandidates();
      interactionRef.current = { type: "lasso", start, current: start };
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

    if (interaction.type === "lasso") {
      interaction.current = { x: event.clientX, y: event.clientY };
      setLasso({
        startX: interaction.start.x,
        startY: interaction.start.y,
        endX: interaction.current.x,
        endY: interaction.current.y,
      });
      return;
    }

    const deltaX = event.clientX - interaction.last.x;
    const deltaY = event.clientY - interaction.last.y;
    const totalMove = Math.hypot(event.clientX - interaction.start.x, event.clientY - interaction.start.y);
    interaction.last = { x: event.clientX, y: event.clientY };
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
      const rectangle = {
        startX: interaction.start.x,
        startY: interaction.start.y,
        endX: event.clientX,
        endY: event.clientY,
      };
      setLasso(null);
      const loadPointIds = getPointIdsInRectangle(getVisibleLoadPointScreenPoints(), rectangle);
      if (loadPointIds.length > 0) {
        onStateChange({ ...state, ...addReactViewerLoadPoints(state, loadPointIds), viewport: viewportRef.current });
      }
      return;
    }

    if (!interaction.moved) {
      onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
      return;
    }

    onStateChange({ ...state, viewport: viewportRef.current });
  }

  function applyViewportDisplay(nextViewport: ProjectState["viewport"]) {
    if (stageRef.current) {
      stageRef.current.style.transform = getViewportTransform(nextViewport);
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

  function getVisibleLoadPointScreenPoints() {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return [];
    }

    const viewport = viewportRef.current;
    return state.loadPoints.map((loadPoint) => {
      const point = projectPoint(loadPoint, state.bounds);
      const screenPoint = projectViewPointToScreen(point, { width: rect.width, height: rect.height }, viewport);
      return {
        id: loadPoint.id,
        x: rect.left + screenPoint.x,
        y: rect.top + screenPoint.y,
      };
    });
  }

  function scheduleHoverCandidateUpdate(event: MouseEvent<HTMLDivElement>) {
    const rect = canvasRectRef.current;
    if (!rect) {
      return;
    }

    hoverPointerRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
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
        canvas: { width: currentRect.width, height: currentRect.height },
        viewport: viewportRef.current,
      });
      setHoverCandidates((current) => updateHoverCandidateState(
        current,
        candidates.map((candidate) => candidate.key),
      ));
    });
  }

  function getClickCandidateKey(event: MouseEvent<HTMLElement>, fallbackKey: string) {
    const rect = canvasRectRef.current;
    if (!rect) {
      return fallbackKey;
    }

    const candidates = findHoverCandidates(hoverMarkerIndex, {
      pointer: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      canvas: { width: rect.width, height: rect.height },
      viewport: viewportRef.current,
    });
    return resolveHoverClickCandidateKey(
      hoverCandidates,
      candidates.map((candidate) => candidate.key),
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

    const selectedOption = loadPoint ? getSelectedPileOption(state, loadPoint.id) : null;
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
          ) : (
            <>
              <div className="viewer-hover-fact"><span>X</span><strong>{formatHoverNumber(cpt!.x_mm, " mm")}</strong></div>
              <div className="viewer-hover-fact"><span>Y</span><strong>{formatHoverNumber(cpt!.y_mm, " mm")}</strong></div>
            </>
          )}
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
          <div className="viewer-hover-shortcut">
            <span className="viewer-hover-keycap">Shift</span>
            <span>{t("viewer.hover.shiftHint")}</span>
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

    const selectedOption = getSelectedPileOption(state, item.id);
    const symbolStyle = selectedOption ? getConfigurationStyle(selectedOption, legend) : null;
    const invalidVisual = getLoadPointMarkerInvalidVisual(selectedOption);
    const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
      state.pileOptionsByLoadPointId.get(item.id),
      state.defaultPileSelectionPending,
      state.analysisError !== null,
    );
    const statusClass = unselectedState === "pending"
      ? " is-pending"
      : unselectedState === "missing"
        ? " has-missing-options"
        : unselectedState === "invalid"
          ? " has-invalid-options"
          : "";
    return (
      <span
        className={`viewer-hover-marker is-load-point${invalidVisual.className}${statusClass}`}
        style={getInvalidMarkerStyle(invalidVisual.style)}
      >
        {symbolStyle ? (
          <span dangerouslySetInnerHTML={{ __html: renderPileSymbol(symbolStyle.shape, symbolStyle.color) }} />
        ) : unselectedState === "pending" ? (
          <span className="load-point-pending" aria-hidden="true" />
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

  function selectMapMarker(key: string, shiftKey: boolean) {
    const item = parseMarkerKey(key);
    if (item.type === "cpt") {
      const nextState = state.cptSelectionEditDraft?.loadPointId === state.selectedLoadPointId
        ? toggleManualCpt(state, item.id)
        : { ...state, ...openReactViewerCpt(state, item.id) };
      onStateChange({ ...nextState, viewport: viewportRef.current });
      return;
    }

    const selection = shiftKey
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
  };

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

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function getSelectedPileOption(state: ProjectState, loadPointId: number) {
  const key = state.selectedPileOptionKeysByLoadPoint.get(loadPointId);
  if (!key) {
    return null;
  }

  const [pileSize, pileTipLevel] = key.split("|").map(Number);
  if (!Number.isFinite(pileSize) || !Number.isFinite(pileTipLevel)) {
    return null;
  }

  return state.pileOptionsByLoadPointId.get(loadPointId)?.find((option) => (
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
    left: `${point.x}%`,
    top: `${point.y}%`,
    ...getInvalidMarkerStyle(invalidStyle),
  };
}

function getInvalidMarkerStyle(invalidStyle = ""): CSSProperties {
  const intensity = invalidStyle.match(/--invalid-intensity: ([0-9.]+)/)?.[1];
  return intensity ? { "--invalid-intensity": intensity } as CSSProperties : {};
}

function getStageStyle(viewport: ProjectState["viewport"]): CSSProperties {
  return {
    transform: getViewportTransform(viewport),
  };
}
