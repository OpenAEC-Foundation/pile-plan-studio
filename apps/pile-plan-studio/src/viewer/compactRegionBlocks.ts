import type { RegionGrid, TileBounds } from "./rectangularTipLevelRegions.ts";

const SQUARE_HALF_WIDTHS = [0.5, 0.375, 0.25];

export function forEachTile(box: TileBounds, width: number, visit: (index: number) => boolean | void): boolean {
  for (let row = box.top; row <= box.bottom; row++) {
    for (let column = box.left; column <= box.right; column++) {
      if (visit(row * width + column) === false) return false;
    }
  }
  return true;
}

export function componentBounds(grid: RegionGrid, labels: Int32Array) {
  const width = grid.x.centers.length;
  const result = new Map<number, TileBounds & { count: number }>();
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    if (label < 0 || !grid.mask[index]) continue;
    const column = index % width, row = Math.floor(index / width);
    const previous = result.get(label);
    if (!previous) {
      result.set(label, { left: column, right: column, top: row, bottom: row, count: 1 });
      continue;
    }
    previous.left = Math.min(previous.left, column);
    previous.right = Math.max(previous.right, column);
    previous.top = Math.min(previous.top, row);
    previous.bottom = Math.max(previous.bottom, row);
    previous.count++;
  }
  return result;
}

function joinBounds(first: TileBounds, second: TileBounds): TileBounds {
  return {
    left: Math.min(first.left, second.left),
    right: Math.max(first.right, second.right),
    top: Math.min(first.top, second.top),
    bottom: Math.max(first.bottom, second.bottom),
  };
}

export function nearestCut(lines: number[], position: number): number {
  let low = 0, high = lines.length - 1;
  while (high - low > 1) {
    const middle = (high + low) >> 1;
    if (lines[middle] < position) low = middle;
    else high = middle;
  }
  return position - lines[low] <= lines[high] - position ? low : high;
}

