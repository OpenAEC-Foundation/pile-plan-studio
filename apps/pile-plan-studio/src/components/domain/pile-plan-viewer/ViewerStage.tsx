import type { CSSProperties, MouseEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import { getCptDisplayName } from "../../../domain/cptDisplayName.ts";
import { getConfigurationActivationPresentation } from "../../../domain/legendActivationPresentation.ts";
import { getPilePlanActivation } from "../../../domain/pilePlanActivation.ts";
import { getCptLabelStyle } from "../../../viewer/cptLabel.ts";
import type { getCptConnectionSegments } from "../../../viewer/cptConnectionLines.ts";
import { effectiveSymbolScale } from "../../../viewer/hoverCandidates.ts";
import {
  getLoadPointMarkerInvalidVisual,
  getUnselectedLoadPointMarkerState,
  usesNeutralUnassignedMarker,
} from "../../../viewer/loadPointMarker.ts";
import {
  getCptMarkerLayerClass,
  getForegroundLayerClass,
  getLoadPointMarkerLayerClass,
} from "../../../viewer/mapMarkerLayer.ts";
import { renderPileSymbol } from "../../../viewer/pileSymbols.ts";
import type { presentTipLevelRegionGeometry } from "../../../viewer/tipLevelRegionPresentation.ts";
import { projectPointPixels, type createProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { getViewportTransform } from "../../../viewer/viewport.ts";
import OptimizerUnresolvedMarker from "../../viewer/OptimizerUnresolvedMarker.tsx";
import TipLevelRegionOverlay from "./tip-level-regions/TipLevelRegionOverlay.tsx";
import type { TechnicalAssignmentSnapshot } from "../technicalAssignmentController.ts";
import type { getEffectivePileOptionsByLoadPointId } from "../cptSettingsModel.ts";
import { shouldRaiseCptMarker } from "../viewerInteractions.ts";
import { getSelectedPileOption } from "./viewerPresentation.ts";

type ViewerStageProps = {
  state: ProjectState;
  technicalAssignment: TechnicalAssignmentSnapshot;
  projectTransform: ReturnType<typeof createProjectViewTransform>;
  tipLevelRegionPresentation: ReturnType<typeof presentTipLevelRegionGeometry>;
  cptConnectionSegments: ReturnType<typeof getCptConnectionSegments>;
  pileOptionsByLoadPointId: ReturnType<typeof getEffectivePileOptionsByLoadPointId>;
  selectedLoadPointIds: ReadonlySet<number>;
  relatedLoadPointIds: ReadonlySet<number>;
  lockedLoadPointIds: ReadonlySet<number>;
  contextSelectedCptIds: ReadonlySet<number>;
  governingCptId: number | null;
  isEditingLoadPointLocks: boolean;
  isEditingCptSelection: boolean;
  activeHoverCandidateKey: string | null;
  stageRef: RefObject<HTMLDivElement | null>;
  onCptClick: (event: MouseEvent<HTMLButtonElement>, cptId: number) => void;
  onLoadPointClick: (event: MouseEvent<HTMLButtonElement>, loadPointId: number) => void;
};

export default function ViewerStage({
  state,
  technicalAssignment,
  projectTransform,
  tipLevelRegionPresentation,
  cptConnectionSegments,
  pileOptionsByLoadPointId,
  selectedLoadPointIds,
  relatedLoadPointIds,
  lockedLoadPointIds,
  contextSelectedCptIds,
  governingCptId,
  isEditingLoadPointLocks,
  isEditingCptSelection,
  activeHoverCandidateKey,
  stageRef,
  onCptClick,
  onLoadPointClick,
}: ViewerStageProps) {
  const { t } = useTranslation("common");
  const legend = state.pileLegend;
  const activePilePlan = state.pilePlans.find(
    (plan) => plan.id === state.activePilePlanId,
  ) ?? state.pilePlans[0];
  const activePileConfigurations = getPilePlanActivation(activePilePlan);

  return (
    <div
      className={`viewer-content${getForegroundLayerClass(state.foregroundLayer)}${isEditingLoadPointLocks ? " is-lock-editing" : ""}`}
      ref={stageRef}
      style={getStageStyle(
        state.viewport,
        state.symbolScalePercent,
        projectTransform.canvasSize,
      )}
    >
      <TipLevelRegionOverlay
        height={projectTransform.canvasSize.height}
        layers={tipLevelRegionPresentation}
        width={projectTransform.canvasSize.width}
      />
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
      {state.loadPoints.map((loadPoint) => {
        const isLocked = lockedLoadPointIds.has(loadPoint.id);
        const selectedOption = getSelectedPileOption(state, loadPoint.id, pileOptionsByLoadPointId);
        const invalidVisual = getLoadPointMarkerInvalidVisual(selectedOption, state.viewerUtilizationSettings);
        if (!invalidVisual.className) return null;
        const point = projectPointPixels(loadPoint, projectTransform);
        return (
          <span
            aria-hidden="true"
            className={`load-point-status-halo${invalidVisual.className}${isLocked ? " is-locked" : ""}`}
            key={`load-point-status-${loadPoint.id}`}
            style={getProjectMarkerStyle(point, invalidVisual.style)}
          />
        );
      })}
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
            onClick={(event) => onCptClick(event, cpt.id)}
          >
            <svg className="cpt-triangle" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
              <polygon points="3,3 21,3 12,19" />
              <text className="cpt-label" x="12" y="9.5" style={getCptLabelStyle(cptLabel) as CSSProperties}>
                {cptLabel}
              </text>
            </svg>
          </button>
        );
      })}
      {state.loadPoints.map((loadPoint) => {
        const point = projectPointPixels(loadPoint, projectTransform);
        const isSelected = selectedLoadPointIds.has(loadPoint.id);
        const isRelatedGroupMember = relatedLoadPointIds.has(loadPoint.id);
        const isLocked = lockedLoadPointIds.has(loadPoint.id);
        const selectedOption = getSelectedPileOption(state, loadPoint.id, pileOptionsByLoadPointId);
        const style = selectedOption
          ? getConfigurationActivationPresentation(
              selectedOption, legend, activePileConfigurations, state.pileCostSettings,
            )
          : null;
        const unselectedState = selectedOption ? null : getUnselectedLoadPointMarkerState({
          analysisStatus: technicalAssignment.status,
          technicalIssueStatus: technicalAssignment.issuesByLoadPointId.get(loadPoint.id)?.status,
          optimizationUnassignedReason: activePilePlan.optimizationUnassignedByLoadPoint.get(loadPoint.id),
        });
        const optimizerTitle = t("viewer.optimizerUnassigned");
        const unselectedTitle = unselectedState === "optimizer-unassigned"
          ? optimizerTitle
          : unselectedState ? t(`viewer.unselected.${unselectedState}`) : undefined;
        const unselectedClass = unselectedState && usesNeutralUnassignedMarker(unselectedState)
          ? " is-pending"
          : unselectedState === "optimizer-unassigned" ? " has-optimizer-unassigned" : "";

        return (
          <button
            aria-label={`Load point ${loadPoint.name}${unselectedTitle ? `. ${unselectedTitle}` : ""}`}
            className={`load-point-marker${getLoadPointMarkerLayerClass(isSelected || isRelatedGroupMember)}${isSelected ? " is-selected" : ""}${isRelatedGroupMember ? " is-related-group-member" : ""}${isLocked ? " is-locked" : ""}${unselectedClass}${activeHoverCandidateKey === `load-point:${loadPoint.id}` ? " is-hover-candidate" : ""}`}
            data-map-marker-key={`load-point:${loadPoint.id}`}
            key={loadPoint.id}
            style={getProjectMarkerStyle(point)}
            type="button"
            onClick={(event) => onLoadPointClick(event, loadPoint.id)}
          >
            {style ? (
              <span
                className={`load-point-symbol${style.smallDot ? " is-small-dot" : ""}`}
                dangerouslySetInnerHTML={{ __html: renderPileSymbol(style.symbol, style.color) }}
              />
            ) : unselectedState && usesNeutralUnassignedMarker(unselectedState) ? (
              <span className="load-point-unassigned" aria-hidden="true" />
            ) : unselectedState === "optimizer-unassigned" ? (
              <OptimizerUnresolvedMarker label={optimizerTitle} />
            ) : (
              <span className="load-point-empty" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path d="M6 6L18 18M18 6L6 18" /></svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function getProjectMarkerStyle(point: { x: number; y: number }, invalidStyle = ""): CSSProperties {
  return { left: `${point.x}px`, top: `${point.y}px`, ...getInvalidMarkerStyle(invalidStyle) };
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
