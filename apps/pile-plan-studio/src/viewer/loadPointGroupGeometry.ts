import type { LoadPointGroup } from "../core/loadPointGroupContract.ts";
import type { LoadPointTopology } from "../core/tipLevelRegionContract.ts";
import type { ViewPoint } from "../core/projectTypes.ts";
import { loadPointMarkerDiameter } from "./hoverCandidates.ts";

export type LoadPointGroupContourState = "default" | "selected" | "conflict";

export type LoadPointGroupCircle = {
  loadPointId: number;
  x: number;
  y: number;
  radius: number;
};

export type LoadPointGroupSegment = {
  fromLoadPointId: number;
  toLoadPointId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LoadPointGroupFace = {
  boundaryLoadPointIds: number[];
  points: ViewPoint[];
};

export type LoadPointGroupGeometry = {
  key: string;
  loadPointIds: number[];
  state: LoadPointGroupContourState;
  isSelectionContext: boolean;
  hasConflict: boolean;
  diameterPx: number;
  faces: LoadPointGroupFace[];
  circles: LoadPointGroupCircle[];
  segments: LoadPointGroupSegment[];
};

type Input = {
  groups: LoadPointGroup[];
  topology: LoadPointTopology;
  pointsByLoadPointId: Map<number, ViewPoint>;
  symbolScalePercent: number;
  selectedLoadPointIds: ReadonlySet<number>;
  conflictingLoadPointIds: ReadonlySet<number>;
  showDefaultGroups?: boolean;
};

const CONTOUR_MARGIN_PX = 4;

export function buildLoadPointGroupGeometry({
  groups,
  topology,
  pointsByLoadPointId,
  symbolScalePercent,
  selectedLoadPointIds,
  conflictingLoadPointIds,
  showDefaultGroups = true,
}: Input): LoadPointGroupGeometry[] {
  const diameterPx = loadPointMarkerDiameter(symbolScalePercent) + CONTOUR_MARGIN_PX;
  const radius = diameterPx / 2;

  return groups.flatMap((group) => {
    const loadPointIds = [...new Set(group.load_point_ids)].sort((left, right) => left - right);
    if (loadPointIds.length < 2) return [];
    const members = new Set(loadPointIds);
    const hasConflict = loadPointIds.some((id) => conflictingLoadPointIds.has(id));
    const selectedCount = loadPointIds.filter((id) => selectedLoadPointIds.has(id)).length;
    const isSelected = selectedCount === loadPointIds.length;
    const isSelectionContext = selectedCount > 0 && !isSelected;
    const state = isSelected ? "selected" : hasConflict ? "conflict" : "default";
    if (!showDefaultGroups && state === "default" && !isSelectionContext) return [];

    return [{
      key: `group:${loadPointIds.join("-")}`,
      loadPointIds,
      state,
      isSelectionContext,
      hasConflict,
      diameterPx,
      circles: loadPointIds.flatMap((loadPointId) => {
        const point = pointsByLoadPointId.get(loadPointId);
        return point ? [{ loadPointId, x: point.x, y: point.y, radius }] : [];
      }),
      segments: topology.edges.flatMap((edge) => {
        if (!members.has(edge.from_load_point_id) || !members.has(edge.to_load_point_id)) {
          return [];
        }
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
      faces: topology.faces.flatMap((face) => {
        if (!face.boundary_load_point_ids.every((id) => members.has(id))) return [];
        const points = face.boundary_load_point_ids.map((id) => pointsByLoadPointId.get(id));
        return points.every((point): point is ViewPoint => point !== undefined)
          ? [{ boundaryLoadPointIds: [...face.boundary_load_point_ids], points }]
          : [];
      }),
    }];
  });
}
