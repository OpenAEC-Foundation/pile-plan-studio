import { forEachTile, nearestCut } from "./compactRegionBlocks.ts";
import type { RectangularTipLevelRegion, RegionGrid, TileBounds } from "./rectangularTipLevelRegions.ts";

type Point = [number, number];
type Line = [Point, Point];
type Box = [number, number, number, number];
type Owner = { label: number; sites: Point[]; edges: Line[]; bounds: Box };
type LocalOwner = Owner & { support: Point[]; continues: boolean };
type Divider = { line: Point[]; sides: [Point[], Point[]]; signed: (point: Point) => number; score: number; creases?: [number, number][] };
type Bay = { label: number; box: Box; parent: number };
type Border = { line: Line; owners: [number, number] };
type Patch = { tiles: Box; major: [number, number]; divider: Divider; bays: Bay[]; seams: Border[] };

export const REPLACED_REGION_TILE = -2;
const EPSILON = 1e-5;
const MIN_CLEARANCE = 240;
const MIN_BAY_MARGIN = 160;
const PREFERRED_SITE_CLEARANCE = 750;
const CLOSED_STEP_CLEARANCE = 700;
const EMPTY = -1;

const corners = ([left, top, right, bottom]: Box): Point[] => [[left, top], [right, top], [right, bottom], [left, bottom]];
const area = ([left, top, right, bottom]: Box) => (right - left) * (bottom - top);
const pointAt = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inside = ([x, y]: Point, [left, top, right, bottom]: Box) => x >= left && x <= right && y >= top && y <= bottom;
const expanded = ([left, top, right, bottom]: Box, margin: number): Box =>
  [left - margin, top - margin, right + margin, bottom + margin];
const separated = (a: Box, b: Box, margin = 0) => a[2] + margin < b[0] || b[2] + margin < a[0]
  || a[3] + margin < b[1] || b[3] + margin < a[1];

function bounds(points: Point[]): Box {
  return points.reduce(([left, top, right, bottom], [x, y]) => [
    Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y),
  ], [Infinity, Infinity, -Infinity, -Infinity] as Box);
}

function clipLine([a, b]: Line, box: Box): Line | undefined {
  let start = 0, end = 1;
  for (const axis of [0, 1]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPSILON) {
      if (a[axis] < box[axis] || a[axis] > box[axis + 2]) return undefined;
      continue;
    }
    const first = (box[axis] - a[axis]) / delta, last = (box[axis + 2] - a[axis]) / delta;
    start = Math.max(start, Math.min(first, last));
    end = Math.min(end, Math.max(first, last));
    if (start > end + EPSILON) return undefined;
  }
  return [pointAt(a, b, start), pointAt(a, b, end)];
}

function clipHalf(polygon: Point[], signed: (point: Point) => number): Point[] {
  const result: Point[] = [];
  for (const [i, point] of polygon.entries()) {
    const next = polygon[(i + 1) % polygon.length];
    const a = signed(point), b = signed(next);
    if (a <= 0) result.push(point);
    if (a * b < 0) result.push(pointAt(point, next, a / (a - b)));
  }
  return result;
}

function polygonArea(polygon: Point[]): number {
  return Math.abs(polygon.reduce((sum, [x, y], i) => {
    const [nextX, nextY] = polygon[(i + 1) % polygon.length];
    return sum + x * nextY - y * nextX;
  }, 0)) / 2;
}

function splitAtCrease(points: Point[], edges: Line[], axis: number, at: number): Point[] {
  return points.concat(edges.flatMap(([a, b]) => {
    const first = a[axis] - at, last = b[axis] - at;
    return first * last < 0 ? [pointAt(a, b, first / (first - last))] : [];
  }));
}

function fitBays(
  box: Box, regions: LocalOwner[], divider: Divider, padding: number, major: [number, number], grid?: RegionGrid,
): Bay[] | undefined {
  const bays: Bay[] = [];
  for (const region of regions.slice(2)) {
    const isFirstSide = divider.signed(region.support[0]) < 0;
    let best: Box | undefined;
    for (const margin of [padding, padding * .7, padding * .45, MIN_BAY_MARGIN]) {
      const trial: Box = [Math.max(box[0], region.bounds[0] - margin), Math.max(box[1], region.bounds[1] - margin),
        Math.min(box[2], region.bounds[2] + margin), Math.min(box[3], region.bounds[3] + margin)];
      const clippedSides = trial.filter((edge, i) => edge === box[i]).length;
      if (clippedSides > Number(region.continues)) continue;
      if (grid && clippedSides === 1) {
        // An open bay must share exact raster vertices with the continuation.
        const along = 1 - trial.findIndex((edge, i) => edge === box[i]) % 2;
        const lines = (along === 0 ? grid.x : grid.y).lines;
        const first = nearestCut(lines, trial[along]), last = nearestCut(lines, trial[along + 2]);
        const lower = lines[lines[first] > trial[along] ? first - 1 : first];
        const upper = lines[lines[last] < trial[along + 2] ? last + 1 : last];
        if (lower <= box[along] || upper >= box[along + 2]) continue;
        trial[along] = lower;
        trial[along + 2] = upper;
      }
      if (area(trial) > area(box) * .28 || bays.some(bay => !separated(trial, bay.box, 35))) continue;
      const points = corners(trial);
      const support = points.concat(divider.creases?.flatMap(crease => splitAtCrease([], polygonEdges(points), ...crease)) ?? []);
      if (support.some(point => (isFirstSide ? -1 : 1) * divider.signed(point) < 60)) continue;
      if (regions.some(other => other !== region && (
        other.sites.some(point => inside(point, trial)) || other.edges.some(edge => clipLine(edge, trial))
      ))) continue;
      best = trial;
      break;
    }
    if (!best) return undefined;
    bays.push({ label: region.label, box: best, parent: major[isFirstSide ? 0 : 1] });
  }
  return bays;
}

