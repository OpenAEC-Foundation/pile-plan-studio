import type { RegionGrid, TileBounds } from "./rectangularTipLevelRegions.ts";
import { componentBounds, forEachTile, mergeGridSpans, nearestCut } from "./compactRegionBlocks.ts";

const MAX_CONTINUING_EDGE_SHIFT_MM = 2500;
const MAX_TWO_ENDED_EDGE_SHIFT_MM = 750;

export function alignSharedBoundaries(
  grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array,
  canMove?: (box: TileBounds, donor: number, owner: number, joinsBothEnds: boolean) => boolean,
  levels?: number[],
) {
  const width = grid.x.centers.length;
  const height = grid.y.centers.length;
  const { mask } = grid;

  function alignAlongAxis(horizontal: boolean, commonSide?: 0 | 1) {
    const lineCount = horizontal ? height : width;
    const span = horizontal ? width : height;
    const lines = horizontal ? grid.y.lines : grid.x.lines;
    const axisStride = horizontal ? width : 1;
    const alongStride = horizontal ? 1 : width;
    const index = (axis: number, along: number) => axis * axisStride + along * alongStride;
    const read = (axis: number, along: number) => {
      if (axis < 0 || along < 0 || axis >= lineCount || along >= span) return -1;
      const cell = index(axis, along);
      return mask[cell] ? labels[cell] : -1;
    };
    let changed = false;
    const level = (label: number) => levels?.[label] ?? label;
    const isBoundary = (a: number, b: number) => level(a) >= 0 && level(b) >= 0 && level(a) !== level(b);
    const sameRun = (a: number, b: number, first: number, second: number) => isBoundary(a, b) && (
      commonSide === undefined ? a === first && b === second : commonSide === 0 ? level(a) === level(first) : level(b) === level(second)
    );

    function cornerScore(left: number, right: number, from: number, to: number, replacement?: (along: number) => number) {
      const get = replacement === undefined ? read :
        (axis: number, along: number) => axis >= left && axis < right && along >= from && along < to ? replacement(along) : read(axis, along);
      let score = 0;
      for (let row = from; row <= to; row++) {
        for (let col = left; col <= right; col++) {
          const a = level(get(col - 1, row - 1)), b = level(get(col, row - 1));
          const c = level(get(col, row)), d = level(get(col - 1, row));
          if (a < 0 || b < 0 || c < 0 || d < 0 || a === b && c === d || a === d && b === c) continue;
          const transitions = Number(a !== b) + Number(b !== c) + Number(c !== d) + Number(d !== a);
          score += transitions === 4 ? 4 : transitions - 1;
        }
      }
      return score;
    }

    function candidateOffsets(cut: number, along: number, first: number, second: number, candidates: Map<number, boolean>) {
      const nearby: number[] | undefined = commonSide === undefined ? undefined : [];
      for (const direction of [-1, 1]) {
        for (let other = cut + direction; other > 0 && other < lineCount; other += direction) {
          const distance = nearby ? Math.abs(lines[other] - lines[cut]) : 0;
          if (nearby && distance > MAX_CONTINUING_EDGE_SHIFT_MM) break;
          const a = read(other - 1, along), b = read(other, along);
          if (commonSide === undefined ? a === b : level(a) === level(b)) continue;
          if (nearby && distance <= MAX_TWO_ENDED_EDGE_SHIFT_MM && isBoundary(a, b)) nearby.push(other);
          if (commonSide === undefined ? a === first || b === second
            : isBoundary(a, b) && (level(a) === level(first) || level(b) === level(second))) candidates.set(other, false);
          break;
        }
      }
      return nearby;
    }


    for (let cut = 1; cut < lineCount; cut++) {
      for (let from = 0; from < span;) {
        // Both indices are in range here. Most cell pairs have the same owner.
        const cell = index(cut, from), previous = cell - axisStride;
        const first = labels[previous], second = labels[cell];
        if (first === second || first < 0 || second < 0
          || !mask[previous] || !mask[cell] || !isBoundary(first, second)) {
          from++;
          continue;
        }
        let to = from + 1;
        while (to < span && sameRun(read(cut - 1, to), read(cut, to), first, second)) to++;
        if (from === 0 || to === span) {
          from = to;
          continue;
        }
        const offsets = new Map<number, boolean>();
        const before = candidateOffsets(cut, from - 1, first, second, offsets);
        const after = candidateOffsets(cut, to,
          commonSide === undefined ? first : read(cut - 1, to - 1),
          commonSide === undefined ? second : read(cut, to - 1), offsets);
        if (before && after) for (const target of before) {
          if (after.includes(target)) offsets.set(target, true);
        }
        let best;
        for (const [target, joinsBothEnds] of offsets) {
          const distance = Math.abs(lines[target] - lines[cut]);
          const left = Math.min(cut, target), right = Math.max(cut, target);
          const donorAt = (along: number) => read(target < cut ? cut - 1 : cut, along);
          const ownerAt = (along: number) => read(target < cut ? cut : cut - 1, along);
          const backing = target < cut ? left - 1 : right;
          let free = true;
          const runs: { from: number; to: number; donor: number; owner: number }[] = [];
          for (let along = from; along < to && free; along++) {
            const donor = donorAt(along), owner = ownerAt(along);
            const previous = runs[runs.length - 1];
            if (previous?.donor === donor && previous.owner === owner) previous.to = along + 1;
            else runs.push({ from: along, to: along + 1, donor, owner });
            // When both ends meet the same cut, a donor may taper out along the strip.
            // The surrounding ring still checks that its remaining contacts stay connected.
            if (!joinsBothEnds && read(backing, along) !== donor) {
              free = false;
              break;
            }
            for (let axis = left; axis < right; axis++) {
              if (read(axis, along) !== donor || protectedTiles[index(axis, along)]) {
                free = false;
                break;
              }
            }
          }
          if (!free) continue;
          const gain = cornerScore(left, right, from, to) - cornerScore(left, right, from, to, ownerAt);
          if (gain <= 0 || best && (gain < best.gain || gain === best.gain && distance >= best.distance)) continue;
          if (canMove && runs.some(({ from, to, donor, owner }) => {
            const box = horizontal ? { left: from, right: to - 1, top: left, bottom: right - 1 }
              : { left, right: right - 1, top: from, bottom: to - 1 };
            return !canMove(box, donor, owner, joinsBothEnds);
          })) continue;
          const ring = surroundingTiles(read, { left, right: right - 1, top: from, bottom: to - 1 });
          if (!donorsStayConnected(ring, new Set(runs.map(run => run.donor)))) continue;
          best = { left, right, runs, gain, distance };
        }
        if (best) {
          for (const run of best.runs) for (let along = run.from; along < run.to; along++) {
            for (let axis = best.left; axis < best.right; axis++) labels[index(axis, along)] = run.owner;
          }
          changed = true;
        }
        from = to;
      }
    }
    return changed;
  }

  if (levels) {
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const side of [0, 1] as const) {
        const verticalChanged = alignAlongAxis(false, side);
        const horizontalChanged = alignAlongAxis(true, side);
        changed ||= verticalChanged || horizontalChanged;
      }
      if (!changed) break;
    }
    return;
  }
  for (let pass = 0; pass < 4; pass++) {
    const verticalChanged = alignAlongAxis(false);
    const horizontalChanged = alignAlongAxis(true);
    if (!verticalChanged && !horizontalChanged) break;
  }
}

