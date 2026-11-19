import type { LoadPointTopology, TipLevelRegionTopology } from "../core/tipLevelRegionContract.ts";
import { assignCompactRegionBlocks, nearestCut } from "./compactRegionBlocks.ts";
import { alignSharedBoundaries, expandUndersizedFootprints, fitEnclosedSiteRectangles, fitWholeRectangles, flattenNarrowProjections, widenCrowdedSides } from "./alignRegionBoundaries.ts";
import { reserveAlignedBays } from "./alignedRegionBays.ts";
import { straightenSharedFilledBorders, type SharedBorderConstraints, type SharedFilledBorder } from "./simplifyFilledRegionBoundaries.ts";
import {
  appendSharedRegionPatches, clearSharedRegionTiles, outsideSharedRegionPatches,
  prepareSharedRegionPatches, createSharedAlignmentGuard, REPLACED_REGION_TILE,
} from "./sharedRegionLayout.ts";

type Point = [number, number];
type Line = [Point, Point];
export type RectangularTipLevelRegion = { fillRings: Point[][]; contours: Point[][] };

export type TileBounds = { left: number; right: number; top: number; bottom: number };

const CELL_MM = 1250;
const FINE_CELL_MM = 750;
const MAX_CELLS = 400_000;
const CLEARANCE_MM = 1000;
const TIGHT_SITE_CLEARANCE_MM = 500;
const MAX_INWARD_ROW_CLEARANCE_MM = 2000;
const MIN_CENTERED_CLEARANCE_MM = 750;
const MIN_UNASSIGNED_CLEARANCE_MM = 250;
const MIN_REGULAR_TILE_MM = 250;
const SITE_CUT_OFFSET_MM = 25;
const ROW_SEARCH_MM = 5000;
const ROW_ALIGNMENT_MM = 900;
const ROW_BAND_MM = 1250;
const MAX_ROW_SPREAD_MM = 1100;
const MAX_ROW_GAP_MM = 4500;
const MAX_OUTLINE_ROW_GAP_MM = 6500;
const MIN_ROW_LENGTH_MM = 3000;
const MIN_ROW_SITES = 5;
const MIN_OUTLINE_ROW_SITES = 3;
const EMPTY = -1;
const EPSILON = 1e-6;

type Axis = { lines: number[]; centers: number[] };
type Site = { point: Point; cell: number; inDenseRow: boolean; clearance?: number };
type Side = -1 | 1;
type RowBand = { axis: 0 | 1; sites: Site[]; lower: number; upper: number; outside?: Side };
export type RegionGrid = {
  angle: number;
  origin: Point;
  x: Axis;
  y: Axis;
  mask: Uint8Array;
  neighbors: Int32Array;
  sites: Map<number, Site>;
  loadPointEdges: LoadPointTopology["edges"];
  rows: RowBand[];
  outlineMargin: number;
};

export function createRectangularRegionLayout(
  points: ReadonlyMap<number, Point>, topology: LoadPointTopology, outlineMargin: number,
) {
  function prepareGrid(compactSiteIds?: ReadonlySet<number>) {
    const grid = buildRectangularRegionGrid(points, topology, outlineMargin, CELL_MM, compactSiteIds);
    let fineGrid: RegionGrid | undefined;
    let triedFineGrid = false;
    return {
      grid,
      render(regions: TipLevelRegionTopology, constraints: SharedBorderConstraints) {
        const result = grid && buildRectangularTipLevelRegions(grid, regions, constraints);
        if (result) return result;
        if (!triedFineGrid) {
          fineGrid = buildRectangularRegionGrid(points, topology, outlineMargin, FINE_CELL_MM, compactSiteIds);
          triedFineGrid = true;
        }
        return fineGrid && buildRectangularTipLevelRegions(fineGrid, regions, constraints);
      },
    };
  }
  const base = prepareGrid();
  const compactGridCandidates = compactGridSiteIds(base.grid);
  const sites = [...points.values()];
  const faces = topology.faces.flatMap(({ boundary_load_point_ids }) => {
    const face = boundary_load_point_ids.map(id => points.get(id));
    return face.every((point): point is Point => point !== undefined) ? [face] : [];
  });
  let compactGrid: ReturnType<typeof prepareGrid> | undefined;
  let compactKey = "";
  return (regions: TipLevelRegionTopology): RectangularTipLevelRegion[] | undefined => {
    const constraints: SharedBorderConstraints = {
      sites,
      faces,
      connections: regions.groups.flatMap(group => group.edges.flatMap(({ from_load_point_id, to_load_point_id }) => {
        const from = points.get(from_load_point_id), to = points.get(to_load_point_id);
        return from && to ? [[from, to] as Line] : [];
      })),
    };
    const assigned = new Set(regions.groups.flatMap(group => group.load_point_ids));
    const compactIds = [...(base.grid?.sites ?? [])].flatMap(([id, site]) =>
      !assigned.has(id) && site.clearance === undefined ? [id] : []);
    const reserved = new Set(compactIds);
    compactIds.push(...compactGridCandidates.filter(id => !reserved.has(id)));
    const key = compactIds.join("/");
    if (key !== compactKey) {
      compactGrid = compactIds.length ? prepareGrid(new Set(compactIds)) : undefined;
      compactKey = key;
    }
    return compactGrid?.render(regions, constraints) ?? base.render(regions, constraints);
  };
}

function compactGridSiteIds(grid?: RegionGrid): number[] {
  if (!grid) return [];
  const { x, y, sites } = grid;
  const width = x.centers.length;
  const entries = [...sites];
  return entries.flatMap(([id, { point: [u, v], cell, clearance }]) => {
    if (clearance !== undefined) return [];
    const col = cell % width, row = Math.floor(cell / width);
    const distance = Math.min(u - x.lines[col], x.lines[col + 1] - u, v - y.lines[row], y.lines[row + 1] - v);
    if (distance >= SITE_CUT_OFFSET_MM - EPSILON) return [];
    const nearby = entries.some(([other, site]) => other !== id
      && Math.max(Math.abs(u - site.point[0]), Math.abs(v - site.point[1])) <= 2 * CLEARANCE_MM);
    return nearby ? [{ id, distance }] : [];
  }).sort((a, b) => a.distance - b.distance).map(({ id }) => id);
}

