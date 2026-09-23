import type { ReactNode } from "react";
import type { CptConnectionSegment } from "../../../viewer/cptConnectionLines.ts";
import { projectCptConnectionSegmentsToPixels } from "../../../viewer/cptConnectionLines.ts";
import type { LoadPointGroupGeometry } from "../../../viewer/loadPointGroupGeometry.ts";
import type { PresentedTipLevelRegionLayer } from "../../../viewer/tipLevelRegionPresentation.ts";
import LoadPointGroupOverlay from "./load-point-groups/LoadPointGroupOverlay.tsx";
import TipLevelRegionOverlay from "./tip-level-regions/TipLevelRegionOverlay.tsx";

type Props = {
  width: number;
  height: number;
  tipLevelRegionPresentation: PresentedTipLevelRegionLayer[];
  loadPointGroupGeometry: LoadPointGroupGeometry[];
  cptConnectionSegments: CptConnectionSegment[];
  conflictLabel?: string;
  children?: ReactNode;
};

export default function ViewerDrawingSvg({
  width,
  height,
  tipLevelRegionPresentation,
  loadPointGroupGeometry,
  cptConnectionSegments,
  conflictLabel,
  children,
}: Props) {
  const hasConflict = loadPointGroupGeometry.some(({ state }) => state === "conflict");
  const visibleConflictLabel = hasConflict ? conflictLabel : undefined;
  const pixelSegments = projectCptConnectionSegmentsToPixels(cptConnectionSegments, { width, height });

  return (
    <svg
      aria-hidden={hasConflict ? undefined : true}
      aria-label={visibleConflictLabel}
      className="viewer-drawing-svg"
      focusable="false"
      role={hasConflict ? "img" : undefined}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      {visibleConflictLabel ? <title>{visibleConflictLabel}</title> : null}
      <TipLevelRegionOverlay layers={tipLevelRegionPresentation} />
      <LoadPointGroupOverlay geometry={loadPointGroupGeometry} />
      <g className="cpt-connection-lines">
        {pixelSegments.map((segment) => (
          <line
            className="cpt-connection-line"
            key={`${segment.from.id}-${segment.to.id}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
          />
        ))}
      </g>
      {children}
    </svg>
  );
}
