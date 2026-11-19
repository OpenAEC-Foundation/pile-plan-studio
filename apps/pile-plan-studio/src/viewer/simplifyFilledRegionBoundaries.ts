import type { RectangularTipLevelRegion } from "./rectangularTipLevelRegions.ts";

type Point = [number, number];
type Line = [Point, Point];

type Boundary = { line: Line; groups: number[]; fixed: boolean; shortOffsetsOnly?: boolean };
type Chain = { points: Point[]; boundary: Boundary };
type Segment = { chain: Chain; from: number; to: number; bend?: Point; transition?: [Point, Point] };

const TOLERANCE_MM = 1500;
const PILE_CLEARANCE_MM = 500;
const MIN_SHARED_SPAN_MM = 3000;
const MAX_SMALL_OFFSET_MM = 300;
const MAX_SHORTCUT_SPAN = 24;
// Cells clip against the same bisectors independently. Weld equivalent vertices for tracing.
const vertexKey = ([x, y]: Point) => [Math.round(x * 1000), Math.round(y * 1000)].join(",");
const edgeKey = ([a, b]: Line) => [vertexKey(a), vertexKey(b)].sort().join("/");
const vector = ([x1, y1]: Point, [x2, y2]: Point): Point => [x2 - x1, y2 - y1];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const side = (a: Point, b: Point, p: Point) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function polygonEdges(points: Point[]): Line[] {
  return points.map((point, i) => [point, points[(i + 1) % points.length]]);
}

export type SharedFilledBorder = Pick<Boundary, "line" | "groups" | "fixed" | "shortOffsetsOnly">;
export type SharedBorderConstraints = { sites: Point[]; faces: Point[][]; connections: Line[] };