function polygonEdges(points: Point[]): Line[] {
  return points.map((point, i) => [point, points[(i + 1) % points.length]]);
}

function squaredDistanceToLine([x, y]: Point, [[a, b], [u, v]]: Line): number {
  const dx = u - a, dy = v - b, lengthSquared = dx ** 2 + dy ** 2;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / lengthSquared)) : 0;
  return (x - a - t * dx) ** 2 + (y - b - t * dy) ** 2;
}

function previousClearance({ x, y }: RegionGrid, labels: Int32Array, point: Point): number {
  const [u, v] = point;
  const margin = PREFERRED_SITE_CLEARANCE;
  const width = x.centers.length;
  const left = Math.max(0, nearestCut(x.lines, u - margin) - 1);
  const right = Math.min(width - 1, nearestCut(x.lines, u + margin));
  const top = Math.max(0, nearestCut(y.lines, v - margin) - 1);
  const bottom = Math.min(y.centers.length - 1, nearestCut(y.lines, v + margin));
  let squared = margin ** 2;
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
    const index = row * width + col;
    if (col < right && labels[index] !== labels[index + 1]) {
      const edgeX = x.lines[col + 1];
      squared = Math.min(squared, squaredDistanceToLine(point, [[edgeX, y.lines[row]], [edgeX, y.lines[row + 1]]]));
    }
    if (row < bottom && labels[index] !== labels[index + width]) {
      const edgeY = y.lines[row + 1];
      squared = Math.min(squared, squaredDistanceToLine(point, [[x.lines[col], edgeY], [x.lines[col + 1], edgeY]]));
    }
  }
  return squared;
}

function keepsSiteClearance(
  grid: RegionGrid, labels: Int32Array, sites: Point[], knownClearance: Map<Point, number>, borders: Line[],
  clearanceLimit = PREFERRED_SITE_CLEARANCE,
): boolean {
  const limitSquared = clearanceLimit ** 2;
  const edges = borders.map(line => ({ line, box: expanded(bounds(line), clearanceLimit) }));
  for (const site of sites) {
    for (const { line, box } of edges) {
      if (!inside(site, box)) continue;
      const movedDistance = squaredDistanceToLine(site, line);
      if (movedDistance >= limitSquared) continue;
      let originalDistance = knownClearance.get(site);
      if (originalDistance === undefined) {
        originalDistance = previousClearance(grid, labels, site);
        knownClearance.set(site, originalDistance);
      }
      if (movedDistance + EPSILON < Math.min(originalDistance, limitSquared)) return false;
    }
  }
  return true;
}

function bayBorders(bay: Bay, box: Box): Line[] {
  return polygonEdges(corners(bay.box)).filter(edge =>
    !box.some((wall, index) => edge.every(point => point[index % 2] === wall)));
}

function boundaryJoins({ x, y, mask }: RegionGrid, labels: Int32Array, tiles: Box, major: [number, number]): Point[] {
  const [left, top, right, bottom] = tiles;
  const width = x.centers.length;
  const result: Point[] = [];
  function scan(first: number, last: number, outsideCell: (i: number) => number, point: (i: number) => Point) {
    for (let i = first + 1; i < last; i++) {
      const before = outsideCell(i - 1), after = outsideCell(i);
      if (mask[before] && mask[after] && labels[before] !== labels[after]
        && major.includes(labels[before]) && major.includes(labels[after])) result.push(point(i));
    }
  }
  scan(left, right, i => (top - 1) * width + i, i => [x.lines[i], y.lines[top]]);
  scan(left, right, i => bottom * width + i, i => [x.lines[i], y.lines[bottom]]);
  scan(top, bottom, i => i * width + left - 1, i => [x.lines[left], y.lines[i]]);
  scan(top, bottom, i => i * width + right, i => [x.lines[right], y.lines[i]]);
  return result;
}

