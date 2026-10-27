import type { ProjectedPileCap } from "./pileCapProposalGeometry.ts";
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
  pileCapLayouts?: readonly ProjectedPileCap[];
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
  pileCapLayouts = [],
}: TipLevelRegionGeometryInput): TipLevelRegionGeometryLayer[] {
  const diameterPx = loadPointMarkerDiameter(symbolScalePercent) + REGION_MARGIN_PX;
  const radius = diameterPx / 2;

  return topology.groups.map((group) => {
    // Core eligibility and connections between locations remain authoritative.
    const memberIds = new Set(group.load_point_ids);
    const caps = pileCapLayouts.filter(cap => cap.points.length > 0
      && cap.preview.proposal.configuration?.pile_tip_level_mm === group.pile_tip_level_mm
      && cap.sourceIds.every(id => memberIds.has(id)));
    const replaced = new Set(caps.flatMap(cap => cap.sourceIds));
    const displayPoints = caps.length ? new Map(pointsByLoadPointId) : pointsByLoadPointId;
    for (const cap of caps) {
      for (const id of cap.sourceIds) {
        const source = pointsByLoadPointId.get(id);
        if (!source) continue;
        const nearest = cap.points.reduce((best, point) =>
          Math.hypot(point.x - source.x, point.y - source.y)
            < Math.hypot(best.x - source.x, best.y - source.y) ? point : best);
        displayPoints.set(id, nearest);
      }
    }
    const footprints = caps.map(cap => ({ id: cap.sourceIds[0], points: capFootprint(cap.points) }));
    return {
      pileTipLevelMKey: group.pile_tip_level_mm,
      legendValueM: group.legend_value_m,
      diameterPx,
      faces: group.faces.flatMap((face) => {
        const points = face.boundary_load_point_ids
          .map((loadPointId) => displayPoints.get(loadPointId));
        return points.every((point): point is ViewPoint => point !== undefined)
          ? [{ boundaryLoadPointIds: face.boundary_load_point_ids, points: caps.length ? clockwiseBoundary(points) : points }]
          : [];
      }).concat(footprints.filter(f => f.points.length >= 3).map(f => ({
        boundaryLoadPointIds: f.points.map(() => f.id), points: f.points,
      }))),
      circles: group.load_point_ids.flatMap((loadPointId) => {
        const point = replaced.has(loadPointId) ? undefined : displayPoints.get(loadPointId);
        return point ? [{ loadPointId, x: point.x, y: point.y, radius }] : [];
      }).concat(caps.flatMap(cap => cap.points.map(point => ({ loadPointId: cap.sourceIds[0], ...point, radius })))),
      segments: group.edges.flatMap((edge) => {
        const from = displayPoints.get(edge.from_load_point_id);
        const to = displayPoints.get(edge.to_load_point_id);
        return from && to ? [{
          fromLoadPointId: edge.from_load_point_id,
          toLoadPointId: edge.to_load_point_id,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }] : [];
      }).concat(footprints.flatMap(f => f.points.length < 2 ? [] : f.points
        .slice(0, f.points.length === 2 ? 1 : undefined).map((from, index) => {
          const to = f.points[(index + 1) % f.points.length];
          // A visual footprint of the core-owned cap pattern, not a new topology.
          return { fromLoadPointId: f.id, toLoadPointId: f.id,
            x1: from.x, y1: from.y, x2: to.x, y2: to.y };
        }))),
    };
  });
}

// This is only the footprint of one core-defined proposal, not the topology
// between source locations or the contour of an ordinary load-point group.
function capFootprint(points: readonly ViewPoint[]): ViewPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  if (sorted.length <= 2) return sorted;
  const half = (ordered: ViewPoint[]) => {
    const boundary: ViewPoint[] = [];
    for (const point of ordered) {
      while (boundary.length >= 2) {
        const a = boundary[boundary.length - 2], b = boundary[boundary.length - 1];
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        boundary.pop();
      }
      boundary.push(point);
    }
    return boundary.slice(0, -1);
  };
  return clockwiseBoundary([...half(sorted), ...half([...sorted].reverse())]);
}

function clockwiseBoundary(points: ViewPoint[]): ViewPoint[] {
  const area = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - a.y * b.x;
  }, 0);
  return area > 0 ? [...points].reverse() : points;
}