export function buildRectangularRegionGrid(
  points: ReadonlyMap<number, Point>, topology: LoadPointTopology, outlineMargin: number, cellSize = CELL_MM,
  compactSiteIds?: ReadonlySet<number>,
): RegionGrid | undefined {
  const origin = points.values().next().value;
  if (!origin) return undefined;
  const edges = topology.edges.flatMap(({ from_load_point_id, to_load_point_id }) => {
    const from = points.get(from_load_point_id), to = points.get(to_load_point_id);
    return from && to ? [[from, to] as Line] : [];
  });
  const angle = projectAxes(edges);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const project = ([x, y]: Point): Point => {
    const dx = x - origin[0], dy = y - origin[1];
    return [dx * cos + dy * sin, dy * cos - dx * sin];
  };
  const sites = new Map<number, Site>();
  const occupied = new Set<string>();
  // Pick the lowest ID for coincident locations.
  for (const [id, point] of [...points].sort(([a], [b]) => a - b)) {
    const key = point.join(",");
    if (occupied.has(key)) continue;
    occupied.add(key);
    sites.set(id, { point: project(point), cell: EMPTY, inDenseRow: false });
  }
  const allSites = [...sites.values()];
  const rows = findRows(allSites, outlineRowNeighbors(topology, sites));
  const compactSites = new Set([...(compactSiteIds ?? [])].flatMap(id => {
    const site = sites.get(id);
    return site ? [site] : [];
  }));
  const axes = makeAxes(allSites, outlineMargin, cellSize, rows, compactSites);
  if (!axes) return undefined;
  const [x, y] = axes;
  const width = x.centers.length, height = y.centers.length;
  const mask = new Uint8Array(width * height);
  const neighbors = new Int32Array(mask.length * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const cell = j * width + i;
      neighbors[cell * 4] = i > 0 ? cell - 1 : EMPTY;
      neighbors[cell * 4 + 1] = i + 1 < width ? cell + 1 : EMPTY;
      neighbors[cell * 4 + 2] = j > 0 ? cell - width : EMPTY;
      neighbors[cell * 4 + 3] = j + 1 < height ? cell + width : EMPTY;
    }
  }
  const grid = { angle, origin, x, y, mask, neighbors, sites, loadPointEdges: topology.edges, rows, outlineMargin };
  for (const { boundary_load_point_ids } of topology.faces) {
    const polygon = boundary_load_point_ids.map(id => points.get(id));
    if (polygon.every(point => point !== undefined)) rasterizeFace(grid, polygon.map(project));
  }
  for (const [from, to] of edges) rasterizeMargin(grid, [project(from), project(to)]);
  for (const site of sites.values()) {
    site.cell = intervalAt(y.lines, site.point[1]) * width + intervalAt(x.lines, site.point[0]);
    rasterizeMargin(grid, [site.point, site.point]);
    mask[site.cell] = 1;
  }
  return grid;
}

type RowNeighbors = ReadonlyMap<Site, ReadonlyMap<Site, Side>>;

function outlineRowNeighbors(topology: LoadPointTopology, sites: ReadonlyMap<number, Site>): [RowNeighbors, RowNeighbors] {
  const faceEdges = new Map<string, { from: Site; to: Site; count: number; faceDirection: number }>();
  for (const { boundary_load_point_ids: ids } of topology.faces) {
    const boundary = ids.map(id => sites.get(id));
    if (!boundary.every(site => site !== undefined)) continue;
    const signedArea = boundary.reduce((area, { point: [x, y] }, index) => {
      const [u, v] = boundary[(index + 1) % boundary.length].point;
      return area + x * v - y * u;
    }, 0);
    if (signedArea === 0) continue;
    for (const [index, fromId] of ids.entries()) {
      const next = (index + 1) % ids.length;
      const toId = ids[next];
      const key = fromId < toId ? `${fromId}:${toId}` : `${toId}:${fromId}`;
      const existing = faceEdges.get(key);
      if (existing) existing.count++;
      else faceEdges.set(key, { from: boundary[index], to: boundary[next], count: 1, faceDirection: Math.sign(signedArea) });
    }
  }
  const byAxis = [new Map<Site, Map<Site, Side>>(), new Map<Site, Map<Site, Side>>()] as const;
  for (const { from, to, count, faceDirection } of faceEdges.values()) {
    if (count !== 1) continue;
    const dx = to.point[0] - from.point[0], dy = to.point[1] - from.point[1];
    const along = Math.max(Math.abs(dx), Math.abs(dy)), across = Math.min(Math.abs(dx), Math.abs(dy));
    if (along > MAX_OUTLINE_ROW_GAP_MM || across > Math.min(ROW_ALIGNMENT_MM, along / 4)) continue;
    const axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
    const outward: Side = (axis === 0 ? -dx : dy) * faceDirection < 0 ? -1 : 1;
    const neighbors = byAxis[axis];
    const fromNeighbors = neighbors.get(from) ?? new Map<Site, Side>();
    const toNeighbors = neighbors.get(to) ?? new Map<Site, Side>();
    fromNeighbors.set(to, outward);
    toNeighbors.set(from, outward);
    neighbors.set(from, fromNeighbors);
    neighbors.set(to, toNeighbors);
  }
  return [byAxis[0], byAxis[1]];
}