function dividerLines(box: Box, [a, b]: LocalOwner[], spacing: number): Point[][] {
  const result: Point[][] = [];
  const frame = corners(box);
  const reach = Math.max(spacing * 2, Math.min(box[2] - box[0], box[3] - box[1]) * .29);

  function add(line: Point[], sides: [Point[], Point[]]) {
    if (Math.min(...sides.map(polygonArea)) < area(box) * .13) return;
    const length = line.slice(1).reduce((total, point, i) => total + distance(line[i], point), 0);
    if (length < Math.min(box[2] - box[0], box[3] - box[1]) * .78) return;
    const midpoint = (fraction: number): Point => {
      if (line.length === 2) return pointAt(line[0], line[1], fraction);
      const firstLength = distance(line[0], line[1]);
      return fraction * length < firstLength
        ? pointAt(line[0], line[1], fraction * length / firstLength)
        : pointAt(line[1], line[2], (fraction * length - firstLength) / (length - firstLength));
    };
    const supported = [.13, .37, .63, .87].filter(fraction => {
      const point = midpoint(fraction);
      return [a, b].every(region => region.sites.some(site => distance(site, point) <= reach));
    });
    if (supported.length < 3) return;
    result.push(line);
  }

  // Search an open strip between the two largest components. Locations and
  // the ends of Gabriel edges are the constraints, independent of the old cuts.
  for (let degrees = 0; degrees < 180; degrees += 2.5) {
    const angle = degrees * Math.PI / 180;
    const normal: Point = [Math.cos(angle), Math.sin(angle)];
    const projection = ([x, y]: Point) => x * normal[0] + y * normal[1];
    const aProjections = a.support.map(projection), bProjections = b.support.map(projection);
    const flip = Math.max(...aProjections) > Math.min(...bProjections);
    const lower = Math.max(...(flip ? bProjections : aProjections));
    const upper = Math.min(...(flip ? aProjections : bProjections));
    if (upper - lower < 2 * MIN_CLEARANCE) continue;
    for (const fraction of [.35, .50, .65]) {
      const cut = lower + (upper - lower) * fraction;
      const clearance = Math.min(cut - lower, upper - cut);
      if (clearance < MIN_CLEARANCE) continue;
      const signed = (point: Point) => (projection(point) - cut) * (flip ? -1 : 1);
      const first = clipHalf(frame, signed);
      const line = first.filter(point => Math.abs(signed(point)) < EPSILON);
      if (line.length === 2) add(line, [first, clipHalf(frame, point => -signed(point))]);
    }
  }

  // A monotone two-part cut uses the same tests, including at the bend of
  // each Gabriel edge. It can follow a row and then angle around another row.
  const slopes = [-1, -.55, 0, .55, 1];
  for (const along of [0, 1]) {
    const across = 1 - along;
    const start = box[along], end = box[along + 2];
    const low = box[across], high = box[across + 2];
    const at = (u: number, v: number): Point => along === 0 ? [u, v] : [v, u];
    for (const fraction of [.4, .6]) {
      const knee = start + (end - start) * fraction;
      const aPoints = splitAtCrease(a.support, a.edges, along, knee);
      const bPoints = splitAtCrease(b.support, b.edges, along, knee);
      for (const before of slopes) for (const after of slopes) {
        if (Math.abs(before - after) < .5 || Math.abs(Math.atan(before) - Math.atan(after)) > 1.1) continue;
        const shift = (u: number) => (u - knee) * (u < knee ? before : after);
        const projection = (p: Point) => p[across] - shift(p[along]);
        const aProjections = aPoints.map(projection), bProjections = bPoints.map(projection);
        const flip = Math.max(...aProjections) > Math.min(...bProjections);
        const lower = Math.max(...(flip ? bProjections : aProjections));
        const upper = Math.min(...(flip ? aProjections : bProjections));
        const normal = Math.max(Math.hypot(1, before), Math.hypot(1, after));
        const clearance = (upper - lower) / (2 * normal);
        if (clearance < MIN_CLEARANCE) continue;
        const cut = (lower + upper) / 2;
        const acrossAt = [cut + shift(start), cut, cut + shift(end)];
        if (acrossAt.some(value => value <= low + 80 || value >= high - 80)) continue;
        const line = [at(start, acrossAt[0]), at(knee, acrossAt[1]), at(end, acrossAt[2])];
        const lowerPolygon = [at(start, low), at(end, low), ...line.slice().reverse()];
        const upperPolygon = [...line, at(end, high), at(start, high)];
        add(line, [lowerPolygon, upperPolygon]);
      }
    }
  }
  return result;
}

function collectOwners(owners: Owner[], box: Box): LocalOwner[] {
  return owners.flatMap(owner => {
    if (separated(owner.bounds, box)) return [];
    const sites = owner.sites.filter(site => inside(site, box));
    const edges = owner.edges.flatMap(edge => {
      const intersection = clipLine(edge, box);
      return intersection ? [intersection] : [];
    });
    const support = [...sites, ...edges.flat()];
    return support.length ? [{ label: owner.label, sites, edges, support,
      bounds: bounds(support), continues: sites.length !== owner.sites.length }] : [];
  }).sort((a, b) => b.sites.length - a.sites.length || area(b.bounds) - area(a.bounds) || a.label - b.label);
}

