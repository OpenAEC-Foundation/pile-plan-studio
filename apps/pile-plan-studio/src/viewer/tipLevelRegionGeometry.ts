import type { TipLevelRegionTopology } from "../core/tipLevelRegionContract.ts";
import type { LoadPoint, ViewPoint } from "../core/projectTypes.ts";
import { loadPointMarkerDiameter } from "./hoverCandidates.ts";
import {
  projectPointPixels,
  type ProjectViewTransform,
} from "./viewerGeometry.ts";

export type TipLevelRegionCircle = {
  loadPointId: number;
  x: number;
  y: number;
  radius: number;
};

export type TipLevelRegionSegment = {
  fromLoadPointId: number;
  toLoadPointId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TipLevelRegionFace = {
  boundaryLoadPointIds: number[];
  points: ViewPoint[];
};

export type TipLevelRegionGeometryLayer = {
  pileTipLevelMKey: number;
  legendValueM: number;
  diameterPx: number;
  faces: TipLevelRegionFace[];
  circles: TipLevelRegionCircle[];
  segments: TipLevelRegionSegment[];
};

type TipLevelRegionGeometryInput = {
  topology: TipLevelRegionTopology;
  pointsByLoadPointId: Map<number, ViewPoint>;
  symbolScalePercent: number;
};

const REGION_MARGIN_PX = 6;

export function projectTipLevelRegionPoints(
  loadPoints: LoadPoint[],
  transform: ProjectViewTransform,
): Map<number, ViewPoint> {
  return new Map(loadPoints.map((loadPoint) => [
    loadPoint.id,
    projectPointPixels(loadPoint, transform),
  ]));
}

export function buildTipLevelRegionGeometry({
  topology,
  pointsByLoadPointId,
  symbolScalePercent,
}: TipLevelRegionGeometryInput): TipLevelRegionGeometryLayer[] {
  const diameterPx = loadPointMarkerDiameter(symbolScalePercent) + REGION_MARGIN_PX;
  const radius = diameterPx / 2;

  return topology.groups.map((group) => ({
    pileTipLevelMKey: group.pile_tip_level_mm,
    legendValueM: group.legend_value_m,
    diameterPx,
    faces: group.faces.flatMap((face) => {
      const points = face.boundary_load_point_ids
        .map((loadPointId) => pointsByLoadPointId.get(loadPointId));
      return points.every((point): point is ViewPoint => point !== undefined)
        ? [{ boundaryLoadPointIds: face.boundary_load_point_ids, points }]
        : [];
    }),
    circles: group.load_point_ids.flatMap((loadPointId) => {
      const point = pointsByLoadPointId.get(loadPointId);
      return point ? [{ loadPointId, x: point.x, y: point.y, radius }] : [];
    }),
    segments: group.edges.flatMap((edge) => {
      const from = pointsByLoadPointId.get(edge.from_load_point_id);
      const to = pointsByLoadPointId.get(edge.to_load_point_id);
      return from && to ? [{
        fromLoadPointId: edge.from_load_point_id,
        toLoadPointId: edge.to_load_point_id,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      }] : [];
    }),
  }));
}