/** Fit the long borders first, keeping the existing compact bays and all junctions in place. */
export function straightenSharedFilledBorders(
  areas: RectangularTipLevelRegion[],
  sharedBorders: SharedFilledBorder[],
  { sites, faces, connections }: SharedBorderConstraints,
  canMovePocket?: (points: Point[]) => boolean,
): RectangularTipLevelRegion[] {
  const vertices = new Map<string, Point>();
  const weld = (point: Point) => {
    const key = vertexKey(point);
    if (!vertices.has(key)) vertices.set(key, point);
    return vertices.get(key)!;
  };
  const boundaries: Boundary[] = sharedBorders.map(({ line: [a, b], groups, fixed, shortOffsetsOnly }) => ({
    line: [weld(a), weld(b)], groups, fixed, shortOffsetsOnly,
  }));
  const spanLength = (points: Point[]) => Math.hypot(...vector(points[0], points[points.length - 1]));
  const chains = traceChains(boundaries).filter(({ points, boundary }) =>
    !boundary.fixed && points.length >= 3 && spanLength(points) >= MIN_SHARED_SPAN_MM);
  if (chains.length === 0) return areas;
  chains.sort((a, b) => spanLength(b.points) - spanLength(a.points));
  const acrossMask = faces.length ? crossesFaceOutline(faces) : undefined;
  const changes = new Map<number, { removed: Set<string>; contours: Line[]; pockets: Point[][] }>();
  const replacements: Line[] = [];
  const originalBorders = boundaries.map(boundary => ({ line: boundary.line, key: edgeKey(boundary.line) }));
  for (const chain of chains) {
    const { points, boundary } = chain;
    for (let from = 0; from < points.length - 2;) {
      const choice = chooseShortcut(chain, from);
      if (!choice) {
        from++;
        continue;
      }
      const { to, bend, transition } = choice;
      const path = points.slice(from, to + 1);
      const removed = path.slice(1).map((point, i) => edgeKey([path[i], point]));
      const pocket = transition ? [path[1], path[2], transition[1], transition[0]] : bend ? [...path, bend] : path;
      const lines = segmentLines(choice);
      for (const group of boundary.groups) {
        let change = changes.get(group);
        if (!change) {
          change = { removed: new Set(), contours: [], pockets: [] };
          changes.set(group, change);
        }
        for (const key of removed) change.removed.add(key);
        change.contours.push(...lines);
        change.pockets.push(pocket);
      }
      replacements.push(...lines);
      from = to;
    }
  }
  return areas.map((area, index) => {
    const change = changes.get(index);
    if (!change) return area;
    return {
      ...area,
      fillRings: [...area.fillRings, ...change.pockets],
      contours: [...area.contours.filter(([a, b]) => !change.removed.has(edgeKey([a, b]))), ...change.contours],
    };
  });

  function chooseShortcut(chain: Chain, from: number): Segment | undefined {
    const { points } = chain;
    const shortOffsetsOnly = chain.boundary.shortOffsetsOnly;
    const last = Math.min(points.length - 1, from + (shortOffsetsOnly ? 3 : MAX_SHORTCUT_SPAN));
    for (let to = last; to >= from + 2; to--) {
      const direction = vector(points[from], points[to]);
      const lengthSquared = dot(direction, direction);
      if (lengthSquared < MIN_SHARED_SPAN_MM ** 2) continue;
      const span = { chain, from, to };
      const first = vector(points[from], points[from + 1]);
      const last = vector(points[to - 1], points[to]);
      const perpendicular = (a: Point, b: Point) => Math.abs(dot(a, b)) < 1e-6 * Math.hypot(...a) * Math.hypot(...b);
      if (to === from + 2 && (shortOffsetsOnly || perpendicular(first, last))) continue;
      if (to === from + 3 && dot(first, last) > 0 && perpendicular(first, vector(points[from + 1], points[to - 1]))
        && perpendicular(last, vector(points[from + 1], points[to - 1]))) {
        const offset = Math.hypot(...vector(points[from + 1], points[to - 1]));
        if (offset <= MAX_SMALL_OFFSET_MM && offset <= Math.sqrt(lengthSquared) / 10 && fits(span, true)) return span;
        if (shortOffsetsOnly) continue;
        // Keep the two existing directions. A substantial jog can be a
        // deliberately rectangular bay, so only soften a small shift.
        if (offset <= TOLERANCE_MM && offset * 2 <= Math.max(Math.hypot(...first), Math.hypot(...last))) {
          for (const width of [3, 2, 1]) {
            const fromLength = Math.min(width * offset, Math.hypot(...first) * .7);
            const toLength = Math.min(width * offset, Math.hypot(...last) * .7);
            if (fromLength + toLength < offset) continue;
            const a = points[from + 1], b = points[to - 1];
            const initial: Point = [a[0] - first[0] * fromLength / Math.hypot(...first), a[1] - first[1] * fromLength / Math.hypot(...first)];
            const finish: Point = [b[0] + last[0] * toLength / Math.hypot(...last), b[1] + last[1] * toLength / Math.hypot(...last)];
            const candidate: Segment = { ...span, transition: [initial, finish] };
            if (fits(candidate)) return candidate;
          }
        }
        continue;
      }
      if (shortOffsetsOnly) continue;
      if (fits(span)) return span;
      if (to < from + 3) continue;
      // Try an existing corner that maximizes clearance from the original chord,
      // followed by the midpoint. Both retain the two fixed joins to the plan.
      const interior = points.slice(from + 1, to);
      const distance = (point: Point) => Math.abs(side(points[from], points[to], point));
      const farthest = interior.reduce((a, b) => distance(a) > distance(b) ? a : b);
      for (const bend of new Set([farthest, interior[Math.floor(interior.length / 2)]])) {
        const projected = dot(vector(points[from], bend), direction);
        if (projected <= 0 || projected >= lengthSquared || distance(bend) < 100 * Math.sqrt(lengthSquared)) continue;
        const candidate = { ...span, bend };
        if (fits(candidate)) return candidate;
      }
    }
    return undefined;
  }

  function fits(segment: Segment, allowMargin = false): boolean {
    const { chain: { points }, from, to, bend, transition } = segment;
    const crossesOutline = acrossMask && (allowMargin ? (pocket: Point[]) => acrossMask(pocket, true) : acrossMask);
    if (!transition && !shortcutAllowed(segment.chain, from, to, sites, crossesOutline, bend)) return false;
    const path = points.slice(from, to + 1);
    const pocket = transition ? [path[1], path[2], transition[1], transition[0]] : bend ? [...path, bend] : path;
    if (canMovePocket && !canMovePocket(pocket)) return false;
    const swept = polygonEdges(pocket);
    const excluded = new Set(path.slice(1).map((point, i) => edgeKey([path[i], point])));
    const lines = segmentLines(segment);
    // Include the existing segments at either end of the replacement.
    // A shortcut may look straight in isolation and still turn back at a join.
    const reverses = (previous: Line, next: Line) => {
      const a = vector(...previous), b = vector(...next);
      return dot(a, b) < -.17 * Math.hypot(...a) * Math.hypot(...b);
    };
    if (lines.slice(1).some((line, i) => reverses(lines[i], line))
      || from > 0 && reverses([points[from - 1], points[from]], lines[0])
      || to + 1 < points.length && reverses(lines[lines.length - 1], [points[to], points[to + 1]])) return false;
    if (transition) {
      const original = path.slice(1).map((point, i): Line => [path[i], point]);
      if (acrossMask?.(pocket) || sites.some(point => {
        const distance = Math.min(...lines.map(line => squaredDistanceToLine(point, line)));
        const oldDistance = Math.min(...original.map(line => squaredDistanceToLine(point, line)));
        const minimum = oldDistance <= PILE_CLEARANCE_MM ** 2
          ? oldDistance : Math.max(PILE_CLEARANCE_MM ** 2, Math.min(750 ** 2, oldDistance * .75 ** 2));
        return distance + 1e-6 < minimum
          || inPolygon(point, swept);
      })) return false;
    }
    const [start, end] = toLine(segment);
    const crosses = (line: Line) => lines.some(current => intersects(current, line, true));
    if (connections.some(connection => lines.some(line => intersects(line, connection)))) return false;
    if (replacements.some(crosses)) return false;
    const movedBoundaryContains = (point: Point) => point !== start && point !== end && inPolygon(point, swept);
    return !originalBorders.some(({ line, key }) => !excluded.has(key)
      && (crosses(line) || line.some(movedBoundaryContains)));
  }
}

