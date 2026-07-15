import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState";
import { getPointIdsInRectangle, type LassoRectangle } from "../../viewer/lassoSelection.ts";
import { getConfigurationStyle, getLegendItems } from "../../viewer/legend.ts";
import { getCptMarkerLayerClass, getLoadPointMarkerLayerClass } from "../../viewer/mapMarkerLayer.ts";
import { shouldStartMapPan } from "../../viewer/mapInteraction.ts";
import {
  getClosestVisibleMarkerKey,
  getCompactRingOffsets,
  getLoadPointVisualRadius,
  getMagnifiedMarkerSize,
  getOverlappingMarkerKeys,
} from "../../viewer/markerFan.ts";
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

const MARKER_FAN_OPEN_DELAY_MS = 120;
const MARKER_FAN_CLOSE_DELAY_MS = 300;

export default function PilePlanViewer({ state, onStateChange }: Props) {
  const { t } = useTranslation("common");
  const legend = getLegendItems(state.bearingCapacities);
  const selectedLoadPointIds = new Set(state.selectedLoadPointIds);
  const selectedCptIds = new Set(getReactViewerSelectedCptIds(state));
  const isEditingCptSelection = state.cptSelectionEditDraft?.loadPointId === state.selectedLoadPointId;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<ViewerInteraction | null>(null);
  const viewportRef = useRef(state.viewport);
  const zoomCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerFanOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerFanCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lasso, setLasso] = useState<LassoRectangle | null>(null);
  const [markerFan, setMarkerFan] = useState<MarkerFanState | null>(null);
  const fannedSourceKeys = new Set(markerFan?.items.map((item) => `${item.type}:${item.id}`));

  useEffect(() => {
    if (!interactionRef.current && !zoomCommitTimerRef.current) {
      viewportRef.current = state.viewport;
      applyViewportDisplay(state.viewport);
    }
  }, [state.viewport]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (markerFan) {
          closeMarkerFan();
          return;
        }
        onStateChange({ ...state, ...clearReactViewerSelection(state), viewport: viewportRef.current });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [markerFan, onStateChange, state]);

  useEffect(() => {
    return () => {
      if (zoomCommitTimerRef.current) {
        clearTimeout(zoomCommitTimerRef.current);
      }
      if (markerFanOpenTimerRef.current) {
        clearTimeout(markerFanOpenTimerRef.current);
      }
      if (markerFanCloseTimerRef.current) {
        clearTimeout(markerFanCloseTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="pile-plan-viewer" aria-label="Pile plan viewer">
      <div
        className="viewer-canvas"
        title={t("viewer.selectionHelp")}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        ref={canvasRef}
      >
        <div className="viewer-content" ref={stageRef} style={getStageStyle(state.viewport)}>
          <div className="viewer-grid" />
          {state.cpts.map((cpt) => {
            const point = projectPoint(cpt, state.bounds);
            const isSelected = selectedCptIds.has(cpt.id);
            const isRaised = shouldRaiseCptMarker(isSelected, isEditingCptSelection);
            return (
              <button
                aria-label={`CPT ${cpt.name}`}
                className={`cpt-marker${getCptMarkerLayerClass(isSelected)}${isRaised && !isSelected ? " is-layer-editable-cpt is-editable" : ""}${fannedSourceKeys.has(`cpt:${cpt.id}`) ? " is-fanned-source" : ""}`}
                data-map-marker-key={`cpt:${cpt.id}`}
                key={cpt.id}
                style={getProjectMarkerStyle(point)}
                type="button"
                onPointerEnter={(event) => scheduleMarkerFanOpen(event, `cpt:${cpt.id}`)}
                onPointerLeave={scheduleMarkerFanClose}
                onClick={(event) => {
                  event.stopPropagation();
                  const clickedKey = resolveClickedMarkerKey(event, `cpt:${cpt.id}`);
                  closeMarkerFan();
                  selectMapMarker(clickedKey, event.shiftKey);
                }}
              >
                <svg className="cpt-triangle" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
                  <polygon points="3,3 21,3 12,19" />
                </svg>
                <span className="cpt-label">{cpt.name.replace(/^CPT\s*/i, "")}</span>
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
                className={`load-point-marker${getLoadPointMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${invalidVisual.className}${unselectedClass}${fannedSourceKeys.has(`load-point:${loadPoint.id}`) ? " is-fanned-source" : ""}`}
                data-map-marker-key={`load-point:${loadPoint.id}`}
                key={loadPoint.id}
                style={getProjectMarkerStyle(point, invalidVisual.style)}
                type="button"
                onPointerEnter={(event) => scheduleMarkerFanOpen(event, `load-point:${loadPoint.id}`)}
                onPointerLeave={scheduleMarkerFanClose}
                onClick={(event) => {
                  event.stopPropagation();
                  const clickedKey = resolveClickedMarkerKey(event, `load-point:${loadPoint.id}`);
                  closeMarkerFan();
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
        {markerFan ? renderMarkerFan(markerFan) : null}
        {lasso ? <div className="viewer-lasso" style={getLassoStyle(lasso)} /> : null}
      </div>
    </div>
  );

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    closeMarkerFan();
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

    if (!target.closest(".marker-fan-item")) {
      closeMarkerFan();
    }

    if (event.shiftKey && !targetIsInteractive) {
      event.preventDefault();
      interactionRef.current = { type: "lasso", start, current: start };
      setLasso({ startX: start.x, startY: start.y, endX: start.x, endY: start.y });
      return;
    }

    if (!shouldStartMapPan({ button: event.button, targetIsInteractive })) {
      return;
    }

    event.preventDefault();
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

  function openMarkerFan(clickedKey: string): boolean {
    const canvas = canvasRef.current;
    if (!canvas) {
      return false;
    }

    const markers = getMarkerScreenRects(canvas);
    const keys = getOverlappingMarkerKeys(clickedKey, markers);
    if (keys.length <= 1) {
      setMarkerFan(null);
      return false;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const groupMarkers = markers.filter((marker) => keys.includes(marker.key)).map((marker) => ({
      key: marker.key,
      x: (marker.left + marker.right) / 2,
      y: (marker.top + marker.bottom) / 2,
      displaySize: getMagnifiedMarkerSize(marker.right - marker.left, marker.bottom - marker.top),
    }));
    const anchorMarker = groupMarkers.find((marker) => marker.key === clickedKey)!;
    const offsets = getCompactRingOffsets(groupMarkers.map((marker) => ({
      ...marker,
      radius: (marker.displaySize + 8) / 2,
    })), clickedKey);
    setMarkerFan({
      items: groupMarkers.map((marker) => {
        const offset = offsets.find((candidate) => candidate.key === marker.key)!;
        return {
          ...parseMarkerKey(marker.key),
          sourceX: marker.x - canvasRect.left,
          sourceY: marker.y - canvasRect.top,
          targetX: anchorMarker.x - canvasRect.left + offset.x,
          targetY: anchorMarker.y - canvasRect.top + offset.y,
          displaySize: marker.displaySize,
        };
      }),
    });
    return true;
  }

  function scheduleMarkerFanOpen(
    event: ReactPointerEvent<HTMLElement>,
    fallbackKey: string,
  ) {
    cancelMarkerFanClose();
    cancelMarkerFanOpen();
    const hoveredKey = resolveClickedMarkerKey(event, fallbackKey);
    markerFanOpenTimerRef.current = setTimeout(() => {
      markerFanOpenTimerRef.current = null;
      openMarkerFan(hoveredKey);
    }, MARKER_FAN_OPEN_DELAY_MS);
  }

  function scheduleMarkerFanClose() {
    cancelMarkerFanOpen();
    cancelMarkerFanClose();
    markerFanCloseTimerRef.current = setTimeout(() => {
      markerFanCloseTimerRef.current = null;
      setMarkerFan(null);
    }, MARKER_FAN_CLOSE_DELAY_MS);
  }

  function cancelMarkerFanOpen() {
    if (markerFanOpenTimerRef.current) {
      clearTimeout(markerFanOpenTimerRef.current);
      markerFanOpenTimerRef.current = null;
    }
  }

  function cancelMarkerFanClose() {
    if (markerFanCloseTimerRef.current) {
      clearTimeout(markerFanCloseTimerRef.current);
      markerFanCloseTimerRef.current = null;
    }
  }

  function closeMarkerFan() {
    cancelMarkerFanOpen();
    cancelMarkerFanClose();
    setMarkerFan(null);
  }

  function getMarkerScreenRects(canvas: HTMLElement) {
    return Array.from(canvas.querySelectorAll<HTMLElement>("[data-map-marker-key]")).map((marker) => {
      const rect = marker.getBoundingClientRect();
      const pileSymbol = marker.querySelector<HTMLElement>(".load-point-symbol .pile-symbol-svg");
      const pileSymbolRect = pileSymbol?.getBoundingClientRect();
      return {
        key: marker.dataset.mapMarkerKey!,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        visualRadius: pileSymbolRect
          ? getLoadPointVisualRadius(Math.min(pileSymbolRect.width, pileSymbolRect.height))
          : Math.min(rect.width, rect.height) * 0.43,
      };
    });
  }

  function resolveClickedMarkerKey(
    event: MouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
    fallbackKey: string,
  ) {
    const canvas = canvasRef.current;
    return canvas
      ? getClosestVisibleMarkerKey({ x: event.clientX, y: event.clientY }, fallbackKey, getMarkerScreenRects(canvas))
      : fallbackKey;
  }

  function renderMarkerFan(fan: MarkerFanState) {
    return (
      <div
        className="marker-fan"
        aria-label="Overlapping map objects"
        onPointerEnter={cancelMarkerFanClose}
        onPointerLeave={scheduleMarkerFanClose}
      >
        <svg
          className="marker-fan-lines"
          aria-hidden="true"
        >
          {fan.items.map((item) => (
            <line
              key={`${item.type}:${item.id}`}
              x1={item.sourceX}
              y1={item.sourceY}
              x2={item.targetX}
              y2={item.targetY}
            />
          ))}
        </svg>
        {fan.items.map((item) => {
          const visual = getFannedMarkerVisual(item);
          return (
            <button
              className={`marker-fan-item is-${item.type}${visual.className}`}
              key={`${item.type}:${item.id}`}
              style={{
                left: item.targetX,
                top: item.targetY,
                "--marker-fan-size": `${item.displaySize}px`,
                ...visual.style,
              } as CSSProperties}
              type="button"
              onClick={(event) => selectFannedMarker(item, event.shiftKey)}
            >
              {renderFannedMarker(item)}
            </button>
          );
        })}
      </div>
    );
  }

  function getFannedMarkerVisual(item: MarkerFanItem): { className: string; style: CSSProperties } {
    if (item.type === "cpt") {
      return {
        className: selectedCptIds.has(item.id) ? " is-layer-selected-cpt" : " is-layer-cpt",
        style: {},
      };
    }

    const selectedOption = getSelectedPileOption(state, item.id);
    const invalidVisual = getLoadPointMarkerInvalidVisual(selectedOption);
    const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
      state.pileOptionsByLoadPointId.get(item.id),
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
    return {
      className: `${selectedLoadPointIds.has(item.id) ? " is-selected" : ""}${invalidVisual.className}${unselectedClass}`,
      style: getInvalidMarkerStyle(invalidVisual.style),
    };
  }

  function renderFannedMarker(item: MarkerFanItem) {
    if (item.type === "cpt") {
      const cpt = state.cpts.find((candidate) => candidate.id === item.id);
      return (
        <>
          <svg className="marker-fan-cpt" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
            <polygon points="3,3 21,3 12,19" />
          </svg>
          <span className="marker-fan-cpt-label">{cpt?.name.replace(/^CPT\s*/i, "") ?? item.id}</span>
        </>
      );
    }

    const selectedOption = getSelectedPileOption(state, item.id);
    const style = selectedOption ? getConfigurationStyle(selectedOption, legend) : null;
    const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState(
      state.pileOptionsByLoadPointId.get(item.id),
      state.defaultPileSelectionPending,
      state.analysisError !== null,
    );
    return style ? (
      <span
        className="marker-fan-load-point load-point-symbol"
        dangerouslySetInnerHTML={{ __html: renderPileSymbol(style.shape, style.color) }}
      />
    ) : unselectedState === "pending" ? (
      <span className="marker-fan-pending load-point-pending" aria-hidden="true" />
    ) : (
      <span className="marker-fan-empty load-point-empty" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M6 6L18 18M18 6L6 18" />
        </svg>
      </span>
    );
  }

  function selectFannedMarker(item: MarkerFanItem, shiftKey: boolean) {
    setMarkerFan(null);
    selectMapMarker(`${item.type}:${item.id}`, shiftKey);
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

type MarkerFanItem = {
  type: "load-point" | "cpt";
  id: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  displaySize: number;
};

type MarkerFanState = {
  items: MarkerFanItem[];
};

function parseMarkerKey(key: string): Pick<MarkerFanItem, "type" | "id"> {
  const [type, id] = key.split(":");
  return {
    type: type === "cpt" ? "cpt" : "load-point",
    id: Number(id),
  };
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
