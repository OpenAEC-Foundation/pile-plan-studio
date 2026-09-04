import type { TipLevelRegionTopology } from "../core/spatialTopologyContract.ts";
import type { LoadPoint, ViewPoint } from "../core/projectTypes.ts";
import { loadPointMarkerDiameter } from "./hoverCandidates.ts";
import {
  projectPointPixels,
  type ProjectViewTransform,
} from "./viewerGeometry.ts";

export type TipLevelRegionCircle = {
  siteId: number;
  x: number;
  y: number;
  radius: number;
};

export type TipLevelRegionSegment = {
  fromSiteId: number;
  toSiteId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TipLevelRegionFace = {
  boundarySiteIds: number[];
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
  pointsBySiteId: Map<number, ViewPoint>;
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
  pointsBySiteId,
  symbolScalePercent,
}: TipLevelRegionGeometryInput): TipLevelRegionGeometryLayer[] {
  const diameterPx = loadPointMarkerDiameter(symbolScalePercent) + REGION_MARGIN_PX;
  const radius = diameterPx / 2;

  return topology.groups.map((group) => ({
    pileTipLevelMKey: group.pile_tip_level_mm,
    legendValueM: group.legend_value_m,
    diameterPx,
    faces: group.faces.flatMap((face) => {
      const points = face.boundary_site_ids.map((siteId) => pointsBySiteId.get(siteId));
      return points.every((point): point is ViewPoint => point !== undefined)
        ? [{ boundarySiteIds: face.boundary_site_ids, points }]
        : [];
    }),
    circles: group.site_ids.flatMap((siteId) => {
      const point = pointsBySiteId.get(siteId);
      return point ? [{ siteId, x: point.x, y: point.y, radius }] : [];
    }),
    segments: group.edges.flatMap((edge) => {
      const from = pointsBySiteId.get(edge.from_site_id);
      const to = pointsBySiteId.get(edge.to_site_id);
      return from && to ? [{
        fromSiteId: edge.from_site_id,
        toSiteId: edge.to_site_id,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      }] : [];
    }),
  }));
}