function surroundingTiles(read: (x: number, y: number) => number, { left, right, top, bottom }: TileBounds) {
  const ring: { label: number; corner: boolean }[] = [];
  const add = (x: number, y: number, corner = false) => ring.push({ label: read(x, y), corner });
  add(left - 1, top - 1, true);
  for (let x = left; x <= right; x++) add(x, top - 1);
  add(right + 1, top - 1, true);
  for (let y = top; y <= bottom; y++) add(right + 1, y);
  add(right + 1, bottom + 1, true);
  for (let x = right; x >= left; x--) add(x, bottom + 1);
  add(left - 1, bottom + 1, true);
  for (let y = bottom; y >= top; y--) add(left - 1, y);
  return ring;
}

// Removing the box preserves each donor when all of its side contacts still
// reach one another along the one-tile ring outside the edited box.
function donorsStayConnected(ring: ReturnType<typeof surroundingTiles>, donors: Set<number>): boolean {
  const start = ring.findIndex(({ label }, index) => label !== ring[(index + ring.length - 1) % ring.length].label);
  if (start < 0) return donors.size === 1 && donors.has(ring[0].label);
  const encountered = new Set<number>();
  for (let step = 0; step < ring.length;) {
    const label = ring[(start + step) % ring.length].label;
    let touchesSide = false;
    do {
      touchesSide ||= !ring[(start + step) % ring.length].corner;
      step++;
    } while (step < ring.length && ring[(start + step) % ring.length].label === label);
    if (touchesSide && donors.has(label)) {
      if (encountered.has(label)) return false;
      encountered.add(label);
    }
  }
  return encountered.size === donors.size;
}

