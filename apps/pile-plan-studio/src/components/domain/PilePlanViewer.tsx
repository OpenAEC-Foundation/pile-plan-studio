import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../domain/projectState";
import { getPointIdsInRectangle, type LassoRectangle } from "../../viewer/lassoSelection.ts";
import { getConfigurationStyle, getLegendItems } from "../../viewer/legend.ts";
import { getCptMarkerLayerClass, getLoadPointMarkerLayerClass } from "../../viewer/mapMarkerLayer.ts";
import { shouldStartMapPan } from "../../viewer/mapInteraction.ts";
import {
  getMagnifiedMarkerOffsets,
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
  const [lasso, setLasso] = useState<LassoRectangle | null>(null);
  const [markerFan, setMarkerFan] = useState<MarkerFanState | null>(null);

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
          setMarkerFan(null);
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
                className={`cpt-marker${getCptMarkerLayerClass(isSelected)}${isRaised && !isSelected ? " is-layer-editable-cpt is-editable" : ""}`}
                data-map-marker-key={`cpt:${cpt.id}`}
                key={cpt.id}
                style={getProjectMarkerStyle(point)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (openMarkerFan(`cpt:${cpt.id}`)) {
                    return;
                  }
                  const nextState = state.cptSelectionEditDraft?.loadPointId === state.selectedLoadPointId
                    ? toggleManualCpt(state, cpt.id)
                    : { ...state, ...openReactViewerCpt(state, cpt.id) };
                  onStateChange({ ...nextState, viewport: viewportRef.current });
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
                className={`load-point-marker${getLoadPointMarkerLayerClass(isSelected)}${isSelected ? " is-selected" : ""}${invalidVisual.className}${unselectedClass}`}
                data-map-marker-key={`load-point:${loadPoint.id}`}
                key={loadPoint.id}
                style={getProjectMarkerStyle(point, invalidVisual.style)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (openMarkerFan(`load-point:${loadPoint.id}`)) {
                    return;
                  }
                  const selection = event.shiftKey
                    ? toggleReactViewerLoadPoint(state, loadPoint.id)
                    : selectReactViewerLoadPoint(state, loadPoint.id);
                  onStateChange({ ...state, ...selection, viewport: viewportRef.current });
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
    setMarkerFan(null);
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
      setMarkerFan(null);
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

    const markers = Array.from(canvas.querySelectorAll<HTMLElement>("[data-map-marker-key]")).map((marker) => {
      const rect = marker.getBoundingClientRect();
      return {
        key: marker.dataset.mapMarkerKey!,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        visualRadius: Math.min(rect.width, rect.height) * 0.43,
      };
    });
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
    const groupCenter = {
      x: groupMarkers.reduce((sum, marker) => sum + marker.x, 0) / groupMarkers.length,
      y: groupMarkers.reduce((sum, marker) => sum + marker.y, 0) / groupMarkers.length,
    };
    const minimumDistance = Math.max(...groupMarkers.map((marker) => marker.displaySize)) + 10;
    const offsets = getMagnifiedMarkerOffsets(groupMarkers, minimumDistance);
    setMarkerFan({
      items: groupMarkers.map((marker) => {
        const offset = offsets.find((candidate) => candidate.key === marker.key)!;
        return {
          ...parseMarkerKey(marker.key),
          sourceX: marker.x - canvasRect.left,
          sourceY: marker.y - canvasRect.top,
          targetX: groupCenter.x - canvasRect.left + offset.x,
          targetY: groupCenter.y - canvasRect.top + offset.y,
          displaySize: marker.displaySize,
        };
      }),
    });
    return true;
  }

  function renderMarkerFan(fan: MarkerFanState) {
    return (
      <div className="marker-fan" aria-label="Overlapping map objects">
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
        {fan.items.map((item) => (
          <button
            className={`marker-fan-item is-${item.type}`}
            key={`${item.type}:${item.id}`}
            style={{
              left: item.targetX,
              top: item.targetY,
              "--marker-fan-size": `${item.displaySize}px`,
            } as CSSProperties}
            type="button"
            onClick={(event) => selectFannedMarker(item, event.shiftKey)}
          >
            {renderFannedMarker(item)}
          </button>
        ))}
      </div>
    );
  }

  function renderFannedMarker(item: MarkerFanItem) {
    if (item.type === "cpt") {
      const cpt = state.cpts.find((candidate) => candidate.id === item.id);
      return (
        <>
          <svg className="marker-fan-cpt" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
            <polygon points="3,3 21,3 12,19" />
          </svg>
          <span className="marker-fan-label">{cpt?.name.replace(/^CPT\s*/i, "") ?? item.id}</span>
        </>
      );
    }

    const loadPoint = state.loadPoints.find((candidate) => candidate.id === item.id);
    const selectedOption = getSelectedPileOption(state, item.id);
    const style = selectedOption ? getConfigurationStyle(selectedOption, legend) : null;
    return (
      <>
        {style ? (
          <span
            className="marker-fan-load-point"
            dangerouslySetInnerHTML={{ __html: renderPileSymbol(style.shape, style.color) }}
          />
        ) : (
          <span className="marker-fan-empty">×</span>
        )}
        <span className="marker-fan-label">
          {loadPoint?.name.replace(/^Load point\s*/i, "") ?? item.id}
        </span>
      </>
    );
  }

  function selectFannedMarker(item: MarkerFanItem, shiftKey: boolean) {
    setMarkerFan(null);
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
  const intensity = invalidStyle.match(/--invalid-intensity: ([0-9.]+)/)?.[1];
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    ...(intensity ? { "--invalid-intensity": intensity } : {}),
  };
}

function getStageStyle(viewport: ProjectState["viewport"]): CSSProperties {
  return {
    transform: getViewportTransform(viewport),
  };
}