function traceChains(boundaries: Boundary[]): Chain[] {
  const incident = new Map<Point, Boundary[]>();
  for (const edge of boundaries) {
    for (const point of edge.line) {
      const neighbors = incident.get(point) ?? [];
      neighbors.push(edge);
      incident.set(point, neighbors);
    }
  }
  const visited = new Set<Boundary>();
  const chains: Chain[] = [];
  function continuation(at: Point, previous: Boundary): Boundary | undefined {
    const edges = incident.get(at)!;
    if (edges.length !== 2 || previous.fixed) return undefined;
    const next = edges[0] === previous ? edges[1] : edges[0];
    if (next.fixed || next.shortOffsetsOnly !== previous.shortOffsetsOnly
      || next.groups.some((group, i) => group !== previous.groups[i])) return undefined;
    return next;
  }
  function trace(boundary: Boundary, start: Point) {
    const points = [start];
    let current: Boundary | undefined = boundary;
    while (current && !visited.has(current)) {
      visited.add(current);
      const point: Point = current.line[0] === points[points.length - 1] ? current.line[1] : current.line[0];
      points.push(point);
      current = continuation(point, current);
    }
    if (points[0] === points[points.length - 1]) {
      const middle = Math.floor(points.length / 2);
      chains.push({ points: points.slice(0, middle + 1), boundary }, { points: points.slice(middle), boundary });
    } else {
      chains.push({ points, boundary });
    }
  }
  for (const boundary of boundaries) {
    const start = boundary.line.find(point => !continuation(point, boundary));
    if (start && !visited.has(boundary)) trace(boundary, start);
  }
  for (const boundary of boundaries) {
    if (!visited.has(boundary)) trace(boundary, boundary.line[0]);
  }
  return chains;
}