function filledCornerCost(labels: Int32Array, width: number, box: TileBounds, replacement?: number): number {
  const read = (x: number, y: number) => replacement !== undefined
    && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
    ? replacement : labels[y * width + x];
  let total = 0;
  for (let y = box.top; y <= box.bottom + 1; y++) {
    for (let x = box.left; x <= box.right + 1; x++) {
      const a = read(x - 1, y - 1), b = read(x, y - 1), c = read(x, y), d = read(x - 1, y);
      if (a === b && c === d || a === d && b === c) continue;
      if (a === b && a === c || a === b && a === d || a === c && a === d || b === c && b === d) total++;
      else if (a === b || b === c || c === d || d === a) total += 2;
      else total += 4;
    }
  }
  return total;
}

export function fitWholeRectangles(
  grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array, groupByComponent: number[],
) {
  const width = grid.x.centers.length, height = grid.y.centers.length;
  const fixed = protectedTiles.slice();
  const footprint = (box: TileBounds) => (box.right - box.left + 1) * (box.bottom - box.top + 1);
  const boxes = [...componentBounds(grid, labels)].sort(([, a], [, b]) => (
    (footprint(b) - b.count) - (footprint(a) - a.count)
  ));
  const read = (x: number, y: number) => grid.mask[y * width + x] ? labels[y * width + x] : -1;
  for (const [label, box] of boxes) {
    if (groupByComponent[label] < 0 || footprint(box) === box.count
      || box.left === 0 || box.top === 0 || box.right === width - 1 || box.bottom === height - 1) continue;
    const donors = new Set<number>();
    const available = forEachTile(box, width, index => {
      if (!grid.mask[index]) return false;
      if (labels[index] !== label) {
        if (fixed[index] || labels[index] < 0) return false;
        donors.add(labels[index]);
      }
      return true;
    });
    if (!available || donors.size === 0) continue;
    if (filledCornerCost(labels, width, box, label) >= filledCornerCost(labels, width, box)
      || !donorsStayConnected(surroundingTiles(read, box), donors)) continue;
    forEachTile(box, width, index => {
      labels[index] = label;
      fixed[index] = 1;
    });
  }
}

