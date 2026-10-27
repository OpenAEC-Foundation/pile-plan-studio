import type { PileCapPreview } from "../core/pileCapProposalTypes.ts";
import { effectiveSymbolScale } from "./hoverCandidates.ts";
import {
  projectPointPixels,
  type ProjectViewTransform,
} from "./viewerGeometry.ts";

export type ProjectedPileCap = {
  preview: PileCapPreview;
  sourceIds: number[];
  points: { x: number; y: number }[];
  bounds: { x: number; y: number; width: number; height: number };
  crowded: boolean;
};
export function projectPileCapPreviews(
  previews: readonly PileCapPreview[],
  sources: readonly { id: number; x_mm: number; y_mm: number }[],
  transform: ProjectViewTransform,
  symbolScalePercent: number,
): ProjectedPileCap[] {
  const active = previews.filter(
    (p) => p.status === "active" || p.status === "missing_cpt_selection",
  );
  const allReplaced = new Set(active.flatMap((p) => p.proposal.load_point_ids));
  const ordinary = sources
    .filter((p) => !allReplaced.has(p.id))
    .map((p) => projectPointPixels(p, transform));
  const centers = active.map((p) => projectPointPixels(p.center, transform));
  const sourceById = new Map(sources.map(p => [p.id, p]));
  const symbol = effectiveSymbolScale(symbolScalePercent);
  const radius = 7 * symbol;
  const gap = 2 * symbol;
  return active.map((preview, index) => {
    const center = centers[index];
    const offsets = preview.positions.map((p) => {
      const point = projectPointPixels(p, transform);
      return { x: point.x - center.x, y: point.y - center.y };
    });
    const shortest = smallestPositiveDistance(offsets);
    const originalMembers = preview.proposal.load_point_ids.flatMap(id => {
      const source = sourceById.get(id);
      return source ? [projectPointPixels(source, transform)] : [];
    });
    const originalSpacing = smallestPositiveDistance(originalMembers);
    // Symbol size may make the pattern more compact, but never enlarge either
    // the core pattern or the original group's spacing.
    const preferred = Number.isFinite(shortest) && shortest > 0
      ? Math.min(1, 17 * symbol / shortest, originalSpacing / shortest)
      : 1;
    const extent = Math.max(...offsets.map((p) => Math.hypot(p.x, p.y)), 0);
    const preferredPadding = 10 * symbol;
    let available = Infinity;
    for (const other of ordinary) {
      available = Math.min(available,
        Math.hypot(other.x - center.x, other.y - center.y) - radius - gap);
    }
    for (let i = 0; i < centers.length; i++) {
      if (i === index) continue;
      // Each proposal owns at most half the space between their fixed centers.
      available = Math.min(available,
        (Math.hypot(centers[i].x - center.x, centers[i].y - center.y) - gap) / 2);
    }
    // Allow partial overlap, while keeping centers at least a third of a symbol
    // diameter apart. An already smaller original spacing is never increased.
    const minimum = Number.isFinite(shortest) && shortest > 0
      ? Math.min(preferred, 4 * symbol / shortest)
      : preferred;
    const factor = Math.max(minimum,
      Math.min(preferred, (available - preferredPadding) / (extent || 1)));
    const padding = preferredPadding;
    const points = offsets.map((p) => ({
      x: center.x + p.x * factor,
      y: center.y + p.y * factor,
    }));
    const x = Math.min(...points.map((p) => p.x)) - padding,
      y = Math.min(...points.map((p) => p.y)) - padding;
    return {
      preview,
      sourceIds: [...preview.proposal.load_point_ids],
      points,
      crowded: extent * factor + padding > available,
      bounds: {
        x,
        y,
        width: Math.max(...points.map((p) => p.x)) + padding - x,
        height: Math.max(...points.map((p) => p.y)) + padding - y,
      },
    };
  });
}

function smallestPositiveDistance(points: readonly { x: number; y: number }[]): number {
  let shortest = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < i; j++) {
      const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (distance > 0) shortest = Math.min(shortest, distance);
    }
  }
  return shortest;
}