function oldBorderPieces(grid: RegionGrid, labels: Int32Array, tiles: Box, major: [number, number]) {
  const width = grid.x.centers.length;
  const [left, top, right, bottom] = tiles;
  function count(start: number, end: number, from: number, to: number, lines: number[], keyAt: (i: number, j: number) => [number, number]) {
    let pieces = 0, main = 0, mainLength = 0;
    for (let i = start; i < end; i++) {
      let last: [number, number] | undefined;
      for (let j = from; j < to; j++) {
        const [a, b] = keyAt(i, j);
        if (a === b) { last = undefined; continue; }
        const primary = a === major[0] && b === major[1] || a === major[1] && b === major[0];
        if (primary) mainLength += lines[j + 1] - lines[j];
        if (last?.[0] === a && last[1] === b) continue;
        last = [a, b];
        pieces++;
        if (primary) main++;
      }
    }
    return { pieces, main, mainLength };
  }
  const vertical = count(left + 1, right, top, bottom, grid.y.lines, (i, j) => [labels[j * width + i - 1], labels[j * width + i]]);
  const horizontal = count(top + 1, bottom, left, right, grid.x.lines, (j, i) => [labels[(j - 1) * width + i], labels[j * width + i]]);
  return {
    main: vertical.main + horizontal.main, pieces: vertical.pieces + horizontal.pieces,
    transverseLength: Math.min(vertical.mainLength, horizontal.mainLength),
  };
}

function connectToRemainder(
  grid: RegionGrid, labels: Int32Array, tiles: Box, owners: LocalOwner[], divider: Divider, bays: Bay[], major: [number, number],
): { borders: Border[]; extraLength: number; newPieces: number } | undefined {
  const width = grid.x.centers.length;
  const [left, top, right, bottom] = tiles;
  const borders: Border[] = [];
  const added = new Set<Border>();
  const connected = new Set<number>();
  const runs: { label: number; length: number; overlap: number }[] = [];
  let extraLength = 0;
  let addedMainBorder = false;
  const seams = [...divider.line, ...bays.flatMap(bay => corners(bay.box))];
  function scan(along: number, start: number, end: number, across: number, offset: -1 | 1) {
    const axis = along === 0 ? grid.x.lines : grid.y.lines;
    const wall = (along === 0 ? grid.y.lines : grid.x.lines)[across];
    const crossings = seams.filter(point => Math.abs(point[1 - along] - wall) < EPSILON).map(point => point[along]);
    const makePoint = (value: number): Point => along === 0 ? [value, wall] : [wall, value];
    const cell = (a: number, b: number) => along === 0 ? b * width + a : a * width + b;
    let run: (typeof runs)[number] | undefined;
    let pending: Border | undefined;
    for (let i = start; i < end; i++) {
      const outsideCell = cell(i, across + (offset < 0 ? -1 : 0));
      const outside = grid.mask[outsideCell] ? labels[outsideCell] : EMPTY;
      const before = labels[cell(i, across + (offset < 0 ? 0 : -1))];
      const stops = [axis[i], ...crossings.filter(x => axis[i] + EPSILON < x && x < axis[i + 1] - EPSILON).sort((a, b) => a - b), axis[i + 1]];
      if (outside >= 0 && outside === before) {
        if (run?.label !== outside) {
          run = { label: outside, length: 0, overlap: 0 };
          runs.push(run);
        }
      } else {
        run = undefined;
      }
      for (let j = 1; j < stops.length; j++) {
        const length = stops[j] - stops[j - 1];
        if (length < EPSILON) continue;
        const middle = makePoint((stops[j - 1] + stops[j]) / 2);
        const after = bays.find(bay => inside(middle, bay.box))?.label ?? major[divider.signed(middle) < 0 ? 0 : 1];
        if (run) {
          run.length += length;
          if (after === outside) run.overlap += length;
        }
        if (outside === after) {
          connected.add(after);
          pending = undefined;
        } else {
          if (before === outside) {
            extraLength += length;
            if (major.includes(outside) && major.includes(after)) addedMainBorder = true;
          }
          if (pending?.owners[0] === outside && pending.owners[1] === after) pending.line[1] = makePoint(stops[j]);
          else {
            pending = { owners: [outside, after], line: [makePoint(stops[j - 1]), makePoint(stops[j])] };
            borders.push(pending);
          }
          if (before === outside) added.add(pending);
        }
      }
    }
  }
  scan(0, left, right, top, -1);
  scan(0, left, right, bottom, 1);
  scan(1, top, bottom, left, -1);
  scan(1, top, bottom, right, 1);
  if (addedMainBorder) return undefined;
  if (owners.some(owner => owner.continues && !connected.has(owner.label))) return undefined;
  const counts = new Map<number, number>();
  for (const run of runs) counts.set(run.label, (counts.get(run.label) ?? 0) + 1);
  const local = new Set(owners.map(owner => owner.label));
  // Retain every continuous entry to an area. A single empty extension
  // with no sites or connections in the patch may be absorbed.
  if (runs.some(run => run.overlap < Math.min(250, run.length * .15)
    && (local.has(run.label) || counts.get(run.label)! > 1))) return undefined;
  return { borders, extraLength, newPieces: added.size };
}