export function fitEnclosedSiteRectangles(
  grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array, groups: readonly number[],
  canMove: (box: TileBounds, donor: number, owner: number) => boolean,
) {
  const { x, y, mask } = grid;
  const width = x.centers.length, height = y.centers.length;
  const footprints = componentBounds(grid, labels);
  const sitesByOwner = new Map<number, number>();
  for (const { cell } of grid.sites.values()) {
    const owner = labels[cell];
    sitesByOwner.set(owner, (sitesByOwner.get(owner) ?? 0) + 1);
  }
  const read = (column: number, row: number) => mask[row * width + column] ? labels[row * width + column] : -1;
  for (const site of grid.sites.values()) {
    const owner = labels[site.cell];
    const box = footprints.get(owner);
    if (!box || sitesByOwner.get(owner) !== 1 || groups[owner] < 0) continue;
    const { left, right, top, bottom, count } = box;
    if (count === (right - left + 1) * (bottom - top + 1)
      || left === 0 || top === 0 || right === width - 1 || bottom === height - 1
      || Math.max(x.lines[right + 1] - x.lines[left], y.lines[bottom + 1] - y.lines[top]) > 2 * grid.outlineMargin) continue;
    const surroundingLevel = groups[read(left - 1, top - 1)];
    if (surroundingLevel === undefined || surroundingLevel < 0 || surroundingLevel === groups[owner]
      || !surroundingTiles(read, box).every(({ label }) => groups[label] === surroundingLevel)
      || !forEachTile(box, width, cell => Boolean(mask[cell])
        && (labels[cell] === owner || groups[labels[cell]] === surroundingLevel))) continue;

    const [u, v] = site.point;
    const column = site.cell % width, row = Math.floor(site.cell / width);
    const cuts = [
      { low: "left", high: "right", lines: x.lines, position: u, tile: column },
      { low: "top", high: "bottom", lines: y.lines, position: v, tile: row },
    ] as const;
    // Keep three sides and try centering the fourth on the one enclosed site.
    const candidates = cuts.flatMap(({ low, high, lines, position, tile }) => {
      const start = nearestCut(lines, 2 * position - lines[box[high] + 1]);
      const end = nearestCut(lines, 2 * position - lines[box[low]]) - 1;
      const moves: { rectangle: TileBounds; trim: TileBounds; side: keyof TileBounds }[] = [];
      if (start > box[low] && start <= tile) moves.push({
        rectangle: { ...box, [low]: start }, trim: { ...box, [high]: start - 1 }, side: low,
      });
      if (end < box[high] && end >= tile) moves.push({
        rectangle: { ...box, [high]: end }, trim: { ...box, [low]: end + 1 }, side: high,
      });
      return moves;
    });
    for (const { rectangle, trim, side } of candidates) {
      const trimmed = changedRectangle(trim, label => label === owner);
      const filled = changedRectangle(rectangle, label => label !== owner);
      if (!trimmed || filled === null) continue;
      const adjacent = sideLabels(trimmed, side);
      const recipient = adjacent[0];
      if (groups[recipient] !== surroundingLevel || adjacent.some(label => label !== recipient)
        || !canMove(trimmed, owner, recipient)) continue;
      const donor = filled ? read(filled.left, filled.top) : -1;
      if (filled && !forEachTile(filled, width, cell => labels[cell] === donor)) continue;
      // Check both rectangular edits and restore the first if the second would cut a connection.
      forEachTile(trimmed, width, cell => { labels[cell] = recipient; });
      if (filled && (!donorsStayConnected(surroundingTiles(read, filled), new Set([donor]))
        || !canMove(filled, donor, owner))) {
        forEachTile(trimmed, width, cell => { labels[cell] = owner; });
        continue;
      }
      if (filled) forEachTile(filled, width, cell => { labels[cell] = owner; });
      break;
    }
  }

  function changedRectangle(box: TileBounds, changes: (label: number) => boolean): TileBounds | null | undefined {
    let left = box.right, right = box.left, top = box.bottom, bottom = box.top, count = 0;
    if (!forEachTile(box, width, cell => {
      if (!changes(labels[cell])) return true;
      const column = cell % width, row = Math.floor(cell / width);
      left = Math.min(left, column); right = Math.max(right, column);
      top = Math.min(top, row); bottom = Math.max(bottom, row);
      count++;
      return !protectedTiles[cell];
    })) return null;
    if (!count) return undefined;
    return count === (right - left + 1) * (bottom - top + 1) ? { left, right, top, bottom } : null;
  }

  function sideLabels(box: TileBounds, side: keyof TileBounds) {
    if (side === "left" || side === "right") {
      const column = box[side] + (side === "left" ? -1 : 1);
      return Array.from({ length: box.bottom - box.top + 1 }, (_, i) => read(column, box.top + i));
    }
    const row = box[side] + (side === "top" ? -1 : 1);
    return Array.from({ length: box.right - box.left + 1 }, (_, i) => read(box.left + i, row));
  }
}

