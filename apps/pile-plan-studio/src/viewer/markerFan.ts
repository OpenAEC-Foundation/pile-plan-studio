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

export function getMagnifiedMarkerSize(width: number, height: number): number {
  return Math.max(24, Math.max(width, height) * 1.3);
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

export function getCompactRingOffsets(
  markers: Array<MarkerScreenPoint & { radius: number }>,
  anchorKey: string,
  margin = 1.1,
): MarkerScreenPoint[] {
  if (markers.length === 0) {
    return [];
  }

  const anchor = markers.find((marker) => marker.key === anchorKey) ?? markers[0];
  const neighbours = markers
    .filter((marker) => marker.key !== anchor.key)
    .map((marker) => ({
      ...marker,
      angle: Math.atan2(marker.y - anchor.y, marker.x - anchor.x),
    }))
    .sort((first, second) => first.angle - second.angle || first.key.localeCompare(second.key));
  const offsets: MarkerScreenPoint[] = [{ key: anchor.key, x: 0, y: 0 }];
  const maximumMarkersPerRing = 8;
  let previousRingRadius = 0;
  let previousMarkerRadius = anchor.radius;

  for (let start = 0; start < neighbours.length; start += maximumMarkersPerRing) {
    const ring = neighbours.slice(start, start + maximumMarkersPerRing);
    const markerRadius = Math.max(...ring.map((marker) => marker.radius));
    const anchorClearance = (anchor.radius + markerRadius) * margin;
    const pairClearance = ring.length <= 1
      ? 0
      : (markerRadius * margin) / Math.sin(Math.PI / ring.length);
    const previousRingClearance = previousRingRadius === 0
      ? 0
      : previousRingRadius + (previousMarkerRadius + markerRadius) * margin;
    const ringRadius = Math.max(anchorClearance, pairClearance, previousRingClearance);
    const angleStep = (Math.PI * 2) / ring.length;
    const startAngle = ring[0].angle;

    ring.forEach((marker, index) => {
      const angle = startAngle + index * angleStep;
      offsets.push({
        key: marker.key,
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      });
    });
    previousRingRadius = ringRadius;
    previousMarkerRadius = markerRadius;
  }

  return markers.map((marker) => offsets.find((offset) => offset.key === marker.key)!);
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
