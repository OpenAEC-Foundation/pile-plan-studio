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

  const group = new Set([clickedKey]);
  const queue = [clickedMarker];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of markers) {
      if (!group.has(candidate.key) && rectanglesOverlap(current, candidate)) {
        group.add(candidate.key);
        queue.push(candidate);
      }
    }
  }

  return markers.filter((marker) => group.has(marker.key)).map((marker) => marker.key);
}

export function getMagnifiedMarkerOffsets(
  markers: MarkerScreenPoint[],
  minimumDistance: number,
  maximumScale = 6,
): MarkerScreenPoint[] {
  if (markers.length === 0) {
    return [];
  }

  const center = {
    x: markers.reduce((sum, marker) => sum + marker.x, 0) / markers.length,
    y: markers.reduce((sum, marker) => sum + marker.y, 0) / markers.length,
  };
  const positiveDistances = pairDistances(markers).filter((distance) => distance >= 0.5);
  const smallestDistance = positiveDistances.length > 0 ? Math.min(...positiveDistances) : minimumDistance;
  const scale = Math.min(maximumScale, Math.max(2, minimumDistance / smallestDistance));
  const offsets = markers.map((marker) => ({
    key: marker.key,
    x: (marker.x - center.x) * scale,
    y: (marker.y - center.y) * scale,
  }));

  const duplicateGroups = groupCoincidentMarkers(markers);
  for (const group of duplicateGroups.filter((items) => items.length > 1)) {
    const radius = minimumDistance / (2 * Math.sin(Math.PI / group.length));
    group.forEach((marker, index) => {
      const offset = offsets.find((candidate) => candidate.key === marker.key)!;
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / group.length;
      offset.x += Math.cos(angle) * radius;
      offset.y += Math.sin(angle) * radius;
    });
  }

  return offsets;
}

function pairDistances(markers: MarkerScreenPoint[]): number[] {
  const distances: number[] = [];
  for (let first = 0; first < markers.length; first += 1) {
    for (let second = first + 1; second < markers.length; second += 1) {
      distances.push(Math.hypot(
        markers[first].x - markers[second].x,
        markers[first].y - markers[second].y,
      ));
    }
  }
  return distances;
}

function groupCoincidentMarkers(markers: MarkerScreenPoint[]): MarkerScreenPoint[][] {
  const groups: MarkerScreenPoint[][] = [];
  for (const marker of markers) {
    const group = groups.find((items) => Math.hypot(
      items[0].x - marker.x,
      items[0].y - marker.y,
    ) < 0.5);
    if (group) {
      group.push(marker);
    } else {
      groups.push([marker]);
    }
  }
  return groups;
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
  ) < first.visualRadius + second.visualRadius;
}

function rectanglesOverlap(first: MarkerScreenRect, second: MarkerScreenRect): boolean {
  const broadPhaseOverlap = first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
  return broadPhaseOverlap && circlesOverlap(first, second);
}