function dividerSearch(grid: RegionGrid, groups: number[], components: ReadonlyMap<number, number>) {
  const { x, y, sites, loadPointEdges, mask } = grid;
  const width = x.centers.length;
  const owners = new Map<number, Owner>();
  for (const [id, site] of sites) {
    const label = components.get(id)!;
    if (!owners.has(label)) owners.set(label, { label, sites: [], edges: [], bounds: [0, 0, 0, 0] });
    owners.get(label)!.sites.push(site.point);
  }
  for (const owner of owners.values()) owner.bounds = bounds(owner.sites);
  const frontiers: Line[] = [];
  for (const { from_load_point_id: from, to_load_point_id: to } of loadPointEdges) {
    const a = sites.get(from), b = sites.get(to);
    if (!a || !b) continue;
    const first = owners.get(components.get(from)!)!, second = owners.get(components.get(to)!)!;
    if (first === second) first.edges.push([a.point, b.point]);
    else if (first.sites.length >= 3 && second.sites.length >= 3 && groups[first.label] >= 0 && groups[second.label] >= 0
      && groups[first.label] !== groups[second.label]) frontiers.push([a.point, b.point]);
  }
  const distances = frontiers.map(edge => distance(...edge)).filter(length => length > 550).sort((a, b) => a - b);
  const spacing = distances[Math.floor(distances.length / 2)] ?? 2700;
  const frames = new Map<string, { tiles: Box; box: Box; votes: number }>();
  const [minX, minY] = bounds([...sites.values()].map(site => site.point));
  // Sample only near interfaces that already have support from both sides.
  for (const factor of [3.9, 4.75, 5.4, 6.6]) {
    const size = Math.max(8500, Math.min(26500, spacing * factor));
    const stride = size * .3;
    for (const edge of frontiers) {
      const center = pointAt(...edge, .5);
      const centerX = minX + stride * Math.round((center[0] - minX) / stride);
      const centerY = minY + stride * Math.round((center[1] - minY) / stride);
      const offsets = [[0, 0], [.45, .45], [-.45, -.45], [.45, -.45], [-.45, .45]];
      for (const offset of offsets) {
        const cx = centerX + offset[0] * stride, cy = centerY + offset[1] * stride;
        const tiles: Box = [nearestCut(x.lines, cx - size / 2), nearestCut(y.lines, cy - size / 2),
          nearestCut(x.lines, cx + size / 2), nearestCut(y.lines, cy + size / 2)];
        const key = tiles.join("/");
        const found = frames.get(key);
        if (found) { found.votes++; continue; }
        const [left, top, right, bottom] = tiles;
        if (left === 0 || top === 0 || right >= x.centers.length || bottom >= y.centers.length) continue;
        if (right - left < 5 || bottom - top < 5
          || ![left, Math.floor((left + right) / 2), right - 1].every(i =>
            [top, Math.floor((top + bottom) / 2), bottom - 1].every(j => mask[j * width + i]))) continue;
        frames.set(key, { tiles, votes: 1, box: [x.lines[left], y.lines[top], x.lines[right], y.lines[bottom]] });
      }
    }
  }
  return { all: [...owners.values()], spacing, frames: [...frames.values()].sort((a, b) => b.votes - a.votes) };
}

function slopedTransitions(grid: RegionGrid, box: Box, [a, b]: LocalOwner[], spacing: number): Point[][] {
  const trials: Point[][] = [];
  for (const along of [0, 1]) {
    const across = 1 - along;
    const low = box[along], high = box[along + 2], span = high - low;
    const lines = (across === 0 ? grid.x : grid.y).lines;
    const rails = (start: boolean) => {
      const inEnd = (point: Point) => start ? point[along] < low + span * .36 : point[along] > high - span * .36;
      const first = a.support.filter(inEnd).map(point => point[across]);
      const second = b.support.filter(inEnd).map(point => point[across]);
      if (!first.length || !second.length) return [];
      const [lower, upper] = Math.max(...first) < Math.min(...second)
        ? [Math.max(...first), Math.min(...second)] : [Math.max(...second), Math.min(...first)];
      if (upper - lower < 2 * MIN_CLEARANCE) return [];
      return [...new Set([.4, .6].map(fraction => lines[nearestCut(lines, lower + (upper - lower) * fraction)]))];
    };
    const ends = rails(false);
    const at = (u: number, v: number): Point => along === 0 ? [u, v] : [v, u];
    for (const start of rails(true)) for (const end of ends) {
      const offset = Math.abs(end - start);
      if (offset < 180 || offset > Math.min(spacing, span * .23)) continue;
      for (const from of [.2, .34, .46]) for (const to of [.54, .66, .8]) {
        if (span * (to - from) < 2 * offset) continue;
        trials.push([at(low, start), at(low + from * span, start), at(low + to * span, end), at(high, end)]);
      }
    }
  }
  return trials;
}

