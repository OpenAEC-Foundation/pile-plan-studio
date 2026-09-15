import {
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState";
import { getCptDisplayName } from "../../../domain/source-data/cptDisplayName.ts";
import {
  type LassoRectangle,
} from "../../../viewer/lassoSelection.ts";
import { getConfigurationActivationPresentation } from "../../../domain/legend/legendActivationPresentation.ts";
import { getPilePlanActivation } from "../../../domain/pile-plans/pilePlanActivation.ts";
import { getHighlightedGoverningCptId } from "../../../viewer/legendSelection.ts";
import { getCptLabelStyle } from "../../../viewer/cptLabel.ts";
import {
  getActiveHoverCandidateKey,
  type HoverCandidateState,
} from "../../../viewer/hoverCandidates.ts";
import { renderPileSymbol } from "../../../viewer/pileSymbols.ts";
import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
  usesNeutralUnassignedMarker,
} from "../../../viewer/loadPointMarker.ts";
import { getCptConnectionSegments } from "../../../viewer/cptConnectionLines.ts";
import {
  getReactViewerContextCptIds,
  getReactViewerSelectedCptIds,
  isReactViewerCptSelectionEditing,
} from "../../../domain/workspace/viewerInteractions.ts";
import { getEffectivePileOptionsByLoadPointId } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import {
  getActiveLockedLoadPointIds,
} from "../../../domain/pile-plans/loadPointLocking.ts";
import OptimizerUnresolvedMarker from "../../viewer/OptimizerUnresolvedMarker.tsx";
import { CoordinateReadout } from "../shared/CoordinateReadout.ts";
import {
  buildTipLevelRegionGeometry,
  projectTipLevelRegionPoints,
} from "../../../viewer/tipLevelRegionGeometry.ts";
import { presentTipLevelRegionGeometry } from "../../../viewer/tipLevelRegionPresentation.ts";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { TipLevelRegionTopology } from "../../../core/tipLevelRegionContract.ts";
import { getLoadPointGroupSelection } from "../../../viewer/loadPointGroupSelection.ts";
import { useViewerViewport } from "./useViewerViewport.ts";
import ViewerStage from "./ViewerStage.tsx";
import { getSelectedPileOption } from "./viewerPresentation.ts";
import {
  parseMarkerKey,
  useViewerPointerInteractions,
  type ViewerInteraction,
} from "./useViewerPointerInteractions.ts";

export type PilePlanViewerProps = {
  state: ProjectState;
  loadPointGroups: LoadPointGroup[];
  technicalAssignment: TechnicalAssignmentSnapshot;
  lassoSelectionActive: boolean;
  tipLevelRegionTopology: TipLevelRegionTopology | null;
  onStateChange: (nextState: ProjectState) => void;
};

