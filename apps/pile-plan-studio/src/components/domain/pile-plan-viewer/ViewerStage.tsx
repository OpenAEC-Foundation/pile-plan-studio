import { buildPileCapMarkerGraphics } from "./pileCapMarkerPresentation.ts";
import { useMemo } from "react";
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
import { buildViewerMarkerPresentation } from "./viewerMarkerPresentation.ts";

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

export default function ViewerStage({
  pileCapPreviews=[],onPileCapClick,
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
  const markerPresentation = buildViewerMarkerPresentation({
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
  });

  const capLayouts=useMemo(()=>isEditingCptSelection||isEditingLoadPointLocks?[]:projectPileCapPreviews(pileCapPreviews,state.loadPoints,projectTransform,state.symbolScalePercent),[pileCapPreviews,state.loadPoints,projectTransform,state.symbolScalePercent,isEditingCptSelection,isEditingLoadPointLocks]);
  const replaced=new Set(capLayouts.flatMap(cap=>cap.sourceIds));
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
        loadPointGroupGeometry={loadPointGroupGeometry.filter(g=>!g.loadPointIds.some(id=>replaced.has(id)))}
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
        <button
          aria-label={target.ariaLabel}
          className={`${target.className} viewer-marker-hit-target`}
          data-map-marker-key={target.key}
          key={target.key}
          style={getProjectMarkerStyle(target)}
          type="button"
          onClick={(event) => target.kind === "cpt"
            ? onCptClick(event, target.id)
            : onLoadPointClick(event, target.id)}
        />
      ))}
      {capLayouts.flatMap(cap=>cap.points.map((point,index)=><button
        type="button" className="load-point-marker viewer-marker-hit-target" key={`cap-hit:${cap.sourceIds.join("-")}:${index}`}
        aria-label={t("viewer.pileCapProposal",{count:cap.points.length})} title={cap.crowded?t("viewer.pileCapCrowded"):undefined}
        style={getProjectMarkerStyle({...point,hitDiameter:14*effectiveSymbolScale(state.symbolScalePercent)})}
        onClick={event=>onPileCapClick?.(event,cap.sourceIds)}/>))}
    </div>
  );
}

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