function fitAnchoredDivider(grid: RegionGrid, box: Box, line: Point[], [a, b]: LocalOwner[]): Divider | undefined {
  const snap = ([x, y]: Point): Point => Math.abs(x - box[0]) < EPSILON || Math.abs(x - box[2]) < EPSILON
    ? [Math.abs(x - box[0]) < EPSILON ? box[0] : box[2], grid.y.lines[nearestCut(grid.y.lines, y)]]
    : [grid.x.lines[nearestCut(grid.x.lines, x)], Math.abs(y - box[1]) < EPSILON ? box[1] : box[3]];
  const first = snap(line[0]), last = snap(line[line.length - 1]);
  if (distance(first, last) < Math.min(box[2] - box[0], box[3] - box[1]) * .72) return undefined;
  const vertices = [first, ...line.slice(1, -1), last];
  const along = line.length === 2 ? Number(Math.abs(last[1] - first[1]) > Math.abs(last[0] - first[0]))
    : Number(first[1] === box[1] && last[1] === box[3]);
  const across = 1 - along;
  if (first[along] > last[along]) vertices.reverse();
  const segments = vertices.slice(1).map((point, i): Line => [vertices[i], point]);
  if (segments.some(([start, end]) => end[along] - start[along] < EPSILON)) return undefined;
  const shift = (point: Point) => {
    const [start, end] = segments.find(([, end]) => point[along] <= end[along]) ?? segments[segments.length - 1];
    return start[across] + (end[across] - start[across]) * (point[along] - start[along]) / (end[along] - start[along]);
  };
  const normal = Math.max(...segments.map(([start, end]) => distance(start, end) / (end[along] - start[along])));
  const sign = a.support[0][across] < shift(a.support[0]) ? 1 : -1;
  const signed = (point: Point) => sign * (point[across] - shift(point)) / normal;
  const creases: [number, number][] = vertices.slice(1, -1).map(point => [along, point[along]]);
  const support = (owner: LocalOwner) =>
    owner.support.concat(creases.flatMap(crease => splitAtCrease([], owner.edges, ...crease)));
  const clearance = Math.min(...support(a).map(point => -signed(point)), ...support(b).map(signed));
  if (clearance < MIN_CLEARANCE) return undefined;
  let sides: [Point[], Point[]];
  if (line.length === 2) {
    const frame = corners(box);
    sides = [clipHalf(frame, signed), clipHalf(frame, point => -signed(point))];
  } else {
    const at = (u: number, v: number): Point => along === 0 ? [u, v] : [v, u];
    const low = [at(box[along], box[across]), at(box[along + 2], box[across]), ...vertices.slice().reverse()];
    const high = [...vertices, at(box[along + 2], box[across + 2]), at(box[along], box[across + 2])];
    sides = sign === 1 ? [low, high] : [high, low];
  }
  if (sides.some(side => polygonArea(side) < area(box) * .13)) return undefined;
  const length = segments.reduce((sum, segment) => sum + distance(...segment), 0);
  const offAxis = segments.filter(([start, end]) => start[0] !== end[0] && start[1] !== end[1])
    .reduce((sum, segment) => sum + distance(...segment), 0);
  return { line: vertices, sides, signed, creases, score: clearance + 650 * (1 - offAxis / length) };
}

function hasSharedClearance(
  box: Box, divider: Divider, bays: Bay[], nearby: { point: Point; label: number }[],
): boolean {
  const lines = [
    ...divider.line.slice(1).map((point, i): Line => [divider.line[i], point]),
    ...bays.flatMap(bay => bayBorders(bay, box)),
  ];
  return nearby.every(({ point, label }) => {
    if (lines.every(line => squaredDistanceToLine(point, line) >= PREFERRED_SITE_CLEARANCE ** 2)) return true;
    // Tight pairs share the available gap. In wider gaps every location
    // keeps at least the usual half metre measured in plan coordinates.
    let clearance = PREFERRED_SITE_CLEARANCE ** 2;
    for (const other of nearby) {
      if (other.label !== label) {
        clearance = Math.min(clearance, .35 ** 2 * ((other.point[0] - point[0]) ** 2 + (other.point[1] - point[1]) ** 2));
      }
    }
    return lines.every(line => squaredDistanceToLine(point, line) + EPSILON >= clearance);
  });
}