function findRows(sites: Site[], outlineNeighbors: [RowNeighbors, RowNeighbors]): RowBand[] {
  const rows: RowBand[] = [];
  for (const axis of [0, 1] as const) {
    const across = axis === 0 ? 1 : 0;
    const sorted = [...sites].sort((a, b) => a.point[axis] - b.point[axis]);
    const candidates = new Set(outlineNeighbors[axis].keys());
    let start = 0;
    for (const site of sorted) {
      const { point } = site;
      while (sorted[start].point[axis] < point[axis] - ROW_SEARCH_MM) start++;
      let count = 0, first = Infinity;
      for (let i = start; i < sorted.length; i++) {
        const other = sorted[i].point;
        if (other[axis] > point[axis] + ROW_SEARCH_MM) break;
        if (Math.abs(other[across] - point[across]) > ROW_ALIGNMENT_MM) continue;
        first = Math.min(first, other[axis]);
        count++;
        // Require an extended row. A tight cluster at a single footing
        // should not change how the surrounding open space is filled.
        if (count >= MIN_ROW_SITES && other[axis] - first >= MIN_ROW_LENGTH_MM) {
          site.inDenseRow = true;
          candidates.add(site);
          break;
        }
      }
    }
    const remaining = [...candidates].sort((a, b) => a.point[across] - b.point[across]);
    while (remaining.length >= MIN_OUTLINE_ROW_SITES) {
      // Start with the strongest perpendicular alignment so a stray site
      // cannot split a long staggered row into separate bands.
      let bestFrom = 0, bestTo = 0, to = 0;
      for (let from = 0; from < remaining.length; from++) {
        while (to < remaining.length && remaining[to].point[across] - remaining[from].point[across] <= MAX_ROW_SPREAD_MM) to++;
        if (to - from > bestTo - bestFrom) {
          bestFrom = from;
          bestTo = to;
        }
      }
      if (bestTo - bestFrom < MIN_OUTLINE_ROW_SITES) break;
      const aligned = remaining.splice(bestFrom, bestTo - bestFrom).sort((a, b) => a.point[axis] - b.point[axis]);
      let from = 0;
      for (let end = 1; end <= aligned.length; end++) {
        if (end < aligned.length) {
          const previous = aligned[end - 1], next = aligned[end];
          if (next.point[axis] - previous.point[axis] <= MAX_ROW_GAP_MM
            || outlineNeighbors[axis].get(previous)?.has(next)) continue;
        }
        if (end - from >= MIN_OUTLINE_ROW_SITES && aligned[end - 1].point[axis] - aligned[from].point[axis] >= MIN_ROW_LENGTH_MM) {
          const members = aligned.slice(from, end);
          const outside = outerSide(members, axis, outlineNeighbors[axis]);
          if (members.length < MIN_ROW_SITES && !outside) {
            from = end;
            continue;
          }
          let lower = Infinity, upper = -Infinity;
          for (const site of members) {
            site.inDenseRow = true;
            lower = Math.min(lower, site.point[across]);
            upper = Math.max(upper, site.point[across]);
          }
          const inwardClearance = outside
            ? outlineInwardClearance(sites, members, axis, outside, outside === 1 ? lower : upper)
            : CLEARANCE_MM;
          rows.push({
            axis,
            sites: members,
            lower: lower - (outside === 1 ? inwardClearance : CLEARANCE_MM),
            upper: upper + (outside === -1 ? inwardClearance : CLEARANCE_MM),
            outside,
          });
        }
        from = end;
      }
    }
  }
  return rows.sort((a, b) => b.sites.length - a.sites.length);
}

function outlineInwardClearance(sites: Site[], row: Site[], axis: 0 | 1, outside: Side, edge: number): number {
  const first = row[0].point[axis], last = row[row.length - 1].point[axis];
  const across = axis === 0 ? 1 : 0;
  let spacing = 2 * MAX_INWARD_ROW_CLEARANCE_MM;
  for (const { point } of sites) {
    if (point[axis] < first || point[axis] > last) continue;
    const gap = (edge - point[across]) * outside;
    if (gap > EPSILON) spacing = Math.min(spacing, gap);
  }
  return Math.max(CLEARANCE_MM, spacing / 2);
}

function outerSide(members: Site[], axis: 0 | 1, outline: RowNeighbors): Side | undefined {
  const ownSites = new Set(members);
  let lower = 0, upper = 0;
  for (const site of members) {
    for (const [next, side] of outline.get(site) ?? []) {
      const length = next.point[axis] - site.point[axis];
      if (length <= 0 || !ownSites.has(next)) continue;
      if (side < 0) lower += length;
      else upper += length;
    }
  }
  const span = members[members.length - 1].point[axis] - members[0].point[axis];
  if (lower >= span * 0.75 && upper === 0) return -1;
  if (upper >= span * 0.75 && lower === 0) return 1;
  return undefined;
}

function projectAxes(edges: Line[]): number {
  const quarterTurn = Math.PI / 2;
  const tolerance = 5 * Math.PI / 180;
  const headings = edges.flatMap(([[x, y], [u, v]]) => {
    if (x === u && y === v) return [];
    const angle = Math.atan2(v - y, u - x);
    return [angle - Math.round(angle / quarterTurn) * quarterTurn];
  });
  let bestAngle = 0, bestScore = 0;
  for (let step = -180; step < 180; step++) {
    const angle = step * Math.PI / 720;
    let score = 0;
    for (const heading of headings) {
      const delta = Math.abs(heading - angle);
      const error = Math.min(delta, quarterTurn - delta) / tolerance;
      if (error < 1) score += 1 - error ** 2;
    }
    if (score > bestScore + EPSILON || Math.abs(score - bestScore) <= EPSILON && Math.abs(angle) < Math.abs(bestAngle)) {
      bestAngle = angle;
      bestScore = score;
    }
  }
  return Math.abs(bestAngle) <= Math.PI / 360 ? 0 : bestAngle;
}

