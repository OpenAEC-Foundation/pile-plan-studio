export type MarkerScreenRect = {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

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

export function getFanOffsets(count: number, radius: number): Array<{ x: number; y: number }> {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function rectanglesOverlap(first: MarkerScreenRect, second: MarkerScreenRect): boolean {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}
