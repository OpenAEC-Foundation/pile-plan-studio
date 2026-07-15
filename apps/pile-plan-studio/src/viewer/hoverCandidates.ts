import type { ViewPoint } from "../core/projectTypes.ts";
import { projectViewPointToScreen, type Viewport } from "./viewport.ts";

export type HoverMarker = {
  key: string;
  point: ViewPoint;
  visualRadius: number;
};

export type HoverCandidate = HoverMarker & {
  distance: number;
};

export type HoverCandidateState = {
  keys: string[];
  activeIndex: number;
};

export type HoverMarkerIndex = {
  cellSize: number;
  maxVisualRadius: number;
  cells: Map<string, HoverMarker[]>;
};

type CandidateQuery = {
  pointer: ViewPoint;
  canvas: { width: number; height: number };
  viewport: Viewport;
};

const MINIMUM_POINTER_RADIUS_PX = 9;
const DEFAULT_CELL_SIZE = 4;

export function createHoverMarkerIndex(
  markers: HoverMarker[],
  cellSize = DEFAULT_CELL_SIZE,
): HoverMarkerIndex {
  const cells = new Map<string, HoverMarker[]>();

  for (const marker of markers) {
    const cellKey = getCellKey(
      Math.floor(marker.point.x / cellSize),
      Math.floor(marker.point.y / cellSize),
    );
    const cell = cells.get(cellKey);
    if (cell) {
      cell.push(marker);
    } else {
      cells.set(cellKey, [marker]);
    }
  }

  return {
    cellSize,
    maxVisualRadius: markers.reduce(
      (maximum, marker) => Math.max(maximum, marker.visualRadius),
      0,
    ),
    cells,
  };
}

export function getHoverMarkerCandidatePool(
  index: HoverMarkerIndex,
  query: CandidateQuery,
): HoverMarker[] {
  if (query.canvas.width <= 0 || query.canvas.height <= 0 || query.viewport.scale <= 0) {
    return [];
  }

  const stagePointerX = (query.pointer.x - query.viewport.offsetX) / query.viewport.scale;
  const stagePointerY = (query.pointer.y - query.viewport.offsetY) / query.viewport.scale;
  const pointerX = stagePointerX / query.canvas.width * 100;
  const pointerY = stagePointerY / query.canvas.height * 100;
  const stageRadius = Math.max(
    MINIMUM_POINTER_RADIUS_PX / query.viewport.scale,
    index.maxVisualRadius,
  );
  const radiusX = stageRadius / query.canvas.width * 100;
  const radiusY = stageRadius / query.canvas.height * 100;
  const minimumCellX = Math.floor((pointerX - radiusX) / index.cellSize);
  const maximumCellX = Math.floor((pointerX + radiusX) / index.cellSize);
  const minimumCellY = Math.floor((pointerY - radiusY) / index.cellSize);
  const maximumCellY = Math.floor((pointerY + radiusY) / index.cellSize);
  const candidates: HoverMarker[] = [];

  for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      const cell = index.cells.get(getCellKey(cellX, cellY));
      if (cell) {
        candidates.push(...cell);
      }
    }
  }

  return candidates;
}

export function findHoverCandidates(
  source: HoverMarker[] | HoverMarkerIndex,
  query: CandidateQuery,
): HoverCandidate[] {
  const markers = Array.isArray(source)
    ? source
    : getHoverMarkerCandidatePool(source, query);

  return markers
    .map((marker) => {
      const screenPoint = projectViewPointToScreen(marker.point, query.canvas, query.viewport);
      return {
        ...marker,
        distance: Math.hypot(query.pointer.x - screenPoint.x, query.pointer.y - screenPoint.y),
      };
    })
    .filter((candidate) => (
      candidate.distance <= Math.max(MINIMUM_POINTER_RADIUS_PX, candidate.visualRadius * query.viewport.scale)
    ))
    .sort((first, second) => first.distance - second.distance || first.key.localeCompare(second.key));
}

export function updateHoverCandidateState(
  previous: HoverCandidateState | null,
  nextKeys: string[],
): HoverCandidateState | null {
  if (nextKeys.length === 0) {
    return null;
  }

  if (previous && haveSameKeys(previous.keys, nextKeys)) {
    return previous;
  }

  return { keys: nextKeys, activeIndex: 0 };
}

export function cycleHoverCandidate(state: HoverCandidateState): HoverCandidateState {
  if (state.keys.length <= 1) {
    return state;
  }

  return {
    ...state,
    activeIndex: (state.activeIndex + 1) % state.keys.length,
  };
}

export function getActiveHoverCandidateKey(state: HoverCandidateState | null): string | null {
  return state?.keys[state.activeIndex] ?? null;
}

export function resolveHoverClickCandidateKey(
  previous: HoverCandidateState | null,
  nextKeys: string[],
  fallbackKey: string,
): string {
  return getActiveHoverCandidateKey(updateHoverCandidateState(previous, nextKeys)) ?? fallbackKey;
}

function haveSameKeys(first: string[], second: string[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const secondKeys = new Set(second);
  return first.every((key) => secondKeys.has(key));
}

function getCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}