export function assignCompactRegionBlocks(
  grid: RegionGrid, result: Int32Array, protectedTiles: Uint8Array, groupByComponent: number[],
  fillRemaining: (labels: Int32Array) => void,
) {
  const width = grid.x.centers.length, height = grid.y.centers.length;
  let labels = result;
  const sites = [...grid.sites.values()].map(site => ({ ...site, label: labels[site.cell] }));
  const members = new Map<number, typeof sites>();
  for (const site of sites) {
    const groupSites = members.get(site.label) ?? [];
    groupSites.push(site);
    members.set(site.label, groupSites);
  }

  let bounds: Map<number, TileBounds> = componentBounds(grid, labels);
  const compactSingles = new Set<number>();
  const bandLimits = new Map<number, { x?: [number, number]; y?: [number, number] }>();
  for (const band of grid.rows) {
    if (!band.outside) continue;
    for (const { cell } of band.sites) {
      const limits = bandLimits.get(cell) ?? {};
      limits[band.axis === 0 ? "y" : "x"] = [band.lower, band.upper];
      bandLimits.set(cell, limits);
    }
  }
  const canPaint = (box: TileBounds, label: number) => forEachTile(box, width, index => (
    Boolean(grid.mask[index]) && (labels[index] < 0 || labels[index] === label)
  ));
  function paint(box: TileBounds, label: number, protect = false) {
    forEachTile(box, width, index => {
      labels[index] = label;
      if (protect) protectedTiles[index] = 1;
    });
    bounds.set(label, joinBounds(bounds.get(label)!, box));
  }

  // Give each location room inside its own Gabriel component even when
  // space beyond its footprint is assigned to a neighboring component.
  for (const site of sites) {
    if (groupByComponent[site.label] < 0) continue;
    const [x, y] = site.point;
    let spacing = Infinity;
    for (const other of sites) {
      if (other.label === site.label) continue;
      const [otherX, otherY] = other.point;
      spacing = Math.min(spacing, Math.max(Math.abs(x - otherX), Math.abs(y - otherY)));
    }
    if (!Number.isFinite(spacing)) continue;
    const column = site.cell % width, row = Math.floor(site.cell / width);
    const limit = bandLimits.get(site.cell);
    for (const ratio of SQUARE_HALF_WIDTHS) {
      const halfWidth = spacing * ratio;
      const box = {
        left: Math.min(column, nearestCut(grid.x.lines, Math.max(x - halfWidth, limit?.x?.[0] ?? -Infinity))),
        right: Math.max(column, nearestCut(grid.x.lines, Math.min(x + halfWidth, limit?.x?.[1] ?? Infinity)) - 1),
        top: Math.min(row, nearestCut(grid.y.lines, Math.max(y - halfWidth, limit?.y?.[0] ?? -Infinity))),
        bottom: Math.max(row, nearestCut(grid.y.lines, Math.min(y + halfWidth, limit?.y?.[1] ?? Infinity)) - 1),
      };
      if (!canPaint(box, site.label)) continue;
      paint(box, site.label, true);
      if (members.get(site.label)?.length === 1) compactSingles.add(site.label);
      break;
    }
  }

  for (const [label, groupSites] of members) {
    if (groupSites.length < 2 || groupByComponent[label] < 0) continue;
    const box = bounds.get(label)!;
    if (canPaint(box, label)) paint(box, label, true);
  }

  const physicalWidth = (box: TileBounds) => grid.x.lines[box.right + 1] - grid.x.lines[box.left];
  const physicalHeight = (box: TileBounds) => grid.y.lines[box.bottom + 1] - grid.y.lines[box.top];
  const area = (box: TileBounds) => physicalWidth(box) * physicalHeight(box);
  const footprints = new Map(bounds);
  const distanceFromFootprint = (label: number, x: number, y: number) => {
    const box = footprints.get(label)!;
    return Math.max(0, grid.x.lines[box.left] - x, x - grid.x.lines[box.right + 1],
      grid.y.lines[box.top] - y, y - grid.y.lines[box.bottom + 1]);
  };
  const horizontal = emptyBlocks(false), vertical = emptyBlocks(true);
  if (horizontal.length === 0) return;
  labels = result.slice();
  bounds = new Map(footprints);
  assignBlocks(horizontal);
  const horizontalLabels = labels;
  labels = result;
  bounds = new Map(footprints);
  assignBlocks(vertical);
  if (layoutScore(horizontalLabels) <= layoutScore(labels)) result.set(horizontalLabels);

  function assignBlocks(gaps: TileBounds[]) {
    gaps.sort((a, b) => area(b) - area(a));
    for (let pass = 0; pass < 4 && gaps.length; pass++) {
      const deferred: TileBounds[] = [];
      for (const box of gaps) {
        if (!assignBlock(box)) deferred.push(box);
      }
      if (deferred.length === gaps.length) break;
      gaps = deferred;
    }
    fillRemaining(labels);
  }

  function assignBlock(box: TileBounds): boolean {
    function cost(part: TileBounds, label: number, contact: number) {
      const shortSide = Math.min(physicalWidth(part), physicalHeight(part));
      const x = (grid.x.lines[part.left] + grid.x.lines[part.right + 1]) / 2;
      const y = (grid.y.lines[part.top] + grid.y.lines[part.bottom + 1]) / 2;
      const reach = distanceFromFootprint(label, x, y) / 4000;
      const shape = compactSingles.has(label) ? displacement(label, part) : 0;
      return reach + 1.2 * shape - Math.log1p(contact / shortSide);
    }
    let bestLabel = -1, bestCost = Infinity;
    for (const [label, contact] of contactLengths(box)) {
      const score = cost(box, label, contact);
      if (score >= bestCost) continue;
      bestLabel = label;
      bestCost = score;
    }
    if (bestLabel < 0) return false;

    let bestSplit: { first: TileBounds; second: TileBounds; a: number; b: number } | undefined;
    const totalArea = area(box);
    const read = (column: number, row: number) => column < 0 || column >= width || row < 0 || row >= height
      || !grid.mask[row * width + column] ? -1 : labels[row * width + column];
    for (const vertical of [true, false]) {
      const start = vertical ? box.left : box.top;
      const end = vertical ? box.right : box.bottom;
      const lines = vertical ? grid.x.lines : grid.y.lines;
      const outside = vertical ? [box.top - 1, box.bottom + 1] : [box.left - 1, box.right + 1];
      if (lines[end + 1] - lines[start] < 4000) continue;
      for (let cut = start + 1; cut <= end; cut++) {
        if (Math.min(lines[cut] - lines[start], lines[end + 1] - lines[cut]) < 1000) continue;
        for (const side of outside) {
          const a = vertical ? read(cut - 1, side) : read(side, cut - 1);
          const b = vertical ? read(cut, side) : read(side, cut);
          if (a < 0 || b < 0 || a === b) continue;
          const first = vertical ? { ...box, right: cut - 1 } : { ...box, bottom: cut - 1 };
          const second = vertical ? { ...box, left: cut } : { ...box, top: cut };
          // Both halves extend their existing neighbor. Charge for the extra
          // boundary and keep the best whole-block option when scores tie.
          const score = (area(first) * cost(first, a, contactLengths(first).get(a)!)
            + area(second) * cost(second, b, contactLengths(second).get(b)!)) / totalArea + 0.1;
          if (score >= bestCost) continue;
          bestCost = score;
          bestSplit = { first, second, a, b };
        }
      }
    }
    if (bestSplit) {
      paint(bestSplit.first, bestSplit.a);
      paint(bestSplit.second, bestSplit.b);
    } else {
      paint(box, bestLabel);
    }
    return true;
  }

  function layoutScore(map: Int32Array): number {
    const read = (x: number, y: number) => grid.mask[y * width + x] ? map[y * width + x] : -1;
    let bends = 0, overhang = 0;
    for (let y = 1; y < height; y++) {
      for (let x = 1; x < width; x++) {
        const a = read(x - 1, y - 1), b = read(x, y - 1), c = read(x, y), d = read(x - 1, y);
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        if (Number(a !== b) + Number(b !== c) + Number(c !== d) + Number(d !== a) === 2
          && !(a === b && c === d || a === d && b === c)) bends++;
      }
    }
    // Measure narrow stretches on the finished map, so adjacent rectangles
    // of the same component count as one span.
    for (const vertical of [true, false]) {
      const along = vertical ? grid.y : grid.x, across = vertical ? grid.x : grid.y;
      const labelAt = vertical ? (p: number, q: number) => read(q, p) : read;
      for (let q = 0; q < across.centers.length; q++) {
        for (let p = 0; p < along.centers.length;) {
          const label = labelAt(p, q);
          let end = p + 1;
          while (end < along.centers.length && labelAt(end, q) === label) end++;
          const span = along.lines[end] - along.lines[p];
          if (label >= 0 && span < 2000) {
            const center = (along.lines[p] + along.lines[end]) / 2;
            const [x, y] = vertical ? [across.centers[q], center] : [center, across.centers[q]];
            const distance = distanceFromFootprint(label, x, y);
            overhang += span * (across.lines[q + 1] - across.lines[q]) / 1_000_000 * Math.max(0, distance / 3000 - 1);
          }
          p = end;
        }
      }
    }
    return bends + overhang;
  }

  function emptyBlocks(vertical: boolean): TileBounds[] {
    return mergeGridSpans(width, height, vertical, index => grid.mask[index] && labels[index] < 0 ? 0 : -1);
  }

  function contactLengths(box: TileBounds): Map<number, number> {
    const adjacent = new Map<number, number>();
    function register(index: number, length: number) {
      if (!grid.mask[index] || labels[index] < 0) return;
      const label = labels[index];
      adjacent.set(label, (adjacent.get(label) ?? 0) + length);
    }
    for (let row = box.top; row <= box.bottom; row++) {
      const length = grid.y.lines[row + 1] - grid.y.lines[row];
      if (box.left > 0) register(row * width + box.left - 1, length);
      if (box.right + 1 < width) register(row * width + box.right + 1, length);
    }
    for (let column = box.left; column <= box.right; column++) {
      const length = grid.x.lines[column + 1] - grid.x.lines[column];
      register((box.top - 1) * width + column, length);
      register((box.bottom + 1) * width + column, length);
    }
    return adjacent;
  }

  function displacement(label: number, box: TileBounds): number {
    const { point: [x, y] } = members.get(label)![0];
    const combined = joinBounds(bounds.get(label)!, box);
    const w = physicalWidth(combined), h = physicalHeight(combined);
    const shift = Math.abs(2 * x - grid.x.lines[combined.left] - grid.x.lines[combined.right + 1]) / w
      + Math.abs(2 * y - grid.y.lines[combined.top] - grid.y.lines[combined.bottom + 1]) / h;
    return shift + 1 - Math.min(w, h) / Math.max(w, h);
  }
}