function shortcutAllowed(
  chain: Chain,
  from: number,
  to: number,
  sites: Point[],
  acrossMask?: (points: Point[]) => boolean,
  bend?: Point,
): boolean {
  const points = chain.points.slice(from, to + 1);
  const first = points[0], last = points[points.length - 1];
  const direction = vector(first, last);
  const lengthSquared = dot(direction, direction);
  if (lengthSquared === 0) return false;
  const bendAlong = bend ? dot(vector(first, bend), direction) : 0;
  const bendCross = bend ? side(first, last, bend) : 0;
  const maxCross = TOLERANCE_MM * Math.sqrt(lengthSquared);
  let minX = Math.min(first[0], last[0]), maxX = Math.max(first[0], last[0]);
  let minY = Math.min(first[1], last[1]), maxY = Math.max(first[1], last[1]);
  let previousAlong = 0, previousCross = 0;
  for (const point of points.slice(1)) {
    const offset = vector(first, point);
    const along = dot(offset, direction);
    const cross = side(first, last, point);
    // The paths are linear between chord projections. Their separation is
    // greatest at a source vertex or at the projected position of the bend.
    if (along < previousAlong || along > lengthSquared) return false;
    const replacementCross = !bend ? 0 : bendCross * (along < bendAlong
      ? along / bendAlong : (lengthSquared - along) / (lengthSquared - bendAlong));
    if (Math.abs(cross - replacementCross) > maxCross) return false;
    if (bend && previousAlong < bendAlong && bendAlong < along) {
      const fraction = (bendAlong - previousAlong) / (along - previousAlong);
      if (Math.abs(previousCross + fraction * (cross - previousCross) - bendCross) > maxCross) return false;
    }
    previousAlong = along;
    previousCross = cross;
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  if (bend) {
    minX = Math.min(minX, bend[0]);
    maxX = Math.max(maxX, bend[0]);
    minY = Math.min(minY, bend[1]);
    maxY = Math.max(maxY, bend[1]);
  }
  const pocket = bend ? [...points, bend] : points;
  if (acrossMask?.(pocket)) return false;
  const pocketEdges = polygonEdges(pocket);
  const original = points.slice(1).map((point, index): Line => [points[index], point]);
  const replacement = segmentLines({ chain, from, to, bend });
  return !sites.some(point => {
    if (point === first || point === last) return false;
    const margin = PILE_CLEARANCE_MM;
    const [x, y] = point;
    if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) return false;
    const distance = Math.min(...replacement.map(line => squaredDistanceToLine(point, line)));
    // Existing narrow gaps may remain. Moving a border may only improve them.
    if (distance < PILE_CLEARANCE_MM ** 2 && original.every(line => squaredDistanceToLine(point, line) > distance + 1e-6)) return true;
    return inPolygon(point, pocketEdges);
  });
}

function squaredDistanceToLine(point: Point, [a, b]: Line): number {
  const direction = vector(a, b);
  const offset = vector(a, point);
  const fraction = Math.min(1, Math.max(0, dot(offset, direction) / dot(direction, direction)));
  return (offset[0] - fraction * direction[0]) ** 2 + (offset[1] - fraction * direction[1]) ** 2;
}

const toLine = ({ chain, from, to }: Segment): Line => [chain.points[from], chain.points[to]];

function segmentLines(segment: Segment): Line[] {
  const [a, b] = toLine(segment);
  if (segment.transition) {
    const [start, end] = segment.transition;
    return [[a, start], [start, end], [end, b]];
  }
  return segment.bend ? [[a, segment.bend], [segment.bend, b]] : [[a, b]];
}

function inBox([x, y]: Point, [a, b]: Line): boolean {
  return x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0])
    && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1]);
}

function intersects(first: Line, second: Line, allowSharedEndpoints = false): boolean {
  const [a, b] = first, [c, d] = second;
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])
    || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  const ca = side(a, b, c), da = side(a, b, d), ac = side(c, d, a), bc = side(c, d, b);
  if (ca * da < 0 && ac * bc < 0) return true;
  const hits = (point: Point, orientation: number, line: Line) => orientation === 0 && inBox(point, line)
    && (!allowSharedEndpoints || !line.includes(point));
  return hits(c, ca, first) || hits(d, da, first) || hits(a, ac, second) || hits(b, bc, second)
    || (allowSharedEndpoints && (a === c && b === d || a === d && b === c));
}

function inPolygon(point: Point, edges: Line[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (const edge of edges) {
    const [a, b] = edge;
    if (side(a, b, point) === 0 && inBox(point, edge)) return true;
    if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

function crossesFaceOutline(faces: Point[][]): (points: Point[], allowMargin?: boolean) => boolean {
  const perFace = faces.map(polygonEdges);
  const outline = new Map<string, Line>();
  for (const line of perFace.flat()) {
    const key = edgeKey(line);
    if (outline.has(key)) outline.delete(key);
    else outline.set(key, line);
  }
  const rim = [...outline.values()];
  return (points, allowMargin = false) => {
    // Small offsets may lie in the display margin. The rim check still
    // preserves where the boundary crosses the Gabriel faces.
    if (!allowMargin && !perFace.some(edges => inPolygon(points[0], edges))) return true;
    const pocket = polygonEdges(points);
    return rim.some(edge => inPolygon(edge[0], pocket) || pocket.some(candidate => intersects(edge, candidate)));
  };
}