export function expandUndersizedFootprints(
  grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array, groups: readonly number[],
  canMove: (box: TileBounds, donor: number, owner: number) => boolean,
) {
  const { x, y, mask } = grid;
  const width = x.centers.length, height = y.centers.length;
  const footprints = componentBounds(grid, labels);
  const sites = [...grid.sites.values()];
  const counts = new Map<number, number>();
  for (const { cell } of sites) counts.set(labels[cell], (counts.get(labels[cell]) ?? 0) + 1);
  const read = (column: number, row: number) => column >= 0 && column < width && row >= 0 && row < height
    && mask[row * width + column] ? labels[row * width + column] : -1;

  for (const { point: [u, v], cell } of sites) {
    const owner = labels[cell];
    const original = footprints.get(owner);
    if (!original || counts.get(owner) !== 1 || groups[owner] < 0) continue;
    const clearance = (box: TileBounds) => Math.min(
      u - x.lines[box.left], x.lines[box.right + 1] - u,
      v - y.lines[box.top], y.lines[box.bottom + 1] - v,
    );
    const previousClearance = clearance(original);
    if (previousClearance >= grid.outlineMargin / 2) continue;
    const ring = surroundingTiles(read, original);
    const donor = ring[0].label;
    if (donor < 0 || groups[donor] < 0 || groups[donor] === groups[owner]
      || !ring.every(({ label }) => label === donor)) continue;
    let halfWidth = grid.outlineMargin;
    for (const other of sites) {
      if (other.cell === cell) continue;
      halfWidth = Math.min(halfWidth, Math.max(Math.abs(other.point[0] - u), Math.abs(other.point[1] - v)) / 2);
      if (previousClearance >= halfWidth / 2) break;
    }
    if (previousClearance >= halfWidth / 2) continue;
    let preferred: { box: TileBounds; clearance: number; imbalance: number } | undefined;
    for (const radius of [halfWidth, halfWidth * .75, halfWidth * .5]) {
      const box = {
        left: nearestCut(x.lines, u - radius), right: nearestCut(x.lines, u + radius) - 1,
        top: nearestCut(y.lines, v - radius), bottom: nearestCut(y.lines, v + radius) - 1,
      };
      const space = clearance(box);
      if (box.left > original.left || box.right < original.right || box.top > original.top || box.bottom < original.bottom
        || space <= previousClearance) continue;
      const imbalance = Math.abs(x.lines[box.left] + x.lines[box.right + 1] - 2 * u)
        + Math.abs(y.lines[box.top] + y.lines[box.bottom + 1] - 2 * v);
      if (preferred && (preferred.clearance > space || preferred.clearance === space && preferred.imbalance <= imbalance)) continue;
      if (!surroundingTiles(read, box).every(({ label }) => label === donor)) continue;
      if (!forEachTile(box, width, index => Boolean(mask[index])
        && (labels[index] === owner || labels[index] === donor && !protectedTiles[index]))) continue;
      if (canMove(box, donor, owner)) preferred = { box, clearance: space, imbalance };
    }
    if (preferred) {
      forEachTile(preferred.box, width, index => {
        labels[index] = owner;
        protectedTiles[index] = 1;
      });
    }
  }
}