function makeAxes(
  sites: Site[], margin: number, cellSize: number, rows: RowBand[], compactSites: ReadonlySet<Site>,
): [Axis, Axis] | undefined {
  const points = sites.map(site => site.point);
  const bounds = ([0, 1] as const).map(axis => points.reduce(
    ([min, max], point) => [Math.min(min, point[axis]), Math.max(max, point[axis])],
    [Infinity, -Infinity],
  ));
  const step = Math.max(cellSize, Math.sqrt((bounds[0][1] - bounds[0][0] + 2 * margin)
    * (bounds[1][1] - bounds[1][0] + 2 * margin) / (MAX_CELLS / 2)));
  // A tile center should be within the Gabriel margin of any site in its tile.
  if (!Number.isFinite(step) || step > Math.SQRT2 * margin) return undefined;
  const starts = bounds.map(([min]) => min - margin - step / 2);
  const sizes = bounds.map(([, max], i) => Math.ceil((max + margin - starts[i]) / step));
  if (sizes[0] * sizes[1] > MAX_CELLS) return undefined;
  const lines = bounds.map(([min, max], axis) => adaptiveAxisLines(points.map(point => point[axis]), min, max, margin, cellSize));
  const requiredCuts = [new Set<number>(), new Set<number>()];
  for (const axis of [0, 1] as const) {
    const axisLines = lines[axis];
    const perimeterCuts: number[] = [];
    for (const row of rows) {
      if (row.axis === axis) continue;
      if (row.lower > axisLines[0]) requiredCuts[axis].add(row.lower);
      if (row.upper < axisLines[axisLines.length - 1]) requiredCuts[axis].add(row.upper);
      if (row.outside) perimeterCuts.push(row.outside === 1 ? row.lower : row.upper);
    }
    // Prefer the common inward edge of a perimeter row over nearby filler
    // cuts. The clearance and site separation cuts are still added below.
    const regularCuts = axisLines.filter((cut, index) =>
      index === 0 || index === axisLines.length - 1 || !perimeterCuts.some(edge => Math.abs(edge - cut) < CLEARANCE_MM));
    lines[axis] = [...new Set([...regularCuts, ...requiredCuts[axis]])].sort((a, b) => a - b);
  }
  addCenteredCuts(sites, lines, requiredCuts, compactSites);
  for (const axis of [0, 1] as const) {
    // A band or clearance cut can stand in for a nearby regular line. Split
    // any tiles that still contain multiple locations after this reduction.
    lines[axis] = lines[axis].filter((cut, index, all) =>
      index === 0 || index === all.length - 1 || requiredCuts[axis].has(cut)
      || Math.min(cut - all[index - 1], all[index + 1] - cut) >= MIN_REGULAR_TILE_MM);
  }
  for (const axis of [0, 1] as const) {
    const bins = new Map<string, Point[]>();
    for (const point of points) {
      const key = [intervalAt(lines[0], point[0]), intervalAt(lines[1], point[1])].join(",");
      const bin = bins.get(key) ?? [];
      bin.push(point);
      bins.set(key, bin);
    }
    const cuts = new Set(lines[axis]);
    for (const bin of bins.values()) {
      if (bin.length < 2) continue;
      const positions = [...new Set(bin.map(point => point[axis]))].sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) cuts.add((positions[i - 1] + positions[i]) / 2);
    }
    lines[axis] = [...cuts].sort((a, b) => a - b);
  }
  if ((lines[0].length - 1) * (lines[1].length - 1) > MAX_CELLS) return undefined;
  for (const axis of [0, 1] as const) {
    const sorted = [...new Set(points.map(point => point[axis]))].sort((a, b) => a - b);
    const cuts = lines[axis];
    let site = 0;
    for (let i = 1; i < cuts.length - 1; i++) {
      while (sorted[site] < cuts[i] - EPSILON) site++;
      if (site === sorted.length || Math.abs(sorted[site] - cuts[i]) > EPSILON) continue;
      // Move the cut far enough for browser rounding to keep the site on
      // its original side, while leaving the closest other site in place.
      const position = sorted[site];
      const side = position >= cuts[i] ? -1 : 1;
      const limit = side < 0
        ? Math.max(cuts[i - 1], sorted[site - 1] ?? -Infinity)
        : Math.min(cuts[i + 1], sorted[site + 1] ?? Infinity);
      cuts[i] = position + side * Math.min(SITE_CUT_OFFSET_MM, Math.abs(position - limit) / 2);
    }
  }
  const toAxis = (line: number[]): Axis => ({
    lines: line,
    centers: line.slice(1).map((value, i) => (value + line[i]) / 2),
  });
  return [toAxis(lines[0]), toAxis(lines[1])];
}

function adaptiveAxisLines(positions: number[], min: number, max: number, margin: number, cellSize: number): number[] {
  const sorted = positions.slice().sort((a, b) => a - b);
  const centers: number[] = [];
  for (let from = 0; from < sorted.length;) {
    let to = from + 1;
    while (to < sorted.length && sorted[to] - sorted[from] <= margin / 4) to++;
    centers.push((sorted[from] + sorted[to - 1]) / 2);
    from = to;
  }
  const lines = [min - margin];
  for (let i = 1; i < centers.length; i++) lines.push((centers[i - 1] + centers[i]) / 2);
  lines.push(max + margin);

  const cuts = [lines[0]];
  const maximumTile = cellSize === FINE_CELL_MM ? margin : Math.SQRT2 * margin;
  for (let i = 1; i < lines.length; i++) {
    const from = lines[i - 1], to = lines[i];
    const pieces = Math.ceil((to - from) / maximumTile);
    for (let j = 1; j < pieces; j++) cuts.push(from + j * (to - from) / pieces);
    cuts.push(to);
  }
  return cuts;
}