export function createSharedAlignmentGuard(
  grid: RegionGrid, labels: Int32Array, components: ReadonlyMap<number, number>,
  groups: readonly number[],
) {
  const { x, y, sites, loadPointEdges } = grid;
  const width = x.centers.length;
  const connections = new Map<number, { line: Line; box: Box }[]>();
  for (const { from_load_point_id: from, to_load_point_id: to } of loadPointEdges) {
    const label = components.get(from);
    if (label === undefined || label !== components.get(to)) continue;
    const edges = connections.get(label) ?? [];
    const line: Line = [sites.get(from)!.point, sites.get(to)!.point];
    // Clipping accepts a parameter error of EPSILON at the ends of the line.
    edges.push({ line, box: expanded(bounds(line), EPSILON * (1 + distance(...line))) });
    connections.set(label, edges);
  }
  const locations = [...sites.values()].map(site => site.point);
  const byAxis = ([0, 1] as const).map(axis => [...locations].sort((a, b) => a[axis] - b[axis]));

  function locationsIn(box: Box, axis: 0 | 1): Point[] {
    const sorted = byAxis[axis];
    let low = 0, high = sorted.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[middle][axis] < box[axis]) low = middle + 1;
      else high = middle;
    }
    const nearby: Point[] = [];
    for (let i = low; i < sorted.length && sorted[i][axis] <= box[axis + 2]; i++) {
      const point = sorted[i];
      if (inside(point, box)) nearby.push(point);
    }
    return nearby;
  }

  return (limits = { shift: 1500, span: 4500 }) => (
    { left, right, top, bottom }: TileBounds, donor: number, owner: number, joinsBothEnds = false,
  ) => {
    if (groups[donor] < 0 || groups[owner] < 0) return false;
    const box: Box = [x.lines[left], y.lines[top], x.lines[right + 1], y.lines[bottom + 1]];
    const boxWidth = box[2] - box[0], boxHeight = box[3] - box[1];
    if (Math.min(boxWidth, boxHeight) > limits.shift || Math.max(boxWidth, boxHeight) > limits.span) return false;
    if (connections.get(donor)?.some(edge => {
      if (separated(edge.box, box)) return false;
      const clipped = clipLine(edge.line, box);
      return clipped !== undefined && distance(...clipped) > EPSILON;
    })) return false;
    // Use a 50 mm lower clearance limit when both ends meet the same cut.
    const clearanceLimit = joinsBothEnds ? CLOSED_STEP_CLEARANCE : PREFERRED_SITE_CLEARANCE;
    const nearby = locationsIn(expanded(box, clearanceLimit), boxWidth <= boxHeight ? 0 : 1);
    if (nearby.length === 0) return true;
    const read = (col: number, row: number) => col >= left && col <= right && row >= top && row <= bottom
      ? owner : labels[row * width + col];
    const changed: Line[] = [];
    for (let row = top; row <= bottom; row++) {
      if (read(left - 1, row) !== owner) changed.push([[box[0], y.lines[row]], [box[0], y.lines[row + 1]]]);
      if (read(right + 1, row) !== owner) changed.push([[box[2], y.lines[row]], [box[2], y.lines[row + 1]]]);
    }
    for (let col = left; col <= right; col++) {
      if (read(col, top - 1) !== owner) changed.push([[x.lines[col], box[1]], [x.lines[col + 1], box[1]]]);
      if (read(col, bottom + 1) !== owner) changed.push([[x.lines[col], box[3]], [x.lines[col + 1], box[3]]]);
    }
    return keepsSiteClearance(grid, labels, nearby, new Map(), changed, clearanceLimit);
  };
}