export function flattenNarrowProjections(
  grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array,
  trimming?: {
    groups: readonly number[];
    canMove: (box: TileBounds, donor: number, owner: number) => boolean;
    connections?: Uint8Array;
  },
) {
  const width = grid.x.centers.length, height = grid.y.centers.length;
  const sitesByOwner = new Map<number, [number, number][]>();
  if (trimming) for (const site of grid.sites.values()) {
    const owner = labels[site.cell];
    const members = sitesByOwner.get(owner) ?? [];
    members.push(site.point);
    sitesByOwner.set(owner, members);
  }
  const read = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && grid.mask[y * width + x]
    ? labels[y * width + x] : -1;
  for (const horizontal of [true, false]) {
    const along = horizontal ? grid.x.lines : grid.y.lines;
    const across = horizontal ? grid.y.lines : grid.x.lines;
    const labelAt = horizontal ? read : (p: number, q: number) => read(q, p);
    const boxOf = (from: number, to: number, low: number, high: number): TileBounds => horizontal
      ? { left: from, right: to, top: low, bottom: high }
      : { left: low, right: high, top: from, bottom: to };
    const boxes = mergeGridSpans(width, height, horizontal, index => grid.mask[index] ? labels[index] : -1,
      (start, end) => across[end] - across[start] <= 1500);
    for (const box of boxes) {
      const { label, left, right, top, bottom } = box;
      if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1) continue;
      const from = horizontal ? left : top, to = horizontal ? right : bottom;
      const low = horizontal ? top : left, high = horizontal ? bottom : right;
      const thickness = across[high + 1] - across[low];
      const length = along[to + 1] - along[from];
      if (length < Math.max(3000, 3 * thickness)) continue;
      if (trimming) {
        const { groups, canMove, connections } = trimming;
        const group = (owner: number) => groups[owner] ?? -1;
        const area = group(label);
        if (area < 0 || !forEachTile(box, width, index => labels[index] === label)) continue;
        for (const direction of [1, -1]) {
          const tip = direction === 1 ? from : to;
          const last = direction === 1 ? to : from;
          const slices = [];
          for (let p = tip; direction * (last - p) >= 0; p += direction) {
            // Only trim the unsupported end of the strip, up to its first reservation.
            if (labelAt(p, low - 1) === label || labelAt(p, high + 1) === label
              || !forEachTile(boxOf(p, p, low, high), width, index =>
                labels[index] === label && !protectedTiles[index] && !connections?.[index])) break;
            slices.push(p);
          }
          if (slices.length === 0) continue;
          let best: { gain: number; end: number; siteDistance: number; runs: { box: TileBounds; owner: number }[] } | undefined;
          for (const side of [low - 1, high + 1]) {
            const ends = (p: number, owner: number) => {
              let gain = 0;
              for (let q = low; q <= high; q++) {
                const neighbor = group(labelAt(p, q));
                const difference = Number(neighbor !== area) - Number(neighbor !== group(owner));
                const step = across[q + 1] - across[q];
                gain += difference * step;
              }
              return gain;
            };
            let gain = 0;
            const runs: { from: number; to: number; owner: number }[] = [];
            for (const p of slices) {
              const owner = labelAt(p, side), next = group(owner);
              if (next < 0 || next === area) break;
              const previous = runs[runs.length - 1];
              if (!previous) gain += ends(p - direction, owner);
              else if (group(previous.owner) !== next) gain -= thickness;
              if (previous?.owner === owner) previous.to = p;
              else runs.push({ from: p, to: p, owner });

              const other = group(labelAt(p, side === low - 1 ? high + 1 : low - 1));
              gain += (Number(other !== area) + Number(other === next)) * (along[p + 1] - along[p]);
              if (labelAt(p + direction, side) === owner && p !== slices[slices.length - 1]) continue;
              const total = gain + ends(p + direction, owner);
              const candidate = boxOf(Math.min(tip, p), Math.max(tip, p), low, high);
              if (total < Math.max(1500, 2 * thickness) || best && total < best.gain - 2 * thickness
                || !donorsStayConnected(surroundingTiles(read, candidate), new Set([label]))) continue;
              const edits = runs.map(run => ({
                box: boxOf(Math.min(run.from, run.to), Math.max(run.from, run.to), low, high), owner: run.owner,
              }));
              const sideCut = across[side < low ? low : high + 1];
              // When both choices remove the whole strip, prefer the side with the closer locations
              // unless its extra cross-borders add more than twice the strip's width.
              const siteDistance = p === last ? runs.reduce((sum, run) => {
                const members = sitesByOwner.get(run.owner) ?? [];
                const distance = members.reduce((nearest, point) =>
                  Math.min(nearest, Math.abs(point[horizontal ? 1 : 0] - sideCut)), Infinity);
                const length = along[Math.max(run.from, run.to) + 1] - along[Math.min(run.from, run.to)];
                return sum + distance * length;
              }, 0) : Infinity;
              const improves = !best || (p === best.end && Math.abs(total - best.gain) <= 2 * thickness
                && siteDistance !== best.siteDistance ? siteDistance < best.siteDistance : total > best.gain);
              if (improves && edits.every(edit => canMove(edit.box, label, edit.owner))) {
                best = { gain: total, end: p, siteDistance, runs: edits };
              }
            }
          }
          if (best) for (const edit of best.runs) forEachTile(edit.box, width, index => { labels[index] = edit.owner; });
        }
        continue;
      }
      if (!forEachTile(box, width, index => labels[index] === label && !protectedTiles[index])) continue;

      // A projection can be removed if only one end belongs to its region
      // and a neighboring region runs along one complete side.
      let attachedBefore = false, attachedAfter = false;
      for (let q = low; q <= high; q++) {
        attachedBefore ||= labelAt(from - 1, q) === label;
        attachedAfter ||= labelAt(to + 1, q) === label;
      }
      if (attachedBefore === attachedAfter) continue;
      let best = -1, bestCost = filledCornerCost(labels, width, box);
      for (const side of [low - 1, high + 1]) {
        const neighbor = labelAt(from, side);
        if (neighbor < 0 || neighbor === label) continue;
        let end = from + 1;
        while (end <= to && labelAt(end, side) === neighbor) end++;
        if (end <= to) continue;
        const cost = filledCornerCost(labels, width, box, neighbor);
        if (cost >= bestCost) continue;
        best = neighbor;
        bestCost = cost;
      }
      if (best < 0 || !donorsStayConnected(surroundingTiles(read, box), new Set([label]))) continue;
      forEachTile(box, width, index => { labels[index] = best; });
    }
  }
}