function addCenteredCuts(sites: Site[], lines: number[][], requiredCuts: Set<number>[], compactSites: ReadonlySet<Site>) {
  const buckets = new Map<string, Site[]>();
  const size = 2 * CLEARANCE_MM;
  const bucket = (position: number) => Math.floor(position / size);
  for (const site of sites) {
    const [x, y] = site.point.map(bucket);
    const key = `${x}:${y}`;
    const members = buckets.get(key) ?? [];
    members.push(site);
    buckets.set(key, members);
  }
  const [xCuts, yCuts] = lines.map(axis => new Set(axis));
  const initialCells = (xCuts.size - 1) * (yCuts.size - 1);
  const cellBudget = Math.min(MAX_CELLS, Math.max(initialCells * 2, 15_000));
  const compact = new Map<Site, number>();
  function reserveCuts(site: Site, clearance: number, budget: number) {
    const [u, v] = site.point;
    const xs = [u - clearance, u + clearance], ys = [v - clearance, v + clearance];
    const width = xCuts.size - 1 + xs.filter(cut => !xCuts.has(cut)).length;
    const height = yCuts.size - 1 + ys.filter(cut => !yCuts.has(cut)).length;
    if (width * height > budget) return;
    for (const cut of xs) {
      xCuts.add(cut);
      requiredCuts[0].add(cut);
    }
    for (const cut of ys) {
      yCuts.add(cut);
      requiredCuts[1].add(cut);
    }
    site.clearance = clearance;
  }
  for (const site of sites) {
    const [u, v] = site.point;
    const x = bucket(u), y = bucket(v);
    let gap = size;
    for (let i = x - 1; i <= x + 1; i++) {
      for (let j = y - 1; j <= y + 1; j++) {
        for (const other of buckets.get(`${i}:${j}`) ?? []) {
          if (other === site) continue;
          gap = Math.min(gap, Math.max(Math.abs(other.point[0] - u), Math.abs(other.point[1] - v)));
        }
      }
    }
    // Reserve equal spacing on both sides only when the surrounding sites
    // leave room. Round down so two reservations cannot overlap.
    const clearance = Math.floor((gap / 2 + EPSILON) / 25) * 25;
    if (clearance >= MIN_CENTERED_CLEARANCE_MM) reserveCuts(site, clearance, cellBudget);
    else if (clearance >= MIN_UNASSIGNED_CLEARANCE_MM && compactSites.has(site)) compact.set(site, clearance);
  }
  // Allow a small extra budget for compact footprints. Transparent sites are considered first.
  // In large dense
  // projects the normal reservations can already use the complete soft limit.
  const compactBudget = Math.min(MAX_CELLS, Math.floor(cellBudget * 1.15));
  for (const site of compactSites) {
    const clearance = compact.get(site);
    if (clearance !== undefined) reserveCuts(site, clearance, compactBudget);
  }
  lines[0] = [...xCuts].sort((a, b) => a - b);
  lines[1] = [...yCuts].sort((a, b) => a - b);
}

function intervalAt(lines: number[], value: number): number {
  let low = 0, high = lines.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (value < lines[mid]) high = mid;
    else low = mid;
  }
  return low;
}

function rasterizeFace({ x, y, mask }: RegionGrid, polygon: Point[]) {
  const ys = polygon.map(point => point[1]);
  const first = intervalAt(y.lines, Math.min(...ys)), last = intervalAt(y.lines, Math.max(...ys));
  for (let j = first; j <= last; j++) {
    const scanline = y.centers[j];
    const cuts: number[] = [];
    for (const [i, [u, v]] of polygon.entries()) {
      const [a, b] = polygon[(i + 1) % polygon.length];
      if ((v > scanline) !== (b > scanline)) cuts.push(u + (a - u) * (scanline - v) / (b - v));
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const start = intervalAt(x.lines, cuts[i]), end = intervalAt(x.lines, cuts[i + 1]);
      markRange(mask, j, x.centers, start, end, center => center >= cuts[i] && center <= cuts[i + 1]);
    }
  }
}

function markRange(mask: Uint8Array, row: number, centers: number[], start: number, end: number, contains: (value: number) => boolean) {
  for (let i = start; i <= end; i++) if (contains(centers[i])) mask[row * centers.length + i] = 1;
}

function rasterizeMargin({ x, y, mask, outlineMargin: margin }: RegionGrid, edge: Line) {
  const [[a, b], [u, v]] = edge;
  const firstX = intervalAt(x.lines, Math.min(a, u) - margin);
  const lastX = intervalAt(x.lines, Math.max(a, u) + margin);
  const firstY = intervalAt(y.lines, Math.min(b, v) - margin);
  const lastY = intervalAt(y.lines, Math.max(b, v) + margin);
  const distanceSquared = segmentDistance(edge);
  for (let j = firstY; j <= lastY; j++) {
    markRange(mask, j, x.centers, firstX, lastX, center => distanceSquared(center, y.centers[j]) <= margin ** 2);
  }
}

function segmentDistance([[a, b], [u, v]]: Line) {
  const dx = u - a, dy = v - b, lengthSquared = dx ** 2 + dy ** 2;
  return (x: number, y: number) => {
    const fraction = lengthSquared ? Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / lengthSquared)) : 0;
    return (x - a - fraction * dx) ** 2 + (y - b - fraction * dy) ** 2;
  };
}

