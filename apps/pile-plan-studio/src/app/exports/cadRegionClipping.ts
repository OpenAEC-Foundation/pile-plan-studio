import ClipperLib, { type IntPoint, type Path, type PolyNode } from "clipper-lib";
import type { ViewPoint } from "../../core/projectTypes.ts";
import type { ProjectedTipLevelRegionOutline } from "../../viewer/tipLevelRegionGeometry.ts";

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
const { Clipper, PolyTree, PolyType, ClipType, PolyFillType } = ClipperLib;
const COORDINATE_SCALE = 10;
// A 72-sided polygon stays within 1.5 mm of the viewer's 1500 mm-radius curve.
const HALF_CIRCLE_STEPS = 36;

export function createCadRegionClipper({ points, edges, faces, marginPx: margin }: ProjectedTipLevelRegionOutline) {
  const [origin] = points;
  const encode = ([x, y]: Point): IntPoint => ({
    X: Math.round((x - origin.x) * COORDINATE_SCALE),
    Y: Math.round((y - origin.y) * COORDINATE_SCALE),
  });
  const decode = ({ X, Y }: IntPoint): Point => [origin.x + X / COORDINATE_SCALE, origin.y + Y / COORDINATE_SCALE];
  const parts = faces.map(face => face.map(({ x, y }) => encode([x, y])));
  const covered = new Set<ViewPoint>();
  for (const [from, to] of edges) {
    if (from.x === to.x && from.y === to.y) continue;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    parts.push([...semicircle(from, angle + Math.PI / 2, margin), ...semicircle(to, angle - Math.PI / 2, margin)].map(encode));
    covered.add(from);
    covered.add(to);
  }
  for (const point of points) {
    if (!covered.has(point)) {
      const first = semicircle(point, 0, margin);
      const second = semicircle(point, Math.PI, margin);
      parts.push([...first.slice(0, -1), ...second.slice(0, -1)].map(encode));
    }
  }
  // The mask unions the viewer's faces and rounded strokes. Put all
  // primitives in the same winding direction so overlaps remain filled.
  const envelope = new Clipper();
  envelope.AddPaths(parts.map(path => Clipper.Orientation(path) ? path : path.reverse()), PolyType.ptSubject, true);
  const mask: Path[] = [];
  envelope.Execute(ClipType.ctUnion, mask, PolyFillType.pftNonZero, PolyFillType.pftNonZero);

  return (rings: Ring[]): Polygon[] => {
    if (rings.length === 0 || mask.length === 0) return [];
    const clipper = new Clipper();
    clipper.AddPaths(rings.map(ring => ring.map(encode)), PolyType.ptSubject, true);
    clipper.AddPaths(mask, PolyType.ptClip, true);
    const result = new PolyTree();
    // The existing viewer fills these rings with even/odd parity.
    clipper.Execute(ClipType.ctIntersection, result, PolyFillType.pftEvenOdd, PolyFillType.pftNonZero);

    const polygons: Polygon[] = [];
    const closedRing = (path: Path, outer: boolean): Ring => {
      const ordered = Clipper.Orientation(path) === outer ? path : [...path].reverse();
      const ring = ordered.map(decode);
      return [...ring, ring[0]];
    };
    const collect = (node: PolyNode) => {
      const holes = node.Childs();
      polygons.push([closedRing(node.Contour(), true), ...holes.map(hole => closedRing(hole.Contour(), false))]);
      for (const hole of holes) for (const island of hole.Childs()) collect(island);
    };
    for (const outer of result.Childs()) collect(outer);
    return polygons;
  };
}

function semicircle(center: ViewPoint, angle: number, radius: number): Ring {
  return Array.from({ length: HALF_CIRCLE_STEPS + 1 }, (_, i) => {
    const a = angle + i * Math.PI / HALF_CIRCLE_STEPS;
    return [center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)];
  });
}