export function widenCrowdedSides(
  grid: RegionGrid, labels: Int32Array, groups: readonly number[],
  canMove: (box: TileBounds, donor: number, owner: number) => boolean,
) {
  const { x, y, mask } = grid;
  const width = x.centers.length, height = y.centers.length;
  const occupied = new Uint8Array(labels.length);
  for (const { cell } of grid.sites.values()) occupied[cell] = 1;
  const at = (col: number, row: number) => col >= 0 && col < width && row >= 0 && row < height
    && mask[row * width + col] ? labels[row * width + col] : -1;
  const level = (label: number) => groups[label] ?? -1;
  for (const { point, cell } of grid.sites.values()) {
    const ownerLevel = level(labels[cell]);
    if (ownerLevel < 0) continue;
    const indexes = [cell % width, Math.floor(cell / width)];
    for (const axis of [0, 1] as const) {
      const lines = axis === 0 ? x.lines : y.lines;
      const across = axis === 0 ? y.lines : x.lines;
      const read = axis === 0 ? at : (a: number, b: number) => at(b, a);
      const along = indexes[1 - axis];
      for (const direction of [-1, 1]) {
        let ownerCell = indexes[axis];
        while (level(read(ownerCell + direction, along)) === ownerLevel
          && Math.abs(lines[ownerCell + Number(direction > 0)] - point[axis]) < 500) ownerCell += direction;
        const cut = ownerCell + Number(direction > 0);
        if (Math.abs(lines[cut] - point[axis]) >= 500) continue;
        const owner = read(ownerCell, along), donor = read(ownerCell + direction, along);
        if (level(donor) < 0 || level(donor) === ownerLevel) continue;
        let from = along, to = along + 1;
        const matches = (i: number) => read(ownerCell, i) === owner && read(ownerCell + direction, i) === donor;
        while (from > 0 && matches(from - 1)) from--;
        while (to + 1 < across.length && matches(to)) to++;
        if (from === 0 || to === across.length - 1 || across[to] - across[from] > 6500) continue;
        // Move the full side so the location gains space without a new step.
        const target = nearestCut(lines, point[axis] + direction * 750);
        for (let next = target; (next - cut) * direction > 0; next -= direction) {
          const start = Math.min(cut, next), end = Math.max(cut, next) - 1;
          const box = axis === 0
            ? { left: start, right: end, top: from, bottom: to - 1 }
            : { left: from, right: to - 1, top: start, bottom: end };
          if (box.left === 0 || box.top === 0 || box.right === width - 1 || box.bottom === height - 1) continue;
          if (!forEachTile(box, width, index => Boolean(mask[index]) && labels[index] === donor && !occupied[index])) continue;
          if (filledCornerCost(labels, width, box, owner) > filledCornerCost(labels, width, box)) continue;
          if (!donorsStayConnected(surroundingTiles(at, box), new Set([donor])) || !canMove(box, donor, owner)) continue;
          forEachTile(box, width, index => { labels[index] = owner; });
          break;
        }
      }
    }
  }
}