export function buildRectangularTipLevelRegions(
  grid: RegionGrid, topology: TipLevelRegionTopology, constraints: SharedBorderConstraints,
): RectangularTipLevelRegion[] | undefined {
  if (topology.groups.length === 0) return [];
  const { sites, mask, neighbors, x, y } = grid;
  const width = x.centers.length;
  const component = new Map<number, number>();
  const forest: [Site, Site, number][] = [];
  const groupByComponent: number[] = [];
  // Keep connected-component membership from the core's same-level Gabriel
  // edges. Reserve a spanning tree of existing connections in each component.
  function collectComponents(index: number, ids: number[], edges: LoadPointTopology["edges"]) {
    const incident = new Map<number, number[]>();
    for (const { from_load_point_id: from, to_load_point_id: to } of edges) {
      const a = incident.get(from) ?? [], b = incident.get(to) ?? [];
      a.push(to);
      b.push(from);
      incident.set(from, a);
      incident.set(to, b);
    }
    for (const id of ids) {
      const site = sites.get(id);
      if (!site || component.has(id)) continue;
      const label = groupByComponent.push(index) - 1;
      const pending = [id];
      component.set(id, label);
      for (let i = 0; i < pending.length; i++) {
        const from = pending[i];
        for (const to of incident.get(from) ?? []) {
          const next = sites.get(to);
          if (!next || component.has(to)) continue;
          pending.push(to);
          component.set(to, label);
          forest.push([sites.get(from)!, next, label]);
        }
      }
    }
  }
  for (const [index, group] of topology.groups.entries()) {
    if (group.edges.some(edge => !sites.has(edge.from_load_point_id) || !sites.has(edge.to_load_point_id))) return undefined;
    collectComponents(index, group.load_point_ids, group.edges);
  }
  const unassigned = new Set([...sites.keys()].filter(id => !component.has(id)));
  const transparentGroup = topology.groups.length;
  if (unassigned.size > 0) {
    const edges = grid.loadPointEdges.filter(edge => (
      unassigned.has(edge.from_load_point_id) && unassigned.has(edge.to_load_point_id)
    ));
    collectComponents(transparentGroup, [...unassigned], edges);
  }
  const labels = new Int32Array(mask.length).fill(EMPTY);
  const protectedTiles = new Uint8Array(mask.length);
  for (const [id, site] of sites) {
    const label = component.get(id)!;
    if (labels[site.cell] !== EMPTY && labels[site.cell] !== label) return undefined;
    labels[site.cell] = label;
    protectedTiles[site.cell] = 1;
  }
  const queue = new Int32Array(mask.length);
  const parents = new Int32Array(mask.length);
  const visited = new Int32Array(mask.length);
  for (const [index, [from, to, label]] of forest.entries()) {
    const withinCorridor = segmentDistance([from.point, to.point]);
    let end = 1;
    queue[0] = from.cell;
    visited[from.cell] = index + 1;
    for (let start = 0; start < end && visited[to.cell] !== index + 1; start++) {
      const cell = queue[start];
      for (let side = 0; side < 4; side++) {
        const next = neighbors[cell * 4 + side];
        if (next === EMPTY || !mask[next] || visited[next] === index + 1
          || labels[next] !== EMPTY && labels[next] !== label
          || withinCorridor(x.centers[next % width], y.centers[Math.floor(next / width)]) > grid.outlineMargin ** 2) continue;
        visited[next] = index + 1;
        parents[next] = cell;
        queue[end++] = next;
      }
    }
    if (visited[to.cell] !== index + 1) return undefined;
    for (let cell = to.cell; cell !== from.cell; cell = parents[cell]) {
      labels[cell] = label;
      protectedTiles[cell] = 1;
    }
  }
  const visibleGroups = groupByComponent.map(group => group === transparentGroup ? EMPTY : group);
  const joinSharedPatches = prepareSharedRegionPatches(grid, visibleGroups, component);
  const protectedConnections = protectedTiles.slice();
  const denseSites = [...sites.values()].filter(site => site.inDenseRow).length;
  const includeBands = denseSites > 0 && denseSites < sites.size;
  const pathLabels = labels.slice();
  reserveRowsAndBays();
  const tightSites = findTightSiteReservations(grid, labels, visibleGroups);
  if (tightSites.size > 0) {
    labels.set(pathLabels);
    protectedTiles.set(protectedConnections);
    reserveRowsAndBays(tightSites);
  }
  function reserveRowsAndBays(priority?: ReadonlySet<Site>) {
    const bandSites = reserveSiteAndRowTiles(grid, labels, protectedTiles, queue, includeBands, visibleGroups, priority);
    if (includeBands) reserveDenseRowTiles(grid, labels, bandSites);
    reserveAlignedBays(grid, labels, protectedTiles);
  }
  assignCompactRegionBlocks(grid, labels, protectedTiles, groupByComponent,
    candidate => growRegions(candidate, neighbors, queue, mask));
  preserveClearance(grid, labels, protectedTiles);
  fitWholeRectangles(grid, labels, protectedTiles, groupByComponent);
  alignSharedBoundaries(grid, labels, protectedTiles);
  flattenNarrowProjections(grid, labels, protectedTiles);
  const alignmentGuard = createSharedAlignmentGuard(grid, labels, component, visibleGroups);
  expandUndersizedFootprints(grid, labels, protectedConnections, visibleGroups, alignmentGuard(
    { shift: 2 * grid.outlineMargin, span: 2 * grid.outlineMargin },
  ));
  alignSharedBoundaries(grid, labels, protectedConnections, alignmentGuard());
  alignSharedBoundaries(grid, labels, protectedConnections,
    alignmentGuard({ shift: 2500, span: 32000 }), visibleGroups);
  flattenNarrowProjections(grid, labels, protectedTiles, {
    groups: visibleGroups, connections: protectedConnections,
    canMove: alignmentGuard({ shift: 1500, span: 32000 }),
  });
  widenCrowdedSides(grid, labels, visibleGroups, alignmentGuard({ shift: 1250, span: 6500 }));
  const locationTiles = new Uint8Array(labels.length);
  for (const site of sites.values()) locationTiles[site.cell] = 1;
  // A raster route can be wider than the actual Gabriel connection.
  alignSharedBoundaries(grid, labels, locationTiles, alignmentGuard({ shift: 750, span: 32000 }), visibleGroups);
  // Cover partial tiles at the fringe; the SVG mask clips to the exact outline.
  growRegions(labels, neighbors, queue);
  fitEnclosedSiteRectangles(grid, labels, protectedConnections, visibleGroups,
    alignmentGuard({ shift: 2 * grid.outlineMargin, span: 2 * grid.outlineMargin }));
  // Transparent components participate in the division and leave a hole in the fill.
  const patches = joinSharedPatches(labels);
  const remainder = clearSharedRegionTiles(labels, width, patches);
  const componentSizes = new Map<number, number>();
  const sharedBorders: SharedFilledBorder[] = [];
  for (const label of component.values()) componentSizes.set(label, (componentSizes.get(label) ?? 0) + 1);
  const regions = traceRegions(grid, remainder, visibleGroups, topology.groups.length,
    (line, left, right) => {
      const a = visibleGroups[left] ?? EMPTY, b = visibleGroups[right] ?? EMPTY;
      if (a === EMPTY && b === EMPTY) return;
      const fixed = a === EMPTY || b === EMPTY || a === b;
      const shortOffsetsOnly = (componentSizes.get(left) ?? 0) < 3 || (componentSizes.get(right) ?? 0) < 3;
      sharedBorders.push({ line, groups: a < b ? [a, b] : [b, a], fixed, shortOffsetsOnly });
    });
  const simplified = straightenSharedFilledBorders(regions, sharedBorders, constraints, outsideSharedRegionPatches(grid, patches));
  appendSharedRegionPatches(grid, simplified, visibleGroups, patches);
  return simplified;
}

