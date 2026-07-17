import type { Cpt, ProjectBounds, SelectedCpt, ViewPoint } from "../core/projectTypes.ts";
import { projectPoint } from "./viewerGeometry.ts";

type CptSelectionEditDraft = {
  loadPointIds: number[];
  cptIdsByLoadPoint: ReadonlyMap<number, ReadonlySet<number>>;
};

type CptConnectionLinesInput = {
  bounds: ProjectBounds;
  cpts: Cpt[];
  selectedLoadPointIds: number[];
  selectedCptsByLoadPointId: ReadonlyMap<number, SelectedCpt[]>;
  cptSelectionEditDraft: CptSelectionEditDraft | null;
};

export type CptConnectionPoint = ViewPoint & {
  id: number;
};

export type CptConnectionSegment = {
  from: CptConnectionPoint;
  to: CptConnectionPoint;
};

export function getCptConnectionSegments(input: CptConnectionLinesInput): CptConnectionSegment[] {
  const sharedCptIds = getSharedCptIds(input);
  if (!sharedCptIds || sharedCptIds.length < 2) {
    return [];
  }

  const cptsById = new Map(input.cpts.map((cpt) => [cpt.id, cpt]));
  const points = sharedCptIds.map((id) => {
    const cpt = cptsById.get(id);
    if (!cpt) {
      return null;
    }
    return { id, ...projectPoint(cpt, input.bounds) };
  });
  if (points.some((point) => point === null)) {
    return [];
  }

  const sortedPoints = sortRadially(points as CptConnectionPoint[]);
  if (sortedPoints.length === 2) {
    return [{ from: sortedPoints[0]!, to: sortedPoints[1]! }];
  }

  return sortedPoints.map((from, index) => ({
    from,
    to: sortedPoints[(index + 1) % sortedPoints.length]!,
  }));
}

function getSharedCptIds(input: CptConnectionLinesInput): number[] | null {
  const [firstLoadPointId, ...remainingLoadPointIds] = input.selectedLoadPointIds;
  if (firstLoadPointId === undefined) {
    return null;
  }

  const firstSet = getEffectiveCptIds(input, firstLoadPointId);
  for (const loadPointId of remainingLoadPointIds) {
    if (!areSetsEqual(firstSet, getEffectiveCptIds(input, loadPointId))) {
      return null;
    }
  }
  return [...firstSet];
}

function getEffectiveCptIds(input: CptConnectionLinesInput, loadPointId: number): Set<number> {
  if (input.cptSelectionEditDraft) {
    return new Set(input.cptSelectionEditDraft.cptIdsByLoadPoint.get(loadPointId));
  }
  return new Set(input.selectedCptsByLoadPointId.get(loadPointId)?.map((selection) => selection.cpt.id));
}

function areSetsEqual(left: Set<number>, right: Set<number>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function sortRadially(points: CptConnectionPoint[]): CptConnectionPoint[] {
  const centroid = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  centroid.x /= points.length;
  centroid.y /= points.length;

  return [...points].sort((left, right) => {
    const angleDifference = Math.atan2(left.y - centroid.y, left.x - centroid.x)
      - Math.atan2(right.y - centroid.y, right.x - centroid.x);
    return angleDifference || left.id - right.id;
  });
}
