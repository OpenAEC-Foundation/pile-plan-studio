import type { CSSProperties, MouseEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TechnicalAssignmentSnapshot } from "../../../app/derived-state/technicalAssignmentController.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { getEffectivePileOptionsByLoadPointId } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import type { getCptConnectionSegments } from "../../../viewer/cptConnectionLines.ts";
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
  state: ProjectState;
  technicalAssignment: TechnicalAssignmentSnapshot;
  projectTransform: ReturnType<typeof createProjectViewTransform>;
  tipLevelRegionPresentation: ReturnType<typeof presentTipLevelRegionGeometry>;
  loadPointGroupGeometry: LoadPointGroupGeometry[];
  cptConnectionSegments: ReturnType<typeof getCptConnectionSegments>;
  pileOptionsByLoadPointId: ReturnType<typeof getEffectivePileOptionsByLoadPointId>;
  selectedLoadPointIds: ReadonlySet<number>;
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
  state,
  technicalAssignment,
  projectTransform,
  tipLevelRegionPresentation,
  loadPointGroupGeometry,
  cptConnectionSegments,
  pileOptionsByLoadPointId,
  selectedLoadPointIds,
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

  return (
    <div
      className={`viewer-content${getForegroundLayerClass(state.foregroundLayer)}${isEditingLoadPointLocks ? " is-lock-editing" : ""}`}
      ref={stageRef}
      style={getStageStyle(state.viewport, state.symbolScalePercent, projectTransform.canvasSize)}
    >
      <ViewerDrawingSvg
        height={projectTransform.canvasSize.height}
        tipLevelRegionPresentation={tipLevelRegionPresentation}
        loadPointGroupGeometry={loadPointGroupGeometry}
        cptConnectionSegments={cptConnectionSegments}
        conflictLabel={t("viewer.loadPointGroups.assignmentConflict")}
        width={projectTransform.canvasSize.width}
      >
        <ViewerMarkerGraphics graphics={markerPresentation.graphics} />
      </ViewerDrawingSvg>
      {markerPresentation.hitTargets.map((target) => (
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