function preserveClearance({ sites, x, y, mask }: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array) {
  const width = x.centers.length;
  for (const { point: [u, v], cell } of sites.values()) {
    const firstX = intervalAt(x.lines, u - CLEARANCE_MM), lastX = intervalAt(x.lines, u + CLEARANCE_MM);
    const firstY = intervalAt(y.lines, v - CLEARANCE_MM), lastY = intervalAt(y.lines, v + CLEARANCE_MM);
    for (let j = firstY; j <= lastY; j++) {
      for (let i = firstX; i <= lastX; i++) {
        const next = j * width + i;
        if (mask[next] && labels[next] === labels[cell]) protectedTiles[next] = 1;
      }
    }
  }
}

function findTightSiteReservations({ sites, x, y }: RegionGrid, labels: Int32Array, groups: readonly number[]): Set<Site> {
  const width = x.centers.length;
  const margin = TIGHT_SITE_CLEARANCE_MM;
  const result = new Set<Site>();
  for (const site of sites.values()) {
    const owner = groups[labels[site.cell]];
    if (owner < 0) continue;
    const [u, v] = site.point;
    const firstX = intervalAt(x.lines, u - margin), lastX = intervalAt(x.lines, u + margin);
    const firstY = intervalAt(y.lines, v - margin), lastY = intervalAt(y.lines, v + margin);
    for (let row = firstY; row <= lastY && !result.has(site); row++) {
      const dy = Math.max(0, y.lines[row] - v, v - y.lines[row + 1]);
      for (let col = firstX; col <= lastX; col++) {
        const other = groups[labels[row * width + col]];
        if (other === undefined || other < 0 || other === owner) continue;
        const dx = Math.max(0, x.lines[col] - u, u - x.lines[col + 1]);
        if (dx * dx + dy * dy > margin * margin + EPSILON) continue;
        result.add(site);
        break;
      }
    }
  }
  return result;
}

function reserveSiteAndRowTiles(
  { rows, sites, x, y, mask, neighbors, outlineMargin }: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array, queue: Int32Array, includeBands: boolean, groups: readonly number[], tightSites?: ReadonlySet<Site>,
): Set<Site> {
  const width = x.centers.length;
  const bandSites = new Set<Site>();
  const visited = new Int32Array(labels.length);
  let search = 0;
  function reserve(seeds: Site[], contains: (cell: number) => boolean) {
    search++;
    let end = 0;
    for (const site of seeds) {
      if (visited[site.cell] === search) continue;
      visited[site.cell] = search;
      queue[end++] = site.cell;
    }
    for (let start = 0; start < end; start++) {
      const cell = queue[start];
      protectedTiles[cell] = 1;
      for (let side = 0; side < 4; side++) {
        const next = neighbors[cell * 4 + side];
        if (next === EMPTY || !mask[next] || visited[next] === search
          || labels[next] !== EMPTY && labels[next] !== labels[cell]) continue;
        if (!contains(next)) continue;
        labels[next] = labels[cell];
        visited[next] = search;
        queue[end++] = next;
      }
    }
  }
  if (tightSites) {
    // Give each assigned location room before a whole row can claim the gap.
    // Opposing tip levels share close spacing. Existing Gabriel paths stay fixed.
    const byX = [...sites.values()].sort((a, b) => a.point[0] - b.point[0]);
    let start = 0;
    for (const site of byX) {
      if (!tightSites.has(site)) continue;
      const [u, v] = site.point, group = groups[labels[site.cell]];
      if (group < 0) continue;
      while (byX[start].point[0] < u - 2 * CLEARANCE_MM) start++;
      let radius = CLEARANCE_MM;
      for (let i = start; i < byX.length && byX[i].point[0] <= u + 2 * CLEARANCE_MM; i++) {
        const other = byX[i];
        if (groups[labels[other.cell]] === group) continue;
        radius = Math.min(radius, Math.max(Math.abs(other.point[0] - u), Math.abs(other.point[1] - v)) / 2);
      }
      const left = nearestCut(x.lines, u - radius), right = nearestCut(x.lines, u + radius);
      const top = nearestCut(y.lines, v - radius), bottom = nearestCut(y.lines, v + radius);
      reserve([site], cell => {
        const col = cell % width, row = Math.floor(cell / width);
        return col >= left && col < right && row >= top && row < bottom;
      });
    }
  }
  for (const site of sites.values()) {
    const { clearance, point: [u, v] } = site;
    if (clearance === undefined) continue;
    reserve([site], cell => Math.abs(x.centers[cell % width] - u) <= clearance
      && Math.abs(y.centers[Math.floor(cell / width)] - v) <= clearance);
  }
  if (!includeBands) return bandSites;
  const bands = [...rows].sort((a, b) => Number(Boolean(b.outside)) - Number(Boolean(a.outside)));
  for (const { axis, sites: members, lower, upper, outside } of bands) {
    const across = axis === 0 ? y : x;
    const alongCell = (cell: number) => axis === 0 ? cell % width : Math.floor(cell / width);
    const alongAxis = axis === 0 ? x : y;
    const firstMember = members[0], lastMember = members[members.length - 1];
    const first = outside ? intervalAt(alongAxis.lines, firstMember.point[axis] - outlineMargin) : alongCell(firstMember.cell);
    const last = outside ? intervalAt(alongAxis.lines, lastMember.point[axis] + outlineMargin) : alongCell(lastMember.cell);
    for (const site of members) bandSites.add(site);
    reserve(members, cell => {
      const position = across.centers[axis === 0 ? Math.floor(cell / width) : cell % width];
      const along = alongCell(cell);
      return along >= first && along <= last && position >= lower && position <= upper;
    });
    if (!outside) continue;
    // Extend each cross-section toward the rounded outline using its own row
    // color. Otherwise an unrelated interior color can flood around the end.
    const edge = outside < 0 ? lower : upper;
    const otherEdge = outside < 0 ? upper : lower;
    const start = intervalAt(across.lines, edge);
    const end = intervalAt(across.lines, otherEdge);
    const limit = intervalAt(across.lines, edge + outside * (outlineMargin - CLEARANCE_MM));
    for (let along = first; along <= last; along++) {
      const cellAt = (index: number) => axis === 0 ? index * width + along : along * width + index;
      let anchor = start;
      while (outside * (anchor - end) >= 0 && visited[cellAt(anchor)] !== search) anchor -= outside;
      if (outside * (anchor - end) < 0) continue;
      const label = labels[cellAt(anchor)];
      for (let index = anchor + outside; outside * (index - limit) <= 0; index += outside) {
        const cell = cellAt(index);
        if (labels[cell] !== EMPTY && labels[cell] !== label) break;
        labels[cell] = label;
        protectedTiles[cell] = 1;
      }
    }
  }
  return bandSites;
}