/** Find plausible shared boundaries from Gabriel components before allocating leftover space. */
export function prepareSharedRegionPatches(
  grid: RegionGrid, groups: number[], components: ReadonlyMap<number, number>,
): (labels: Int32Array) => Patch[] {
  const { all, spacing, frames } = dividerSearch(grid, groups, components);
  const proposals = frames.slice(0, 180).flatMap(({ tiles, box }) => {
    const local = collectOwners(all, box);
    const [a, b] = local;
    if (!b || b.sites.length < 3 || local.length > 14 || groups[a.label] < 0 || groups[b.label] < 0
      || groups[a.label] === groups[b.label]) return [];
    const major: [number, number] = [a.label, b.label];
    return [{ tiles, box, local, major }];
  });

  return labels => {
    const candidates: { patch: Patch; score: number }[] = [];
    const clearance = new Map<Point, number>();
    for (const { tiles, box, local, major } of proposals) {
      const before = oldBorderPieces(grid, labels, tiles, major);
      // Preserve a real corner or a large, deliberate offset between bays.
      if (before.main < 3 || before.main === 3 && before.transverseLength > spacing) continue;
      const [left, top, right, bottom] = tiles;
      if (!forEachTile({ left, top, right: right - 1, bottom: bottom - 1 }, grid.x.centers.length,
        index => groups[labels[index]] >= 0)) continue;
      const trials = [...dividerLines(box, local, spacing), ...slopedTransitions(grid, box, local, spacing)];
      if (trials.length === 0) continue;
      const near = expanded(box, PREFERRED_SITE_CLEARANCE / .35);
      const nearby = all.filter(owner => !separated(owner.bounds, near))
        .flatMap(({ label, sites }) => sites.filter(point => inside(point, near)).map(point => ({ point, label })));
      const joins = boundaryJoins(grid, labels, tiles, major);
      const joinTrials = joins.flatMap((start, index) => joins.slice(index + 1).map(end => [start, end]));
      const geometry = [...joinTrials, ...trials].flatMap(line => {
        const divider = fitAnchoredDivider(grid, box, line, local);
        return divider ? [divider] : [];
      }).sort((a, b) => b.score - a.score);

      for (const divider of geometry) {
        if (divider.line.length - 1 > before.main) continue;
        const bays = fitBays(box, local, divider, 750, major, grid);
        if (!bays || !hasSharedClearance(box, divider, bays, nearby)) continue;
        const stitch = connectToRemainder(grid, labels, tiles, local, divider, bays, major);
        if (!stitch || stitch.extraLength > 1500 || stitch.borders.some(border => border.owners.every(owner => major.includes(owner)))) continue;
        const inner: Line[] = [
          ...divider.line.slice(1).map((point, i): Line => [divider.line[i], point]),
          ...bays.flatMap(bay => bayBorders(bay, box)),
        ];
        const gain = before.pieces - inner.length - stitch.newPieces;
        if (gain < 1 || !keepsSiteClearance(grid, labels, nearby.map(({ point }) => point), clearance,
          [...inner, ...stitch.borders.map(border => border.line)])) continue;
        candidates.push({ patch: { tiles, major, divider, bays, seams: stitch.borders },
          score: gain + divider.score / 1000 - stitch.extraLength / 1500 });
        break;
      }
    }
    const selected: Patch[] = [];
    for (const { patch } of candidates.sort((a, b) => b.score - a.score)) {
      if (selected.every(other => separated(patch.tiles, other.tiles))) selected.push(patch);
    }
    return selected;
  };
}

export function clearSharedRegionTiles(labels: Int32Array, width: number, patches: Patch[]): Int32Array {
  if (patches.length === 0) return labels;
  const result = labels.slice();
  for (const { tiles: [left, top, right, bottom] } of patches) {
    for (let row = top; row < bottom; row++) result.fill(REPLACED_REGION_TILE, row * width + left, row * width + right);
  }
  return result;
}

export function outsideSharedRegionPatches(grid: RegionGrid, patches: Patch[]) {
  if (patches.length === 0) return undefined;
  const cos = Math.cos(grid.angle), sin = Math.sin(grid.angle);
  const boxes = patches.map(({ tiles: [l, t, r, b] }): Box =>
    [grid.x.lines[l], grid.y.lines[t], grid.x.lines[r], grid.y.lines[b]]);
  return (pocket: Point[]) => {
    const local = pocket.map(([x, y]): Point => {
      const dx = x - grid.origin[0], dy = y - grid.origin[1];
      return [dx * cos + dy * sin, dy * cos - dx * sin];
    });
    const box = bounds(local);
    return boxes.every(patch => separated(patch, box));
  };
}

export function appendSharedRegionPatches(
  grid: RegionGrid, regions: RectangularTipLevelRegion[], groups: number[], patches: Patch[],
): void {
  const cos = Math.cos(grid.angle), sin = Math.sin(grid.angle);
  const world = ([x, y]: Point): Point => [grid.origin[0] + x * cos - y * sin, grid.origin[1] + x * sin + y * cos];
  const region = (label: number) => regions[groups[label] ?? EMPTY];
  const fill = (label: number, polygon: Point[]) => region(label)?.fillRings.push(polygon.map(world));
  function stroke([a, b]: Line, left: number, right: number) {
    const first = region(left), second = region(right);
    if (first === second) return;
    const line: Line = [world(a), world(b)];
    first?.contours.push(line);
    second?.contours.push(line);
  }
  for (const { tiles: [left, top, right, bottom], major, divider, bays, seams } of patches) {
    const box: Box = [grid.x.lines[left], grid.y.lines[top], grid.x.lines[right], grid.y.lines[bottom]];
    major.forEach((label, index) => fill(label, divider.sides[index]));
    divider.line.slice(1).forEach((point, index) => stroke([divider.line[index], point], ...major));
    for (const bay of bays) {
      const ring = corners(bay.box);
      // The bay's ring cuts a hole out of its parent in the shared even-odd fill.
      fill(bay.parent, ring);
      fill(bay.label, ring);
      for (const edge of bayBorders(bay, box)) stroke(edge, bay.parent, bay.label);
    }
    for (const seam of seams) stroke(seam.line, ...seam.owners);
  }
}
