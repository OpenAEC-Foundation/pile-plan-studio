export type MarkerScreenRect = {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  visualRadius: number;
};

export type MarkerScreenPoint = {
  key: string;
  x: number;
  y: number;
};

export function getClosestVisibleMarkerKey(
  pointer: { x: number; y: number },
  fallbackKey: string,
  markers: MarkerScreenRect[],
): string {
  const visibleMarkers = markers
    .map((marker) => ({
      marker,
      distance: Math.hypot(
        pointer.x - (marker.left + marker.right) / 2,
        pointer.y - (marker.top + marker.bottom) / 2,
      ),
    }))
    .filter(({ marker, distance }) => distance <= marker.visualRadius)
    .sort((first, second) => first.distance - second.distance);

  return visibleMarkers[0]?.marker.key ?? fallbackKey;
}

export function getLoadPointVisualRadius(symbolSize: number): number {
  return Number((symbolSize * (9.7 / 24)).toFixed(2));
}

export function getOverlappingMarkerKeys(
  clickedKey: string,
  markers: MarkerScreenRect[],
): string[] {
  const clickedMarker = markers.find((marker) => marker.key === clickedKey);
  if (!clickedMarker) {
    return [];
  }

  return markers
    .filter((marker) => marker.key === clickedKey || rectanglesOverlap(clickedMarker, marker))
    .map((marker) => marker.key);
}

export function getSeparatedMarkerOffsets(
  markers: Array<MarkerScreenPoint & { radius: number }>,
  anchorKey: string,
  margin = 1.1,
): MarkerScreenPoint[] {
  if (markers.length === 0) {
    return [];
  }

  const anchor = markers.find((marker) => marker.key === anchorKey) ?? markers[0];
  const zeroDistanceKeys = markers
    .filter((marker) => marker.key !== anchor.key && Math.hypot(marker.x - anchor.x, marker.y - anchor.y) < 0.001)
    .map((marker) => marker.key)
    .sort();
  const neighbours = markers
    .filter((marker) => marker.key !== anchor.key)
    .map((marker) => {
      const dx = marker.x - anchor.x;
      const dy = marker.y - anchor.y;
      const sourceDistance = Math.hypot(dx, dy);
      const coincidentIndex = zeroDistanceKeys.indexOf(marker.key);
      const angle = sourceDistance >= 0.001
        ? Math.atan2(dy, dx)
        : -Math.PI / 2 + (coincidentIndex * Math.PI * 2) / zeroDistanceKeys.length;
      return {
        ...marker,
        sourceDistance,
        directionX: Math.cos(angle),
        directionY: Math.sin(angle),
      };
    })
    .sort((first, second) => first.sourceDistance - second.sourceDistance || first.key.localeCompare(second.key));
  const placed = [{ key: anchor.key, x: 0, y: 0, radius: anchor.radius }];

  for (const marker of neighbours) {
    let distance = Math.max(marker.sourceDistance, Math.max(anchor.radius, marker.radius) * margin);
    for (let iteration = 0; iteration <= placed.length; iteration += 1) {
      let nextDistance = distance;
      for (const other of placed) {
        const requiredDistance = Math.max(marker.radius, other.radius) * margin;
        const projection = marker.directionX * other.x + marker.directionY * other.y;
        const perpendicularSquared = Math.max(0, other.x ** 2 + other.y ** 2 - projection ** 2);
        if (perpendicularSquared >= requiredDistance ** 2) {
          continue;
        }
        const halfInterval = Math.sqrt(requiredDistance ** 2 - perpendicularSquared);
        const lower = projection - halfInterval;
        const upper = projection + halfInterval;
        if (distance > lower + 0.0001 && distance < upper - 0.0001) {
          nextDistance = Math.max(nextDistance, upper);
        }
      }
      if (nextDistance <= distance + 0.0001) {
        break;
      }
      distance = nextDistance;
    }
    placed.push({
      key: marker.key,
      x: marker.directionX * distance,
      y: marker.directionY * distance,
      radius: marker.radius,
    });
  }

  return markers.map((marker) => {
    const offset = placed.find((candidate) => candidate.key === marker.key)!;
    return { key: offset.key, x: offset.x, y: offset.y };
  });
}

function circlesOverlap(first: MarkerScreenRect, second: MarkerScreenRect): boolean {
  const firstCenter = {
    x: (first.left + first.right) / 2,
    y: (first.top + first.bottom) / 2,
  };
  const secondCenter = {
    x: (second.left + second.right) / 2,
    y: (second.top + second.bottom) / 2,
  };
  return Math.hypot(
    firstCenter.x - secondCenter.x,
    firstCenter.y - secondCenter.y,
  ) < Math.max(first.visualRadius, second.visualRadius);
}

function rectanglesOverlap(first: MarkerScreenRect, second: MarkerScreenRect): boolean {
  const broadPhaseOverlap = first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
  return broadPhaseOverlap && circlesOverlap(first, second);
}