function reserveDenseRowTiles({ sites, x, y, mask, neighbors }: RegionGrid, labels: Int32Array, bandSites: ReadonlySet<Site>) {
  const width = x.centers.length;
  const claims = new Map<number, { label: number; distance: number }>();
  for (const site of sites.values()) {
    if (!site.inDenseRow || bandSites.has(site)) continue;
    const { cell, point: [u, v] } = site;
    for (let side = 0; side < 4; side++) {
      const next = neighbors[cell * 4 + side];
      if (next === EMPTY || !mask[next] || labels[next] !== EMPTY) continue;
      const distance = (x.centers[next % width] - u) ** 2 + (y.centers[Math.floor(next / width)] - v) ** 2;
      if (distance > ROW_BAND_MM ** 2 || distance >= (claims.get(next)?.distance ?? Infinity)) continue;
      claims.set(next, { label: labels[cell], distance });
    }
  }
  for (const [cell, { label }] of claims) labels[cell] = label;
}

function growRegions(labels: Int32Array, neighbors: Int32Array, queue: Int32Array, mask?: Uint8Array) {
  let end = 0;
  for (let cell = 0; cell < labels.length; cell++) {
    if (labels[cell] !== EMPTY) queue[end++] = cell;
  }
  for (let start = 0; start < end; start++) {
    const cell = queue[start];
    for (let side = 0; side < 4; side++) {
      const next = neighbors[cell * 4 + side];
      if (next === EMPTY || (mask && !mask[next]) || labels[next] !== EMPTY) continue;
      labels[next] = labels[cell];
      queue[end++] = next;
    }
  }
}

function traceRegions(
  { x, y, angle, origin }: RegionGrid, labels: Int32Array, groups: number[], count: number,
  onBorder: (line: Line, left: number, right: number) => void,
): RectangularTipLevelRegion[] {
  const result = Array.from({ length: count }, (): RectangularTipLevelRegion => ({ fillRings: [], contours: [] }));
  const width = x.centers.length, height = y.centers.length;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const world = (i: number, j: number): Point => [
    origin[0] + x.lines[i] * cos - y.lines[j] * sin,
    origin[1] + x.lines[i] * sin + y.lines[j] * cos,
  ];
  const groupOf = (label: number) => groups[label] ?? EMPTY;
  const vertexWidth = width + 1;
  const boundary = result.map(() => new Map<number, number>());
  function addEdge(group: number, vertex: number, direction: number) {
    const edges = boundary[group];
    edges.set(vertex, (edges.get(vertex) ?? 0) | (1 << direction));
  }
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const group = groupOf(labels[index]);
      if (group === EMPTY) continue;
      const vertex = row * vertexWidth + col;
      if (row === 0 || groupOf(labels[index - width]) !== group) addEdge(group, vertex, 0);
      if (col === width - 1 || groupOf(labels[index + 1]) !== group) addEdge(group, vertex + 1, 1);
      if (row === height - 1 || groupOf(labels[index + width]) !== group) addEdge(group, vertex + vertexWidth + 1, 2);
      if (col === 0 || groupOf(labels[index - 1]) !== group) addEdge(group, vertex + vertexWidth, 3);
    }
  }
  const step = [1, vertexWidth, -1, -vertexWidth];
  const vertexPoint = (vertex: number) => world(vertex % vertexWidth, Math.floor(vertex / vertexWidth));
  // Trace only the outside of the fill and its holes. Painting touching
  // rectangles exposes antialiasing seams when the project grid is rotated.
  for (const [group, edges] of boundary.entries()) {
    for (const start of edges.keys()) {
      while (edges.has(start)) {
        const ring = [vertexPoint(start)];
        let direction = 0;
        while (!(edges.get(start)! & (1 << direction))) direction++;
        let vertex = start;
        do {
          const remaining = edges.get(vertex)! & ~(1 << direction);
          if (remaining) edges.set(vertex, remaining);
          else edges.delete(vertex);
          vertex += step[direction];
          if (vertex === start) break;
          const exits = edges.get(vertex)!;
          const left = (direction + 1) % 4;
          // Keep corner-touching areas separate at a four-way vertex.
          const next = exits & (1 << left) ? left : exits & (1 << direction) ? direction : (direction + 3) % 4;
          if (next !== direction) ring.push(vertexPoint(vertex));
          direction = next;
        } while (vertex !== start);
        result[group].fillRings.push(ring);
      }
    }
  }
  function traceLines(outer: number, inner: number, cell: (line: number, step: number) => number, vertex: (line: number, step: number) => Point) {
    for (let line = 1; line < outer; line++) {
      for (let start = 0; start < inner;) {
        const left = labels[cell(line - 1, start)], right = labels[cell(line, start)];
        if (left === right) {
          start++;
          continue;
        }
        const a = groupOf(left), b = groupOf(right);
        let end = start + 1;
        while (end < inner && labels[cell(line - 1, end)] === left && labels[cell(line, end)] === right) end++;
        if (left === REPLACED_REGION_TILE || right === REPLACED_REGION_TILE) {
          start = end;
          continue;
        }
        const segment: Line = [vertex(line, start), vertex(line, end)];
        if (Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]) > EPSILON) {
          onBorder(segment, left, right);
          if (a !== b) {
            result[a]?.contours.push(segment);
            result[b]?.contours.push(segment);
          }
        }
        start = end;
      }
    }
  }
  traceLines(width, height, (i, j) => j * width + i, world);
  traceLines(height, width, (j, i) => j * width + i, (j, i) => world(i, j));
  return result;
}