export function mergeGridSpans(
  width: number, height: number, vertical: boolean, read: (index: number) => number,
  includeSpan?: (start: number, end: number) => boolean,
): (TileBounds & { label: number })[] {
  const along = vertical ? height : width, across = vertical ? width : height;
  const indexAt = (p: number, q: number) => vertical ? p * width + q : q * width + p;
  const result: (TileBounds & { label: number })[] = [];
  let previous = new Map<string, (typeof result)[number]>();
  for (let q = 0; q < across; q++) {
    const current = new Map<string, (typeof result)[number]>();
    for (let p = 0; p < along;) {
      const label = read(indexAt(p, q));
      if (label < 0) {
        p++;
        continue;
      }
      let end = p + 1;
      while (end < along && read(indexAt(end, q)) === label) end++;
      if (includeSpan && !includeSpan(p, end)) {
        p = end;
        continue;
      }
      const key = `${label}:${p}:${end}`;
      let box = previous.get(key);
      if (box) {
        if (vertical) box.right = q;
        else box.bottom = q;
      } else {
        box = vertical
          ? { left: q, right: q, top: p, bottom: end - 1, label }
          : { left: p, right: end - 1, top: q, bottom: q, label };
        result.push(box);
      }
      current.set(key, box);
      p = end;
    }
    previous = current;
  }
  return result;
}
