import { buildPileCapMarkerGraphics } from "./pileCapMarkerPresentation.ts";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import { projectPileCapPreviews } from "../../../viewer/pileCapProposalGeometry.ts";
import { sortMarkerGraphics } from "./viewerMarkerPresentation.ts";
import type { CSSProperties, MouseEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { getEffectivePileOptionsByLoadPointId } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import type { getCptConnectionSegments } from "../../../viewer/cptConnectionLines.ts";
import { getDashedOutlineDasharray } from "../../../viewer/markerGraphicGeometry.ts";
import { effectiveSymbolScale } from "../../../viewer/hoverCandidates.ts";
import type { LoadPointGroupGeometry } from "../../../viewer/loadPointGroupGeometry.ts";
import type { presentTipLevelRegionGeometry } from "../../../viewer/tipLevelRegionPresentation.ts";
import type { createProjectViewTransform } from "../../../viewer/viewerGeometry.ts";
import { getViewportTransform } from "../../../viewer/viewport.ts";
import { getForegroundLayerClass } from "../../../viewer/mapMarkerLayer.ts";
import ViewerDrawingSvg from "./ViewerDrawingSvg.tsx";
import ViewerMarkerGraphics from "./ViewerMarkerGraphics.tsx";
import { buildViewerMarkerPresentation, type ViewerMarkerHitTarget } from "./viewerMarkerPresentation.ts";

type ViewerStageProps = {
  pileCapPreviews?: PileCapPreview[];
  onPileCapClick?: (event:MouseEvent<HTMLButtonElement>,ids:number[])=>void;

  state: ProjectState;
  technicalAssignment: TechnicalAssignmentSnapshot;
  projectTransform: ReturnType<typeof createProjectViewTransform>;
  tipLevelRegionPresentation: ReturnType<typeof presentTipLevelRegionGeometry>;
  loadPointGroupGeometry: LoadPointGroupGeometry[];
  cptConnectionSegments: ReturnType<typeof getCptConnectionSegments>;
  pileOptionsByLoadPointId: ReturnType<typeof getEffectivePileOptionsByLoadPointId>;
  selectedLoadPointIds: ReadonlySet<number>;
  selectionContextLoadPointIds: ReadonlySet<number>;
  completeSelectedGroupLoadPointIds: ReadonlySet<number>;
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
const EMPTY_PREVIEWS: PileCapPreview[] = [];

export default function ViewerStage({
  pileCapPreviews=EMPTY_PREVIEWS,onPileCapClick,
  state,
  technicalAssignment,
  projectTransform,
  tipLevelRegionPresentation,
  loadPointGroupGeometry,
  cptConnectionSegments,
  pileOptionsByLoadPointId,
  selectedLoadPointIds,
  selectionContextLoadPointIds,
  completeSelectedGroupLoadPointIds,
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
  const handlers = useRef({onCptClick, onLoadPointClick});
  useLayoutEffect(() => {handlers.current = {onCptClick, onLoadPointClick};});
  const handleMarkerClick = useCallback((event:MouseEvent<HTMLButtonElement>,target:ViewerMarkerHitTarget) => {
    if(target.kind === "cpt") handlers.current.onCptClick(event,target.id);
    else handlers.current.onLoadPointClick(event,target.id);
  }, []);
  const markerPresentation = useMemo(() => buildViewerMarkerPresentation({
    state,
    technicalAssignment,
    projectTransform,
    pileOptionsByLoadPointId,
    selectedLoadPointIds,
    selectionContextLoadPointIds,
    completeSelectedGroupLoadPointIds,
    relatedLoadPointIds,
    lockedLoadPointIds,
    contextSelectedCptIds,
    governingCptId,
    isEditingLoadPointLocks,
    isEditingCptSelection,
    activeHoverCandidateKey,
    translate: t,
  }), [technicalAssignment, projectTransform, pileOptionsByLoadPointId, selectedLoadPointIds,
    selectionContextLoadPointIds, completeSelectedGroupLoadPointIds, relatedLoadPointIds,
    lockedLoadPointIds, contextSelectedCptIds, governingCptId, isEditingLoadPointLocks,
    isEditingCptSelection, activeHoverCandidateKey, t, state.cpts, state.loadPoints,
    state.symbolScalePercent, state.pilePlans, state.activePilePlanId, state.selectedCptId,
    state.foregroundLayer, state.selectedPileConfigurationsByLoadPoint, state.pileLegend,
    state.pileCostSettings, state.viewerUtilizationSettings, state.cptSelectionEditDraft,
    state.cptSelectionEditLoadPointId]);

  const capLayouts=useMemo(()=>isEditingCptSelection||isEditingLoadPointLocks?[]:projectPileCapPreviews(pileCapPreviews,state.loadPoints,projectTransform,state.symbolScalePercent),[pileCapPreviews,state.loadPoints,projectTransform,state.symbolScalePercent,isEditingCptSelection,isEditingLoadPointLocks]);
  const replaced=new Set(capLayouts.flatMap(cap=>cap.sourceIds));
  const visibleGroupGeometry = useMemo(() => {
    if(!capLayouts.length)return loadPointGroupGeometry;
    const hidden=new Set(capLayouts.flatMap(cap=>cap.sourceIds));
    return loadPointGroupGeometry.filter(g=>!g.loadPointIds.some(id=>hidden.has(id)));
  }, [capLayouts,loadPointGroupGeometry]);
  const visibleGraphics=markerPresentation.graphics.filter(g=>g.kind!=="load-point"||!replaced.has(g.id));
  const capGraphics=buildPileCapMarkerGraphics(capLayouts,state,selectedLoadPointIds);
  return (
    <div
      className={`viewer-content${getForegroundLayerClass(state.foregroundLayer)}${isEditingLoadPointLocks ? " is-lock-editing" : ""}`}
      ref={stageRef}
      style={getStageStyle(state.viewport, state.symbolScalePercent, projectTransform.canvasSize)}
    >
      <ViewerDrawingSvg
        height={projectTransform.canvasSize.height}
        tipLevelRegionPresentation={tipLevelRegionPresentation}
        loadPointGroupGeometry={visibleGroupGeometry}
        cptConnectionSegments={cptConnectionSegments}
        conflictLabel={t("viewer.loadPointGroups.assignmentConflict")}
        width={projectTransform.canvasSize.width}
      >
        <g className="pile-cap-proposal-contours">{capLayouts.map(cap=>{
          const selected=cap.sourceIds.every(id=>selectedLoadPointIds.has(id));
          const conflict=loadPointGroupGeometry.some(g=>g.hasConflict&&g.loadPointIds.some(id=>cap.sourceIds.includes(id)));
          return <rect key={cap.sourceIds.join(",")} x={cap.bounds.x} y={cap.bounds.y} width={cap.bounds.width} height={cap.bounds.height}
            rx={7*effectiveSymbolScale(state.symbolScalePercent)} fill="none" stroke={conflict?"#c62828":selected?"#d97706":"#747b82"} strokeWidth="1" strokeDasharray={getDashedOutlineDasharray(effectiveSymbolScale(state.symbolScalePercent), 3)}/>;
        })}</g>
        <ViewerMarkerGraphics graphics={sortMarkerGraphics([...visibleGraphics,...capGraphics])} />
      </ViewerDrawingSvg>
      {markerPresentation.hitTargets.filter(target=>target.kind!=="load-point"||!replaced.has(target.id)).map((target) => (
        <MarkerHitTarget key={target.key} target={target} onClick={handleMarkerClick}/>
      ))}
      {capLayouts.flatMap(cap=>cap.points.map((point,index)=><button
        type="button" className="load-point-marker viewer-marker-hit-target" key={`cap-hit:${cap.sourceIds.join("-")}:${index}`}
        aria-label={t("viewer.pileCapProposal",{count:cap.points.length})} title={cap.crowded?t("viewer.pileCapCrowded"):undefined}
        style={getProjectMarkerStyle({...point,hitDiameter:14*effectiveSymbolScale(state.symbolScalePercent)})}
        onClick={event=>onPileCapClick?.(event,cap.sourceIds)}/>))}
    </div>
  );
}

const MarkerHitTarget = memo(function MarkerHitTarget({target,onClick}:{
  target:ViewerMarkerHitTarget;
  onClick:(event:MouseEvent<HTMLButtonElement>,target:ViewerMarkerHitTarget)=>void;
}) {
  return <button aria-label={target.ariaLabel} className={`${target.className} viewer-marker-hit-target`}
    data-map-marker-key={target.key} style={getProjectMarkerStyle(target)} type="button"
    onClick={event=>onClick(event,target)}/>;
}, (a,b) => a.onClick===b.onClick && a.target.key===b.target.key && a.target.kind===b.target.kind
  && a.target.id===b.target.id && a.target.x===b.target.x && a.target.y===b.target.y
  && a.target.hitDiameter===b.target.hitDiameter && a.target.className===b.target.className
  && a.target.ariaLabel===b.target.ariaLabel);

function getProjectMarkerStyle(target: { x: number; y: number; hitDiameter: number }): CSSProperties {
  return {
    left: `${target.x}px`,
    top: `${target.y}px`,
    width: `${target.hitDiameter}px`,
    height: `${target.hitDiameter}px`,
  };
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