export default function PilePlanViewer({
  state,
  loadPointGroups,
  technicalAssignment,
  lassoSelectionActive,
  tipLevelRegionTopology,
  onStateChange,
}: PilePlanViewerProps) {
  const { t, i18n } = useTranslation("common");
  const legend = state.pileLegend;
  const selectedLoadPointIds = new Set(state.selectedLoadPointIds);
  const groupSelection = useMemo(() => getLoadPointGroupSelection({
    selectedLoadPointIds: state.selectedLoadPointIds,
    groups: loadPointGroups,
  }), [loadPointGroups, state.selectedLoadPointIds]);
  const relatedLoadPointIds = new Set(groupSelection.relatedLoadPointIds);
  const activePilePlan = state.pilePlans.find(
    (plan) => plan.id === state.activePilePlanId,
  ) ?? state.pilePlans[0];
  const activePileConfigurations = getPilePlanActivation(activePilePlan);
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
    selectedPileConfigurationsByLoadPoint: state.selectedPileConfigurationsByLoadPoint,
  });
  const isEditingCptSelection = isReactViewerCptSelectionEditing(state);
  const interactionRef = useRef<ViewerInteraction | null>(null);
  const {
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
    handleWheel: handleViewportWheel,
  } = useViewerViewport({ state, onStateChange, interactionRef });
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
    () => presentTipLevelRegionGeometry(
      tipLevelRegionGeometry,
      legend,
      activePileConfigurations.pileTipLevelMms,
    ),
    [tipLevelRegionGeometry, legend, activePileConfigurations.pileTipLevelMms],
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
  const {
    lasso,
    hoverCandidates,
    activeHoverCandidateKey,
    clearHoverCandidates,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleCptClick,
    handleLoadPointClick,
  } = useViewerPointerInteractions({
    state,
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
  });

  return (
    <div className="pile-plan-viewer" aria-label="Pile plan viewer">
      <div
        className="viewer-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={clearHoverCandidates}
        onWheel={(event) => handleViewportWheel(event, clearHoverCandidates)}
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
          <ViewerStage
            state={state}
            technicalAssignment={technicalAssignment}
            projectTransform={projectTransform}
            tipLevelRegionPresentation={tipLevelRegionPresentation}
            cptConnectionSegments={cptConnectionSegments}
            pileOptionsByLoadPointId={pileOptionsByLoadPointId}
            selectedLoadPointIds={selectedLoadPointIds}
            relatedLoadPointIds={relatedLoadPointIds}
            lockedLoadPointIds={lockedLoadPointIds}
            contextSelectedCptIds={contextSelectedCptIds}
            governingCptId={governingCptId}
            isEditingLoadPointLocks={isEditingLoadPointLocks}
            isEditingCptSelection={isEditingCptSelection}
            activeHoverCandidateKey={activeHoverCandidateKey}
            stageRef={stageRef}
            onCptClick={handleCptClick}
            onLoadPointClick={handleLoadPointClick}
          />
        </div>
        {hoverCandidates ? renderHoverInspector(hoverCandidates) : null}
        {lasso ? <div className="viewer-lasso" style={getLassoStyle(lasso)} /> : null}
      </div>
    </div>
  );

  function getOptimizerUnresolvedTitle(loadPointId: number): string {
    void loadPointId;
    return t("viewer.optimizerUnassigned");
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
    const symbolStyle = selectedOption
      ? getConfigurationActivationPresentation(
          selectedOption, legend, activePileConfigurations, state.pileCostSettings,
        )
      : null;
    const invalidVisual = getLoadPointMarkerInvalidVisual(
      selectedOption,
      state.viewerUtilizationSettings,
    );
    const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState({
      analysisStatus: technicalAssignment.status,
      technicalIssueStatus: technicalAssignment.issuesByLoadPointId.get(item.id)?.status,
      optimizationUnassignedReason: activePilePlan.optimizationUnassignedByLoadPoint.get(item.id),
    });
    const statusClass = unselectedState && usesNeutralUnassignedMarker(unselectedState)
      ? " is-pending"
      : unselectedState === "optimizer-unassigned"
        ? " has-optimizer-unassigned"
          : "";
    return (
      <span
        className={`viewer-hover-marker is-load-point${invalidVisual.className}${statusClass}`}
        style={getInvalidMarkerStyle(invalidVisual.style)}
      >
        {symbolStyle ? (
          <span
            className={`viewer-hover-pile-symbol${symbolStyle.smallDot ? " is-small-dot" : ""}`}
            dangerouslySetInnerHTML={{ __html: renderPileSymbol(symbolStyle.symbol, symbolStyle.color) }}
          />
        ) : unselectedState && usesNeutralUnassignedMarker(unselectedState) ? (
          <span className="load-point-unassigned" aria-hidden="true" />
        ) : unselectedState === "optimizer-unassigned" ? (
          <OptimizerUnresolvedMarker
            placement="inline"
            label={getOptimizerUnresolvedTitle(item.id)}
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

}

function stripMarkerNamePrefix(name: string): string {
  return name.replace(/^(?:load point|cpt)\s*/i, "").trim();
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

function getInvalidMarkerStyle(invalidStyle = ""): CSSProperties {
  const intensity = invalidStyle.match(/--utilization-intensity: ([0-9.]+)/)?.[1];
  return intensity ? { "--utilization-intensity": intensity } as CSSProperties : {};
}
