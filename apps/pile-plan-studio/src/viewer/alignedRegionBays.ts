import { forEachTile, nearestCut } from "./compactRegionBlocks.ts";
import type { RegionGrid } from "./rectangularTipLevelRegions.ts";

type AxisIndex = 0 | 1;
type Site = RegionGrid["sites"] extends Map<number, infer Entry> ? Entry : never;
type Track = { center: number; sites: Site[] };

const TRACK_SPREAD_MM = 1450;
const MIN_TRACK_SUPPORT = 3;

function findTracks(sites: Site[], axis: AxisIndex): Track[] {
  const ordered = [...sites].sort((a, b) => a.point[axis] - b.point[axis]);
  const crossAxis = axis === 0 ? 1 : 0;
  const tracks: Track[] = [];
  for (let start = 0; start < ordered.length;) {
    const first = ordered[start].point[axis];
    let end = start + 1;
    while (end < ordered.length && ordered[end].point[axis] - first <= TRACK_SPREAD_MM) end++;
    const members = ordered.slice(start, end);
    const positions = members.map(site => site.point[crossAxis]).sort((a, b) => a - b);
    let support = 0, last = -Infinity;
    for (const position of positions) {
      if (position - last < 2 * TRACK_SPREAD_MM) continue;
      last = position;
      support++;
    }
    if (support >= MIN_TRACK_SUPPORT) {
      tracks.push({ center: (first + ordered[end - 1].point[axis]) / 2, sites: members });
    }
    start = end;
  }
  return tracks;
}

function bayCuts(tracks: Track[], crossTracks: Track[], perimeter: number[], lines: number[]): number[] {
  const first = tracks[0].center, last = tracks[tracks.length - 1].center;
  const firstPitch = tracks[1].center - first;
  const lastPitch = last - tracks[tracks.length - 2].center;
  const widths = crossTracks.slice(1).map((track, index) => track.center - crossTracks[index].center).sort((a, b) => a - b);
  const bayWidth = widths[Math.floor(widths.length / 2)];
  // An adjacent perimeter band can close the last bay up to one bay width away.
  const startCuts = perimeter.filter(cut => cut < first && cut >= first - Math.max(firstPitch, bayWidth));
  const start = startCuts[startCuts.length - 1];
  const end = perimeter.find(cut => cut > last && cut <= last + Math.max(lastPitch, bayWidth));
  return [
    start ?? first - firstPitch / 2,
    ...tracks.slice(1).map((track, index) => (tracks[index].center + track.center) / 2),
    end ?? last + lastPitch / 2,
  ].map(position => nearestCut(lines, position));
}

export function reserveAlignedBays(grid: RegionGrid, labels: Int32Array, protectedTiles: Uint8Array) {
  const sites = [...grid.sites.values()].filter(site => !site.inDenseRow);
  if (sites.length < MIN_TRACK_SUPPORT ** 2) return;
  const columns = findTracks(sites, 0), rows = findTracks(sites, 1);
  if (columns.length < MIN_TRACK_SUPPORT || rows.length < MIN_TRACK_SUPPORT) return;

  const tracksBySite = (tracks: Track[]) => new Map(tracks.flatMap((track, index) => (
    track.sites.map(site => [site, index] as const)
  )));
  const columnBySite = tracksBySite(columns), rowBySite = tracksBySite(rows);
  const perimeterCuts = (axis: AxisIndex) => grid.rows
    .filter(row => row.outside && row.axis !== axis)
    .map(row => row.outside === 1 ? row.lower : row.upper)
    .sort((a, b) => a - b);
  const xCuts = bayCuts(columns, rows, perimeterCuts(0), grid.x.lines);
  const yCuts = bayCuts(rows, columns, perimeterCuts(1), grid.y.lines);
  const width = grid.x.centers.length;

  const owners = new Map<number, number>();
  for (const site of sites) {
    const col = columnBySite.get(site), row = rowBySite.get(site);
    if (col === undefined || row === undefined) continue;
    const bay = row * columns.length + col;
    const owner = owners.get(bay), label = labels[site.cell];
    owners.set(bay, owner === undefined || owner === label ? label : -1);
  }
  for (const [bay, label] of owners) {
    if (label < 0) continue;
    const col = bay % columns.length, row = Math.floor(bay / columns.length);
    const box = { left: xCuts[col], right: xCuts[col + 1] - 1, top: yCuts[row], bottom: yCuts[row + 1] - 1 };
    let anchored = false;
    const available = forEachTile(box, width, cell => {
      if (!grid.mask[cell] || (labels[cell] >= 0 && labels[cell] !== label)) return false;
      anchored ||= labels[cell] === label;
    });
    if (!available || !anchored) continue;
    forEachTile(box, width, cell => {
      labels[cell] = label;
      protectedTiles[cell] = 1;
    });
  }
}
